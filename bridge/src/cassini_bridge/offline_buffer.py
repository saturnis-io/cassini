"""SQLite-backed offline buffer for store-and-forward MQTT publishing.

When the MQTT broker is unreachable, readings are persisted to a local
SQLite database.  On reconnection the buffer is flushed in stored order.

CRITICAL: The *original* measurement timestamp is stored, not the
buffer-insert time.  This ensures SPC calculations use the correct
sample time even when readings are delivered late.

Ordering limitation: buffered readings are published in stored order but
may interleave with live readings during flush.  The SPC engine processes
samples in arrival order.
"""
import logging
import os
import sqlite3
import threading
import time
from pathlib import Path

logger = logging.getLogger(__name__)

# Defaults
DEFAULT_MAX_BUFFER_RECORDS = 100_000
DEFAULT_MAX_BUFFER_SIZE_MB = 500

_SCHEMA = """\
CREATE TABLE IF NOT EXISTS buffered_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    payload TEXT NOT NULL,
    measurement_ts REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_buffered_ts ON buffered_readings (measurement_ts);
"""


class OfflineBuffer:
    """SQLite-backed store-and-forward buffer for MQTT readings.

    Parameters
    ----------
    db_path : str | Path
        Path to the SQLite database file.  Parent directories are created
        automatically.
    max_records : int
        Maximum number of buffered readings.  When exceeded, the oldest
        readings are dropped and a warning is logged.
    max_size_mb : int
        Maximum database file size in megabytes.  When exceeded, the oldest
        readings are dropped and a warning is logged.
    """

    def __init__(
        self,
        db_path: str | Path,
        max_records: int = DEFAULT_MAX_BUFFER_RECORDS,
        max_size_mb: int = DEFAULT_MAX_BUFFER_SIZE_MB,
    ):
        self._db_path = Path(db_path)
        self._max_records = max_records
        self._max_size_bytes = max_size_mb * 1024 * 1024
        self._lock = threading.Lock()

        # Ensure parent directory exists
        self._db_path.parent.mkdir(parents=True, exist_ok=True)

        # Initialize schema
        conn = self._connect()
        try:
            conn.executescript(_SCHEMA)
            conn.commit()
        finally:
            conn.close()

    def _connect(self) -> sqlite3.Connection:
        """Open a new SQLite connection with WAL mode for concurrent access."""
        conn = sqlite3.connect(str(self._db_path), timeout=5.0)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        return conn

    def store(self, topic: str, payload: str, timestamp: float) -> None:
        """Persist a reading to the offline buffer.

        Parameters
        ----------
        topic : str
            MQTT topic the reading should be published to.
        payload : str
            JSON payload string (already serialized).
        timestamp : float
            Original measurement timestamp (epoch seconds).  This is the
            time the gage produced the reading, NOT the current wall-clock.
        """
        with self._lock:
            conn = self._connect()
            try:
                # Enforce limits before inserting
                self._enforce_limits(conn)

                conn.execute(
                    "INSERT INTO buffered_readings (topic, payload, measurement_ts) VALUES (?, ?, ?)",
                    (topic, payload, timestamp),
                )
                conn.commit()
            finally:
                conn.close()

    def flush(self, mqtt_client) -> int:
        """Publish all buffered readings in stored order and delete them.

        Parameters
        ----------
        mqtt_client
            An object with a ``publish(topic, payload, qos=1)`` method
            (typically ``paho.mqtt.client.Client``).

        Returns
        -------
        int
            Number of readings successfully flushed.
        """
        with self._lock:
            conn = self._connect()
            try:
                cursor = conn.execute(
                    "SELECT id, topic, payload FROM buffered_readings ORDER BY id ASC"
                )
                rows = cursor.fetchall()

                if not rows:
                    return 0

                logger.info("Flushing %d buffered reading(s) from offline buffer", len(rows))

                flushed_ids: list[int] = []
                for row_id, topic, payload in rows:
                    try:
                        mqtt_client.publish(topic, payload, qos=1)
                        flushed_ids.append(row_id)
                    except Exception as exc:
                        logger.warning(
                            "Failed to publish buffered reading id=%d: %s — stopping flush",
                            row_id,
                            exc,
                        )
                        break

                if flushed_ids:
                    # Delete in batches to avoid overly long SQL
                    batch_size = 500
                    for i in range(0, len(flushed_ids), batch_size):
                        batch = flushed_ids[i : i + batch_size]
                        placeholders = ",".join("?" for _ in batch)
                        conn.execute(
                            f"DELETE FROM buffered_readings WHERE id IN ({placeholders})",
                            batch,
                        )
                    conn.commit()

                    # VACUUM to reclaim disk space after flush
                    try:
                        conn.execute("VACUUM")
                    except sqlite3.OperationalError:
                        # VACUUM can fail under certain conditions; not critical
                        pass

                    logger.info(
                        "Flushed %d reading(s) from offline buffer, %d remaining",
                        len(flushed_ids),
                        len(rows) - len(flushed_ids),
                    )

                return len(flushed_ids)
            finally:
                conn.close()

    def count(self) -> int:
        """Return the number of buffered readings."""
        with self._lock:
            conn = self._connect()
            try:
                cursor = conn.execute("SELECT COUNT(*) FROM buffered_readings")
                return cursor.fetchone()[0]
            finally:
                conn.close()

    def _enforce_limits(self, conn: sqlite3.Connection) -> None:
        """Drop oldest records if buffer exceeds configured limits."""
        # Check record count
        cursor = conn.execute("SELECT COUNT(*) FROM buffered_readings")
        current_count = cursor.fetchone()[0]

        if current_count >= self._max_records:
            excess = current_count - self._max_records + 1  # make room for 1
            logger.warning(
                "Offline buffer at record limit (%d/%d) — dropping %d oldest reading(s)",
                current_count,
                self._max_records,
                excess,
            )
            conn.execute(
                "DELETE FROM buffered_readings WHERE id IN "
                "(SELECT id FROM buffered_readings ORDER BY id ASC LIMIT ?)",
                (excess,),
            )
            conn.commit()
            return

        # Check file size
        try:
            file_size = self._db_path.stat().st_size
        except OSError:
            return

        if file_size >= self._max_size_bytes:
            # Drop 10% of records to avoid thrashing on every insert
            drop_count = max(1, current_count // 10)
            logger.warning(
                "Offline buffer at size limit (%.1f MB / %.1f MB) — dropping %d oldest reading(s)",
                file_size / (1024 * 1024),
                self._max_size_bytes / (1024 * 1024),
                drop_count,
            )
            conn.execute(
                "DELETE FROM buffered_readings WHERE id IN "
                "(SELECT id FROM buffered_readings ORDER BY id ASC LIMIT ?)",
                (drop_count,),
            )
            conn.commit()
