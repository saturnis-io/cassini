"""Bridge runner — main event loop for gage data collection."""
import logging
import signal
import threading
import time
from pathlib import Path

from openspc_bridge.config import BridgeConfig, load_from_api, load_from_yaml
from openspc_bridge.mqtt_publisher import GageMQTTPublisher
from openspc_bridge.parsers import create_parser
from openspc_bridge.serial_reader import SerialReader

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


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

    # Set up MQTT
    publisher = GageMQTTPublisher(
        host=config.mqtt_host,
        port=config.mqtt_port,
        username=config.mqtt_username,
        password=config.mqtt_password,
        client_id=f"openspc-bridge-{config.bridge_id}",
    )
    publisher.connect()

    # Heartbeat topic
    heartbeat_topic = f"openspc/gage/{config.bridge_id}/heartbeat"

    # Set up serial readers + parsers for each active port
    readers: list[tuple[SerialReader, object, str]] = []
    for port_cfg in config.ports:
        if not port_cfg.is_active:
            continue
        reader = SerialReader(
            port=port_cfg.port_name,
            baud_rate=port_cfg.baud_rate,
            data_bits=port_cfg.data_bits,
            parity=port_cfg.parity,
            stop_bits=port_cfg.stop_bits,
        )
        parser = create_parser(port_cfg.protocol_profile, port_cfg.parse_pattern)
        try:
            reader.open()
            readers.append((reader, parser, port_cfg.mqtt_topic))
            logger.info("Listening on %s → %s", port_cfg.port_name, port_cfg.mqtt_topic)
        except Exception as e:
            logger.error("Failed to open %s: %s", port_cfg.port_name, e)

    if not readers:
        print("No ports could be opened. Exiting.")
        publisher.disconnect()
        return

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

    print(f"Bridge running ({len(readers)} port(s)). Ctrl+C to stop.")

    # Main read loop
    try:
        while not shutdown.is_set():
            for reader, parser, topic in readers:
                line = reader.readline()
                if line:
                    value = parser.parse(line)
                    if value is not None:
                        publisher.publish_value(topic, value)
                        logger.debug("Published %.4f to %s", value, topic)
    finally:
        publisher.publish_heartbeat(heartbeat_topic, "offline")
        for reader, _, _ in readers:
            reader.close()
        publisher.disconnect()
        print("Bridge stopped.")
