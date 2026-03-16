"""Bridge runner — main event loop for gage data collection.

Handles serial port failures gracefully: individual port errors do not
crash the entire bridge.  Failed ports are retried every 60 seconds so
that hot-plugged USB devices are picked up automatically.
"""
import json
import logging
import os
import signal
import threading
import time
from pathlib import Path

from cassini_bridge.config import PortConfig, load_from_api, load_from_yaml
from cassini_bridge.mqtt_publisher import GageMQTTPublisher
from cassini_bridge.offline_buffer import OfflineBuffer
from cassini_bridge.parsers import GageParser, create_parser
from cassini_bridge.serial_reader import SerialReader

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# How often to retry ports that exhausted their reconnection attempts.
_FAILED_PORT_RETRY_INTERVAL = 60.0


def _build_reader(port_cfg: PortConfig) -> SerialReader:
    """Create a ``SerialReader`` from a ``PortConfig``."""
    return SerialReader(
        port=port_cfg.port_name,
        baud_rate=port_cfg.baud_rate,
        data_bits=port_cfg.data_bits,
        parity=port_cfg.parity,
        stop_bits=port_cfg.stop_bits,
    )


def run_bridge(server_url: str | None = None, api_key: str | None = None, config_file: str | None = None):
    """Run the bridge agent."""

    # Load config
    if config_file:
        config = load_from_yaml(Path(config_file))
    elif server_url and api_key:
        config = load_from_api(server_url, api_key)
    else:
        print("Error: Provide either --server + --api-key or --config")
        return

    if not config.ports:
        print("No active ports configured. Nothing to do.")
        return

    # Set up offline buffer for store-and-forward
    data_dir = Path(os.environ.get("CASSINI_BRIDGE_DATA_DIR", "data"))
    buffer_path = os.environ.get(
        "CASSINI_BRIDGE_BUFFER_PATH",
        str(data_dir / "offline_buffer.db"),
    )
    offline_buffer = OfflineBuffer(
        db_path=buffer_path,
        max_records=int(os.environ.get("CASSINI_BRIDGE_BUFFER_MAX_RECORDS", "100000")),
        max_size_mb=int(os.environ.get("CASSINI_BRIDGE_BUFFER_MAX_SIZE_MB", "500")),
    )
    buffered_count = offline_buffer.count()
    if buffered_count > 0:
        logger.info("Offline buffer has %d reading(s) from previous session", buffered_count)

    # Set up MQTT
    publisher = GageMQTTPublisher(
        host=config.mqtt_host,
        port=config.mqtt_port,
        username=config.mqtt_username,
        password=config.mqtt_password,
        client_id=f"cassini-bridge-{config.bridge_id}",
        use_tls=config.mqtt_use_tls,
        ca_cert_pem=config.mqtt_ca_cert_pem,
        client_cert_pem=config.mqtt_client_cert_pem,
        client_key_pem=config.mqtt_client_key_pem,
        tls_insecure=config.mqtt_tls_insecure,
    )

    # Hook: flush offline buffer on MQTT reconnect before accepting new readings
    original_on_connect = publisher._on_connect

    def _on_connect_with_flush(client, userdata, flags, reason_code, properties):
        original_on_connect(client, userdata, flags, reason_code, properties)
        if reason_code == 0:
            flushed = offline_buffer.flush(client)
            if flushed:
                logger.info("Flushed %d offline-buffered reading(s) on reconnect", flushed)

    publisher.client.on_connect = _on_connect_with_flush
    publisher.connect()

    # Heartbeat topic
    heartbeat_topic = f"cassini/gage/{config.bridge_id}/heartbeat"

    # Set up serial readers + parsers for each active port
    #   active  — ports that are open and being polled
    #   deferred — ports that failed to open initially (retried periodically)
    active: list[tuple[SerialReader, GageParser, str]] = []
    deferred: list[tuple[SerialReader, GageParser, str]] = []

    for port_cfg in config.ports:
        if not port_cfg.is_active:
            continue
        reader = _build_reader(port_cfg)
        parser = create_parser(port_cfg.protocol_profile, port_cfg.parse_pattern)
        try:
            reader.open()
            active.append((reader, parser, port_cfg.mqtt_topic))
            logger.info("Listening on %s -> %s", port_cfg.port_name, port_cfg.mqtt_topic)
        except (Exception,) as exc:
            logger.error("Failed to open %s: %s — will retry periodically", port_cfg.port_name, exc)
            deferred.append((reader, parser, port_cfg.mqtt_topic))

    if not active and not deferred:
        print("No ports could be opened or deferred. Exiting.")
        publisher.disconnect()
        return

    if not active:
        logger.warning(
            "No ports opened successfully. %d port(s) deferred — bridge will keep running and retry.",
            len(deferred),
        )

    # Graceful shutdown
    shutdown = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: shutdown.set())
    signal.signal(signal.SIGTERM, lambda *_: shutdown.set())

    # Heartbeat thread
    def heartbeat_loop():
        while not shutdown.is_set():
            publisher.publish_heartbeat(heartbeat_topic, "online")
            shutdown.wait(config.heartbeat_interval)

    hb_thread = threading.Thread(target=heartbeat_loop, daemon=True)
    hb_thread.start()

    print(f"Bridge running ({len(active)} port(s) active, {len(deferred)} deferred). Ctrl+C to stop.")

    # Main read loop
    last_failed_retry = time.monotonic()
    try:
        while not shutdown.is_set():
            # ----------------------------------------------------------
            # Poll active readers
            # ----------------------------------------------------------
            for reader, parser, topic in active:
                line = reader.readline()
                if line:
                    value = parser.parse(line)
                    if value is not None:
                        measurement_ts = time.time()
                        if publisher._connected:
                            publisher.publish_value(topic, value)
                            logger.debug("Published %.4f to %s", value, topic)
                        else:
                            # Store in offline buffer with original measurement timestamp
                            payload = json.dumps({"value": value, "timestamp": measurement_ts})
                            offline_buffer.store(topic, payload, measurement_ts)
                            logger.debug(
                                "MQTT offline — buffered %.4f for %s (buffer=%d)",
                                value,
                                topic,
                                offline_buffer.count(),
                            )

            # ----------------------------------------------------------
            # Promote reconnected ports / demote failed ports
            # ----------------------------------------------------------
            # Move any reader that just failed (exhausted reconnection)
            # from active to deferred, and vice-versa for recovered ones.
            still_active: list[tuple[SerialReader, GageParser, str]] = []
            for entry in active:
                reader = entry[0]
                if reader.is_failed:
                    logger.warning(
                        "Port %s exhausted reconnection attempts — moved to deferred retry",
                        reader.port,
                    )
                    deferred.append(entry)
                else:
                    still_active.append(entry)
            active = still_active

            # ----------------------------------------------------------
            # Periodically retry deferred (failed) ports
            # ----------------------------------------------------------
            now = time.monotonic()
            if deferred and (now - last_failed_retry) >= _FAILED_PORT_RETRY_INTERVAL:
                last_failed_retry = now
                still_deferred: list[tuple[SerialReader, GageParser, str]] = []
                for entry in deferred:
                    reader = entry[0]
                    if reader.retry_open():
                        logger.info(
                            "Deferred port %s recovered — resuming reads",
                            reader.port,
                        )
                        active.append(entry)
                    else:
                        still_deferred.append(entry)
                deferred = still_deferred

                if active:
                    logger.info(
                        "Port status: %d active, %d deferred",
                        len(active),
                        len(deferred),
                    )
    finally:
        publisher.publish_heartbeat(heartbeat_topic, "offline")
        for reader, _, _ in active:
            reader.close()
        for reader, _, _ in deferred:
            reader.close()
        publisher.disconnect()
        print("Bridge stopped.")
