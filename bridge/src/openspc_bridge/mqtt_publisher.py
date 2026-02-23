"""MQTT publisher for gage readings and heartbeat."""
import json
import logging
import time
import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)


class GageMQTTPublisher:
    """Publishes gage readings and heartbeat to MQTT broker."""

    def __init__(self, host: str, port: int = 1883, username: str | None = None, password: str | None = None, client_id: str = "openspc-bridge"):
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)
        if username:
            self.client.username_pw_set(username, password)
        self._host = host
        self._port = port

    def connect(self) -> None:
        self.client.connect(self._host, self._port, keepalive=60)
        self.client.loop_start()
        logger.info("Connected to MQTT broker %s:%d", self._host, self._port)

    def disconnect(self) -> None:
        self.client.loop_stop()
        self.client.disconnect()

    def publish_value(self, topic: str, value: float) -> None:
        payload = json.dumps({"value": value, "timestamp": time.time()})
        self.client.publish(topic, payload, qos=1)

    def publish_heartbeat(self, topic: str, status: str = "online") -> None:
        payload = json.dumps({"status": status, "timestamp": time.time()})
        self.client.publish(topic, payload, qos=0)
