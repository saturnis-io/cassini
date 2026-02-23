"""Serial port reader for gage data."""
import logging
import serial

logger = logging.getLogger(__name__)


class SerialReader:
    """Reads lines from a serial port using pyserial."""

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
        self.stopbits = {1: serial.STOPBITS_ONE, 1.5: serial.STOPBITS_ONE_POINT_FIVE, 2: serial.STOPBITS_TWO}[stop_bits]
        self.timeout = timeout
        self._serial: serial.Serial | None = None

    def open(self) -> None:
        self._serial = serial.Serial(
            port=self.port,
            baudrate=self.baud_rate,
            bytesize=self.bytesize,
            parity=self.parity,
            stopbits=self.stopbits,
            timeout=self.timeout,
        )
        logger.info("Opened serial port %s at %d baud", self.port, self.baud_rate)

    def close(self) -> None:
        if self._serial and self._serial.is_open:
            self._serial.close()
            logger.info("Closed serial port %s", self.port)

    def readline(self) -> str | None:
        """Read one line from serial port. Returns None on timeout."""
        if not self._serial or not self._serial.is_open:
            return None
        try:
            raw = self._serial.readline()
            if raw:
                return raw.decode("ascii", errors="replace").strip()
        except serial.SerialException as e:
            logger.error("Serial read error on %s: %s", self.port, e)
        return None

    @property
    def is_open(self) -> bool:
        return self._serial is not None and self._serial.is_open
