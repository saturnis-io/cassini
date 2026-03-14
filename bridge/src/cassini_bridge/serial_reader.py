"""Serial port reader for gage data.

Includes automatic reconnection with exponential backoff (1s -> 30s max)
when USB cables are unplugged, Windows sleep/wake occurs, or other serial
port errors are detected.
"""
import logging
import threading
import time

import serial

logger = logging.getLogger(__name__)

# Reconnection constants — intentionally matching MQTT publisher defaults.
_INITIAL_BACKOFF = 1.0
_MAX_BACKOFF = 30.0
_MAX_RECONNECT_ATTEMPTS = 30
_FAILED_PORT_RETRY_INTERVAL = 60.0


class SerialReader:
    """Reads lines from a serial port using pyserial.

    On ``SerialException`` during reads the port is closed and a background
    reconnection loop fires with exponential backoff (1 s → 30 s cap, up to
    30 attempts).  While the port is reconnecting, ``readline()`` returns
    ``None`` so the caller's event loop keeps running.

    If all reconnection attempts are exhausted the port is marked *failed*.
    The caller can check ``is_failed`` and later call ``retry_open()`` to try
    once more (e.g. on a 60-second timer for hot-plugged USB devices).
    """

    def __init__(
        self,
        port: str,
        baud_rate: int = 9600,
        data_bits: int = 8,
        parity: str = "none",
        stop_bits: float = 1.0,
        timeout: float = 1.0,
    ):
        self.port = port
        self.baud_rate = baud_rate
        self.bytesize = {5: serial.FIVEBITS, 6: serial.SIXBITS, 7: serial.SEVENBITS, 8: serial.EIGHTBITS}[data_bits]
        self.parity = {"none": serial.PARITY_NONE, "even": serial.PARITY_EVEN, "odd": serial.PARITY_ODD}[parity]
        self.stopbits = {1.0: serial.STOPBITS_ONE, 1.5: serial.STOPBITS_ONE_POINT_FIVE, 2.0: serial.STOPBITS_TWO}[float(stop_bits)]
        self.timeout = timeout
        self._serial: serial.Serial | None = None

        # Reconnection state
        self._reconnect_delay = _INITIAL_BACKOFF
        self._reconnect_count = 0
        self._reconnecting = False
        self._failed = False
        self._lock = threading.Lock()
        self._shutdown = threading.Event()

    def open(self) -> None:
        """Open the serial port.  Raises on failure."""
        self._shutdown.clear()
        self._serial = serial.Serial(
            port=self.port,
            baudrate=self.baud_rate,
            bytesize=self.bytesize,
            parity=self.parity,
            stopbits=self.stopbits,
            timeout=self.timeout,
        )
        self._failed = False
        self._reconnecting = False
        self._reconnect_delay = _INITIAL_BACKOFF
        self._reconnect_count = 0
        logger.info("Opened serial port %s at %d baud", self.port, self.baud_rate)

    def close(self) -> None:
        """Close the serial port and cancel any pending reconnection."""
        self._shutdown.set()
        if self._serial and self._serial.is_open:
            self._serial.close()
            logger.info("Closed serial port %s", self.port)

    def readline(self) -> str | None:
        """Read one line from serial port.

        Returns ``None`` on timeout, during reconnection, or if the port has
        failed.  On ``SerialException`` the port is closed and reconnection
        is scheduled automatically.
        """
        if self._reconnecting or self._failed:
            return None
        with self._lock:
            ser = self._serial
        if ser is None or not ser.is_open:
            return None
        try:
            raw = ser.readline()
            if raw:
                return raw.decode("ascii", errors="replace").strip()
        except serial.SerialException as exc:
            logger.warning(
                "Serial error on %s: %s — starting reconnection",
                self.port,
                exc,
            )
            self._safe_close()
            self._schedule_reconnect()
        except OSError as exc:
            # Windows can raise bare OSError on USB unplug
            logger.warning(
                "OS error on %s: %s — starting reconnection",
                self.port,
                exc,
            )
            self._safe_close()
            self._schedule_reconnect()
        return None

    # ------------------------------------------------------------------
    # Reconnection machinery
    # ------------------------------------------------------------------

    def _safe_close(self) -> None:
        """Close the underlying serial port, swallowing errors."""
        try:
            if self._serial and self._serial.is_open:
                self._serial.close()
        except Exception:
            pass
        self._serial = None

    def _schedule_reconnect(self) -> None:
        """Spawn a daemon thread that attempts to reopen the serial port
        with exponential backoff, mirroring the MQTT publisher pattern."""
        with self._lock:
            if self._reconnecting:
                return  # already running
            self._reconnecting = True

        threading.Thread(
            target=self._reconnect_loop,
            daemon=True,
            name=f"serial-reconnect-{self.port}",
        ).start()

    def _reconnect_loop(self) -> None:
        """Block in a loop, retrying port open with exponential backoff."""
        while not self._shutdown.is_set():
            if self._reconnect_count >= _MAX_RECONNECT_ATTEMPTS:
                logger.error(
                    "Max serial reconnection attempts (%d) reached for %s, marking port as failed",
                    _MAX_RECONNECT_ATTEMPTS,
                    self.port,
                )
                self._failed = True
                self._reconnecting = False
                return

            delay = self._reconnect_delay
            self._reconnect_count += 1
            logger.info(
                "Serial reconnect attempt %d/%d for %s (delay=%.1fs)",
                self._reconnect_count,
                _MAX_RECONNECT_ATTEMPTS,
                self.port,
                delay,
            )

            # Wait the backoff interval (interruptible by shutdown)
            if self._shutdown.wait(timeout=delay):
                self._reconnecting = False
                return  # shutdown requested

            try:
                self._serial = serial.Serial(
                    port=self.port,
                    baudrate=self.baud_rate,
                    bytesize=self.bytesize,
                    parity=self.parity,
                    stopbits=self.stopbits,
                    timeout=self.timeout,
                )
                # Success
                logger.info(
                    "Serial port %s reconnected after %d attempt(s)",
                    self.port,
                    self._reconnect_count,
                )
                self._reconnect_delay = _INITIAL_BACKOFF
                self._reconnect_count = 0
                self._reconnecting = False
                return
            except (serial.SerialException, OSError) as exc:
                logger.warning(
                    "Serial reconnect attempt %d/%d for %s failed: %s",
                    self._reconnect_count,
                    _MAX_RECONNECT_ATTEMPTS,
                    self.port,
                    exc,
                )
                self._reconnect_delay = min(
                    self._reconnect_delay * 2, _MAX_BACKOFF
                )

    # ------------------------------------------------------------------
    # Failed-port retry (called externally by the runner)
    # ------------------------------------------------------------------

    def retry_open(self) -> bool:
        """Attempt to reopen a failed port.  Returns True on success.

        Called by the runner on a periodic timer so that hot-plugged USB
        devices are picked up again.  If the port name changed (Windows
        can reassign COM numbers) this will fail — the user must update
        the configuration.
        """
        if not self._failed:
            return self.is_open

        logger.info("Retrying failed serial port %s", self.port)
        try:
            self.open()
            logger.info("Failed serial port %s recovered", self.port)
            return True
        except (serial.SerialException, OSError) as exc:
            logger.warning(
                "Retry for failed serial port %s unsuccessful: %s "
                "(if the device was re-inserted, the COM port number may have changed)",
                self.port,
                exc,
            )
            self._failed = True  # still failed
            return False

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def is_open(self) -> bool:
        return self._serial is not None and self._serial.is_open

    @property
    def is_reconnecting(self) -> bool:
        return self._reconnecting

    @property
    def is_failed(self) -> bool:
        return self._failed
