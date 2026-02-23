"""Bridge configuration — pull from server API or load from local YAML."""
import logging
from dataclasses import dataclass, field
from pathlib import Path

import httpx
import yaml

logger = logging.getLogger(__name__)


@dataclass
class PortConfig:
    port_name: str
    baud_rate: int = 9600
    data_bits: int = 8
    parity: str = "none"
    stop_bits: float = 1.0
    protocol_profile: str = "generic"
    parse_pattern: str | None = None
    mqtt_topic: str = ""
    is_active: bool = True


@dataclass
class BridgeConfig:
    bridge_id: int = 0
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str | None = None
    mqtt_password: str | None = None
    heartbeat_interval: int = 30
    ports: list[PortConfig] = field(default_factory=list)


def load_from_api(server_url: str, api_key: str) -> BridgeConfig:
    """Pull configuration from OpenSPC server API."""
    headers = {"Authorization": f"Bearer {api_key}"}
    resp = httpx.get(f"{server_url}/api/v1/gage-bridges/my-config", headers=headers, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    mqtt = data.get("mqtt") or {}
    config = BridgeConfig(
        bridge_id=data["bridge_id"],
        mqtt_host=mqtt.get("host", "localhost"),
        mqtt_port=mqtt.get("port", 1883),
        mqtt_username=mqtt.get("username"),
        mqtt_password=mqtt.get("password"),
        heartbeat_interval=data.get("heartbeat_interval", 30),
    )
    for p in data.get("ports", []):
        config.ports.append(PortConfig(
            port_name=p["port_name"],
            baud_rate=p.get("baud_rate", 9600),
            data_bits=p.get("data_bits", 8),
            parity=p.get("parity", "none"),
            stop_bits=p.get("stop_bits", 1.0),
            protocol_profile=p.get("protocol_profile", "generic"),
            parse_pattern=p.get("parse_pattern"),
            mqtt_topic=p["mqtt_topic"],
            is_active=p.get("is_active", True),
        ))
    return config


def load_from_yaml(path: Path) -> BridgeConfig:
    """Load configuration from local YAML file."""
    with open(path) as f:
        raw = yaml.safe_load(f)

    config = BridgeConfig(
        bridge_id=raw.get("bridge_id", 0),
        mqtt_host=raw.get("mqtt", {}).get("host", "localhost"),
        mqtt_port=raw.get("mqtt", {}).get("port", 1883),
        mqtt_username=raw.get("mqtt", {}).get("username"),
        mqtt_password=raw.get("mqtt", {}).get("password"),
    )
    for p in raw.get("ports", []):
        config.ports.append(PortConfig(**p))
    return config
