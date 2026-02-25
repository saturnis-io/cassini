"""MQTT publisher for gage readings and heartbeat."""
import json
import logging
import threading
import time

import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)


class GageMQTTPublisher:
    """Publishes gage readings and heartbeat to MQTT broker.

    Includes automatic reconnection with exponential backoff when the
    broker disconnects unexpectedly.
    """

    def __init__(
        self,
        host: str,
        port: int = 1883,
        username: str | None = None,
        password: str | None = None,
        client_id: str = "cassini-bridge",
    ):
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)
        if username:
            self.client.username_pw_set(username, password)
        self._host = host
        self._port = port

        # Reconnection state
        self._reconnect_delay = 1.0
        self._max_reconnect_delay = 60.0
        self._max_reconnect_attempts = 30
        self._reconnect_count = 0
        self._connected = False

        # Wire up callbacks (VERSION2 signatures: client, userdata, flags, reason_code, properties)
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect

    def _on_connect(
        self,
        client: mqtt.Client,
        userdata: object,
        flags: mqtt.ConnectFlags,
        reason_code: mqtt.ReasonCode,
        properties: object,
    ) -> None:
        """Called when the broker accepts (or rejects) the connection."""
        if reason_code == 0:
            was_reconnect = self._reconnect_count > 0
            self._connected = True
            self._reconnect_delay = 1.0
            self._reconnect_count = 0
            if was_reconnect:
                logger.info("MQTT reconnected to %s:%d", self._host, self._port)
            else:
                logger.info("MQTT connected to %s:%d", self._host, self._port)
        else:
            logger.error("MQTT connect failed: reason_code=%s", reason_code)

    def _on_disconnect(
        self,
        client: mqtt.Client,
        userdata: object,
        flags: mqtt.DisconnectFlags,
        reason_code: mqtt.ReasonCode,
        properties: object,
    ) -> None:
        """Called when the broker disconnects.

        rc=0 means a clean disconnect (we called disconnect()). Non-zero
        means the connection was lost unexpectedly and we should reconnect.
        """
        self._connected = False
        if reason_code != 0:
            logger.warning(
                "MQTT disconnected unexpectedly (reason_code=%s), scheduling reconnect...",
                reason_code,
            )
            self._schedule_reconnect()

    def _schedule_reconnect(self) -> None:
        """Spawn a daemon thread that waits then attempts reconnection."""
        if self._reconnect_count >= self._max_reconnect_attempts:
            logger.error(
                "Max MQTT reconnection attempts (%d) reached, giving up",
                self._max_reconnect_attempts,
            )
            return

        delay = self._reconnect_delay

        def _attempt() -> None:
            time.sleep(delay)
            self._reconnect_count += 1
            try:
                self.client.reconnect()
                # on_connect callback will fire if successful
            except Exception as exc:
                logger.warning(
                    "MQTT reconnect attempt %d/%d failed: %s",
                    self._reconnect_count,
                    self._max_reconnect_attempts,
                    type(exc).__name__,
                )
                self._reconnect_delay = min(
                    self._reconnect_delay * 2, self._max_reconnect_delay
                )
                self._schedule_reconnect()

        threading.Thread(target=_attempt, daemon=True, name="mqtt-reconnect").start()

    def connect(self) -> None:
        self.client.connect(self._host, self._port, keepalive=60)
        self.client.loop_start()
        # Note: _on_connect callback sets self._connected = True asynchronously

    def disconnect(self) -> None:
        self._connected = False
        self.client.loop_stop()
        self.client.disconnect()

    def publish_value(self, topic: str, value: float) -> None:
        if not self._connected:
            logger.warning("MQTT not connected, skipping publish to %s", topic)
            return
        payload = json.dumps({"value": value, "timestamp": time.time()})
        self.client.publish(topic, payload, qos=1)

    def publish_heartbeat(self, topic: str, status: str = "online") -> None:
        if not self._connected:
            logger.warning("MQTT not connected, skipping heartbeat to %s", topic)
            return
        payload = json.dumps({"status": status, "timestamp": time.time()})
        self.client.publish(topic, payload, qos=0)
