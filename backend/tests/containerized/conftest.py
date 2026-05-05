"""Pytest fixtures for containerized integration tests.

All fixtures in this module spin real Docker containers via testcontainers-python.
Tests using these fixtures must be marked @pytest.mark.containerized and are
opt-in: the default ``pytest`` invocation (no -m flag) never runs them.

Skip-guard pattern:
- testcontainers import is attempted at module level with a try/except.
- Docker availability is checked lazily inside each fixture with
  ``pytest.skip()``.
- No network calls are made during collection.

Usage:
    pip install -e ".[test-containerized]"
    pytest apps/cassini/backend/tests/containerized -m containerized
    pytest -m "containerized and live_broker"
"""

from __future__ import annotations

import os
import socket
import tempfile
import time
from collections.abc import AsyncGenerator, Generator
from typing import Any

import pytest

# Soft guard: check whether testcontainers is importable.  We do NOT use
# pytest.importorskip() here because that raises Skipped at module level,
# which prevents pytest from even collecting the test IDs during --collect-only.
try:
    import testcontainers  # noqa: F401  # type: ignore[import-untyped]

    _TESTCONTAINERS_AVAILABLE = True
except ImportError:
    _TESTCONTAINERS_AVAILABLE = False


def _docker_available() -> bool:
    """Return True when the Docker daemon is reachable.

    Probes the Unix socket (Linux/Mac/WSL2) and falls back to the Docker SDK
    ping on Windows.  Does NOT make any network call to the internet.
    """
    if os.path.exists("/var/run/docker.sock"):
        return True
    try:
        import docker  # type: ignore[import-untyped]

        client = docker.from_env()
        client.ping()
        client.close()
        return True
    except Exception:
        return False


def _require_containers() -> None:
    """Skip the calling fixture/test if containers are unavailable."""
    if not _TESTCONTAINERS_AVAILABLE:
        pytest.skip("testcontainers package not installed — run: pip install -e '.[test-containerized]'")
    if not _docker_available():
        pytest.skip("Docker is not available in this environment")


def _free_port() -> int:
    """Find an ephemeral free TCP port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


# ---------------------------------------------------------------------------
# Database URL fixture — parametrized over all supported dialects
# ---------------------------------------------------------------------------

_SQLITE_PARAM = "sqlite"
_PG_PARAM = "postgresql"
_MYSQL_PARAM = "mysql"
_MSSQL_PARAM = "mssql"

# Session-scoped container singletons — one container per dialect per session.
_pg_container: Any = None
_mysql_container: Any = None
_mssql_container: Any = None


@pytest.fixture(
    scope="session",
    params=[_SQLITE_PARAM, _PG_PARAM, _MYSQL_PARAM, _MSSQL_PARAM],
    ids=["sqlite", "postgresql", "mysql", "mssql"],
)
def cassini_db_url(request: pytest.FixtureRequest) -> Generator[str, None, None]:
    """Yield an async SQLAlchemy database URL for the parametrized dialect.

    SQLite uses a temporary file (no container).
    PostgreSQL, MySQL, MSSQL each spin a testcontainers container scoped to
    the test session (one container reused across all tests in that session).

    Docker-compose service dependencies: postgres, mysql, mssql — but this
    fixture launches its own containers independently of docker-compose.
    """
    param = request.param

    if param == _SQLITE_PARAM:
        # SQLite requires no Docker.
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name
        url = f"sqlite+aiosqlite:///{db_path}"
        yield url
        try:
            os.unlink(db_path)
        except OSError:
            pass
        return

    _require_containers()

    if param == _PG_PARAM:
        global _pg_container
        if _pg_container is None:
            from testcontainers.postgres import PostgresContainer  # type: ignore[import-untyped]

            _pg_container = PostgresContainer(
                image="postgres:16-alpine",
                username="cassini",
                password="cassini_test",
                dbname="cassini_test",
            )
            _pg_container.start()
        sync_url = _pg_container.get_connection_url()
        url = sync_url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1).replace(
            "postgresql://", "postgresql+asyncpg://", 1
        )
        yield url
        return

    if param == _MYSQL_PARAM:
        global _mysql_container
        if _mysql_container is None:
            from testcontainers.mysql import MySqlContainer  # type: ignore[import-untyped]

            _mysql_container = MySqlContainer(
                image="mysql:8.0",
                username="cassini",
                password="cassini_test",
                dbname="cassini_test",
            )
            _mysql_container.start()
        sync_url = _mysql_container.get_connection_url()
        url = sync_url.replace("mysql+pymysql://", "mysql+aiomysql://", 1).replace(
            "mysql://", "mysql+aiomysql://", 1
        )
        yield url
        return

    if param == _MSSQL_PARAM:
        global _mssql_container
        if _mssql_container is None:
            from testcontainers.mssql import SqlServerContainer  # type: ignore[import-untyped]

            _mssql_container = SqlServerContainer(
                image="mcr.microsoft.com/mssql/server:2022-latest",
                password="CassiniTest1!",
            )
            _mssql_container.start()
        host = _mssql_container.get_container_host_ip()
        port = _mssql_container.get_exposed_port(1433)
        url = (
            f"mssql+aioodbc://sa:CassiniTest1!@{host}:{port}/master"
            "?driver=ODBC+Driver+17+for+SQL+Server"
        )
        yield url
        return

    pytest.fail(f"Unknown dialect param: {param}")


# ---------------------------------------------------------------------------
# MQTT broker fixture
# ---------------------------------------------------------------------------

_MOSQUITTO_CONFIG = """\
listener 1883
allow_anonymous true
"""


@pytest.fixture(scope="session")
def mqtt_broker() -> Generator[tuple[str, int], None, None]:
    """Start an eclipse-mosquitto:2 container with an anonymous listener.

    Returns (host, port) tuple.

    Docker-compose service: mosquitto — this fixture launches its own
    container independently of docker-compose.full.yml.
    """
    _require_containers()

    from testcontainers.core.container import DockerContainer  # type: ignore[import-untyped]
    from testcontainers.core.waiting_utils import wait_for_logs  # type: ignore[import-untyped]

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".conf", delete=False
    ) as cfg_file:
        cfg_file.write(_MOSQUITTO_CONFIG)
        cfg_path = cfg_file.name

    container = (
        DockerContainer("eclipse-mosquitto:2")
        .with_exposed_ports(1883)
        .with_volume_mapping(cfg_path, "/mosquitto/config/mosquitto.conf", "ro")
    )
    container.start()
    wait_for_logs(container, "Opening ipv4 listen socket", timeout=30)

    host = container.get_container_host_ip()
    port = int(container.get_exposed_port(1883))

    yield host, port

    container.stop()
    try:
        os.unlink(cfg_path)
    except OSError:
        pass


@pytest.fixture
async def mqtt_publisher(
    mqtt_broker: tuple[str, int],
) -> AsyncGenerator[Any, None]:
    """Async fixture: connected aiomqtt.Client ready to publish.

    Depends on: mqtt_broker fixture (eclipse-mosquitto container).
    """
    try:
        import aiomqtt  # type: ignore[import-untyped]
    except ImportError:
        pytest.skip("aiomqtt not installed — run: pip install -e '.[test-containerized]'")

    host, port = mqtt_broker
    async with aiomqtt.Client(hostname=host, port=port) as client:
        yield client


# ---------------------------------------------------------------------------
# Valkey / Redis-compatible broker fixture
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def valkey_broker() -> Generator[str, None, None]:
    """Start a Valkey (Redis-compatible) container.

    Valkey is wire-compatible with Redis; RedisContainer works as-is.
    Returns the async redis:// connection URL.

    Docker-compose service: valkey.
    """
    _require_containers()

    from testcontainers.redis import RedisContainer  # type: ignore[import-untyped]

    container = RedisContainer(image="valkey/valkey:8-alpine")
    container.start()

    host = container.get_container_host_ip()
    port = int(container.get_exposed_port(6379))
    url = f"redis://{host}:{port}/0"

    yield url

    container.stop()


# ---------------------------------------------------------------------------
# OPC UA simulator fixture
# ---------------------------------------------------------------------------

_OPCUA_SIM_IMAGE = "cassini-opcua-sim:latest"
_OPCUA_PORT = 4840


@pytest.fixture(scope="session")
def opcua_simulator() -> Generator[str, None, None]:
    """Start the OPC UA simulator container.

    Expects image cassini-opcua-sim:latest built from
    apps/cassini/testing/harness/opcua_sim/.

    Returns endpoint URL: opc.tcp://localhost:<mapped_port>/

    Docker-compose service: opcua_sim.
    """
    _require_containers()

    from testcontainers.core.container import DockerContainer  # type: ignore[import-untyped]
    from testcontainers.core.waiting_utils import wait_for_logs  # type: ignore[import-untyped]

    container = DockerContainer(_OPCUA_SIM_IMAGE).with_exposed_ports(_OPCUA_PORT)

    try:
        container.start()
    except Exception as exc:
        pytest.skip(f"OPC UA sim image not available ({exc})")

    wait_for_logs(container, "OPC UA server running", timeout=30)

    host = container.get_container_host_ip()
    port = int(container.get_exposed_port(_OPCUA_PORT))
    endpoint = f"opc.tcp://{host}:{port}/"

    yield endpoint

    container.stop()


# ---------------------------------------------------------------------------
# Cassini backend container fixture
# ---------------------------------------------------------------------------

_CASSINI_BACKEND_IMAGE = "cassini-backend:latest"
_BACKEND_PORT = 8000
_HEALTH_PATH = "/api/v1/health"
_ADMIN_USERNAME = "admin"
_ADMIN_PASSWORD = "CassiniTest1!"


@pytest.fixture(scope="session")
def cassini_backend(cassini_db_url: str) -> Generator[str, None, None]:
    """Start cassini-backend container wired to the parametrized DB URL.

    Waits for GET /api/v1/health to return 200 before yielding.
    Returns the base URL, e.g. http://localhost:<port>.

    Docker-compose service: cassini-backend.
    """
    _require_containers()

    import urllib.request
    from testcontainers.core.container import DockerContainer  # type: ignore[import-untyped]

    try:
        container = (
            DockerContainer(_CASSINI_BACKEND_IMAGE)
            .with_exposed_ports(_BACKEND_PORT)
            .with_env("CASSINI_DATABASE_URL", cassini_db_url)
            .with_env("CASSINI_ADMIN_USERNAME", _ADMIN_USERNAME)
            .with_env("CASSINI_ADMIN_PASSWORD", _ADMIN_PASSWORD)
            .with_env("CASSINI_DEV_TIER", "enterprise")
            .with_env("CASSINI_JWT_SECRET", "test-jwt-secret-do-not-use-in-production")
        )
        container.start()
    except Exception as exc:
        pytest.skip(f"cassini-backend image not available ({exc})")

    host = container.get_container_host_ip()
    port = int(container.get_exposed_port(_BACKEND_PORT))
    base_url = f"http://{host}:{port}"
    health_url = f"{base_url}{_HEALTH_PATH}"

    deadline = time.monotonic() + 60
    last_exc: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(health_url, timeout=2) as resp:  # noqa: S310
                if resp.status == 200:
                    break
        except Exception as exc:
            last_exc = exc
            time.sleep(1)
    else:
        container.stop()
        pytest.fail(
            f"cassini-backend did not become healthy within 60 s: {last_exc}"
        )

    yield base_url

    container.stop()


# ---------------------------------------------------------------------------
# Auth token fixture
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def auth_token(cassini_backend: str) -> str:
    """Obtain a JWT access token from the seeded admin account.

    POSTs to /api/v1/auth/login with the bootstrap admin credentials and
    returns the access_token string.

    Depends on: cassini_backend fixture.
    """
    import json
    import urllib.request

    url = f"{cassini_backend}/api/v1/auth/login"
    payload = json.dumps(
        {"username": _ADMIN_USERNAME, "password": _ADMIN_PASSWORD}
    ).encode()
    req = urllib.request.Request(  # noqa: S310
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310
            body = json.loads(resp.read())
    except Exception as exc:
        pytest.fail(f"Admin login failed: {exc}")

    token = body.get("access_token")
    if not token:
        pytest.fail(f"No access_token in login response: {body}")
    return str(token)
