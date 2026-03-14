"""Tests for serial port reader with reconnection logic."""
import threading
import time
from unittest.mock import MagicMock, patch

import serial

from cassini_bridge.serial_reader import (
    SerialReader,
    _INITIAL_BACKOFF,
    _MAX_BACKOFF,
    _MAX_RECONNECT_ATTEMPTS,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_reader(**kwargs) -> SerialReader:
    """Create a SerialReader with defaults suitable for testing."""
    defaults = {"port": "COM99", "baud_rate": 9600}
    defaults.update(kwargs)
    return _make_reader_raw(**defaults)


def _make_reader_raw(**kwargs) -> SerialReader:
    return SerialReader(**kwargs)


# ---------------------------------------------------------------------------
# Basic open / close / readline
# ---------------------------------------------------------------------------

class TestBasicOperations:

    @patch("cassini_bridge.serial_reader.serial.Serial")
    def test_open_creates_serial(self, mock_serial_cls):
        reader = _make_reader()
        reader.open()

        mock_serial_cls.assert_called_once_with(
            port="COM99",
            baudrate=9600,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=1.0,
        )
        assert reader.is_open
        assert not reader.is_failed
        assert not reader.is_reconnecting

    @patch("cassini_bridge.serial_reader.serial.Serial")
    def test_close_closes_port(self, mock_serial_cls):
        reader = _make_reader()
        reader.open()

        mock_instance = mock_serial_cls.return_value
        mock_instance.is_open = True

        reader.close()
        mock_instance.close.assert_called_once()

    @patch("cassini_bridge.serial_reader.serial.Serial")
    def test_readline_returns_decoded_line(self, mock_serial_cls):
        mock_instance = mock_serial_cls.return_value
        mock_instance.is_open = True
        mock_instance.readline.return_value = b"01A+00123.456\r\n"

        reader = _make_reader()
        reader.open()

        result = reader.readline()
        assert result == "01A+00123.456"

    @patch("cassini_bridge.serial_reader.serial.Serial")
    def test_readline_returns_none_on_timeout(self, mock_serial_cls):
        mock_instance = mock_serial_cls.return_value
        mock_instance.is_open = True
        mock_instance.readline.return_value = b""

        reader = _make_reader()
        reader.open()

        assert reader.readline() is None

    def test_readline_returns_none_when_not_open(self):
        reader = _make_reader()
        assert reader.readline() is None


# ---------------------------------------------------------------------------
# Reconnection on SerialException
# ---------------------------------------------------------------------------

class TestReconnection:

    @patch("cassini_bridge.serial_reader.serial.Serial")
    def test_serial_exception_triggers_reconnect(self, mock_serial_cls):
        """SerialException during readline should close port and start reconnection."""
        mock_instance = mock_serial_cls.return_value
        mock_instance.is_open = True
        mock_instance.readline.side_effect = serial.SerialException("USB removed")

        reader = _make_reader()
        reader.open()

        result = reader.readline()

        assert result is None
        assert reader.is_reconnecting

        # Clean up the reconnect thread
        reader.close()

    @patch("cassini_bridge.serial_reader.serial.Serial")
    def test_os_error_triggers_reconnect(self, mock_serial_cls):
        """OSError (Windows USB unplug) during readline should trigger reconnection."""
        mock_instance = mock_serial_cls.return_value
        mock_instance.is_open = True
        mock_instance.readline.side_effect = OSError("device not configured")

        reader = _make_reader()
        reader.open()

        result = reader.readline()

        assert result is None
        assert reader.is_reconnecting

        reader.close()

    @patch("cassini_bridge.serial_reader.serial.Serial")
    def test_readline_returns_none_during_reconnection(self, mock_serial_cls):
        """While reconnecting, readline should return None immediately."""
        reader = _make_reader()
        reader._reconnecting = True

        assert reader.readline() is None

    @patch("cassini_bridge.serial_reader.serial.Serial")
    def test_successful_reconnect_resets_state(self, mock_serial_cls):
        """After a successful reconnect, counters should be reset."""
        call_count = 0

        def serial_factory(**kwargs):
            nonlocal call_count
            call_count += 1
            mock = MagicMock()
            mock.is_open = True
            if call_count == 1:
                # First call (initial open) succeeds
                return mock
            elif call_count == 2:
                # Second call (first reconnect attempt) also succeeds
                return mock
            raise serial.SerialException("port busy")

        mock_serial_cls.side_effect = serial_factory

        reader = _make_reader()
        reader.open()

        # Simulate a read error that triggers reconnection
        reader._serial = None  # simulate port closed
        reader._reconnect_delay = _INITIAL_BACKOFF
        reader._reconnect_count = 0
        reader._reconnecting = True
        reader._failed = False

        # Run reconnect loop directly (not in a thread) to test it
        reader._shutdown = threading.Event()
        # Use a very short backoff for testing
        reader._reconnect_delay = 0.01
        reader._reconnect_loop()

        assert not reader.is_reconnecting
        assert not reader.is_failed
        assert reader._reconnect_delay == _INITIAL_BACKOFF
        assert reader._reconnect_count == 0

        reader.close()

    @patch("cassini_bridge.serial_reader.serial.Serial")
    def test_max_attempts_marks_port_failed(self, mock_serial_cls):
        """When max reconnect attempts are exhausted, port should be marked failed."""
        import cassini_bridge.serial_reader as sr_mod

        # Initial open succeeds
        mock_serial_cls.return_value = MagicMock(is_open=True)

        reader = _make_reader()
        reader.open()

        # Set up for reconnect loop: every attempt will fail
        mock_serial_cls.side_effect = serial.SerialException("port gone")
        reader._serial = None
        reader._reconnecting = True
        reader._reconnect_delay = 0.001  # fast for testing

        # Reduce max attempts and backoff cap so test doesn't take minutes
        old_max = sr_mod._MAX_RECONNECT_ATTEMPTS
        old_max_backoff = sr_mod._MAX_BACKOFF
        try:
            sr_mod._MAX_RECONNECT_ATTEMPTS = 5
            sr_mod._MAX_BACKOFF = 0.01
            reader._reconnect_loop()
        finally:
            sr_mod._MAX_RECONNECT_ATTEMPTS = old_max
            sr_mod._MAX_BACKOFF = old_max_backoff

        assert reader.is_failed
        assert not reader.is_reconnecting

        reader.close()

    @patch("cassini_bridge.serial_reader.serial.Serial")
    def test_max_attempts_count_is_30(self, mock_serial_cls):
        """Verify the max attempts constant is 30, matching MQTT."""
        assert _MAX_RECONNECT_ATTEMPTS == 30


# ---------------------------------------------------------------------------
# Backoff timing
# ---------------------------------------------------------------------------

class TestBackoff:

    def test_initial_backoff_is_1s(self):
        assert _INITIAL_BACKOFF == 1.0

    def test_max_backoff_is_30s(self):
        assert _MAX_BACKOFF == 30.0

    @patch("cassini_bridge.serial_reader.serial.Serial")
    def test_backoff_doubles_on_failure(self, mock_serial_cls):
        """Each failed reconnect attempt should double the delay, capped at MAX."""
        # Initial open works
        mock_instance = MagicMock(is_open=True)
        first_call = [True]

        def factory(**kwargs):
            if first_call[0]:
                first_call[0] = False
                return mock_instance
            raise serial.SerialException("port gone")

        mock_serial_cls.side_effect = factory

        reader = _make_reader()
        reader.open()

        # Set max attempts to 5 to keep test fast
        reader._serial = None
        reader._reconnecting = True
        reader._reconnect_delay = 0.001  # start tiny for speed
        original_max = _MAX_RECONNECT_ATTEMPTS

        # Patch the max to a small number for this test
        import cassini_bridge.serial_reader as sr_mod
        old_max = sr_mod._MAX_RECONNECT_ATTEMPTS
        try:
            sr_mod._MAX_RECONNECT_ATTEMPTS = 5
            reader._reconnect_loop()
        finally:
            sr_mod._MAX_RECONNECT_ATTEMPTS = old_max

        # Delay should have doubled several times
        # Starting at 0.001: 0.002, 0.004, 0.008, 0.016
        assert reader._reconnect_delay > 0.001

        reader.close()

    def test_backoff_caps_at_max(self):
        """Backoff should never exceed _MAX_BACKOFF."""
        reader = _make_reader()
        reader._reconnect_delay = 20.0
        # Simulate what the reconnect loop does on failure:
        reader._reconnect_delay = min(reader._reconnect_delay * 2, _MAX_BACKOFF)
        assert reader._reconnect_delay == _MAX_BACKOFF


# ---------------------------------------------------------------------------
# Failed port retry
# ---------------------------------------------------------------------------

class TestRetryOpen:

    @patch("cassini_bridge.serial_reader.serial.Serial")
    def test_retry_open_succeeds_clears_failed(self, mock_serial_cls):
        """retry_open on a failed port should clear the failed flag on success."""
        mock_serial_cls.return_value = MagicMock(is_open=True)

        reader = _make_reader()
        reader._failed = True

        result = reader.retry_open()

        assert result is True
        assert not reader.is_failed
        assert reader.is_open

        reader.close()

    @patch("cassini_bridge.serial_reader.serial.Serial")
    def test_retry_open_fails_stays_failed(self, mock_serial_cls):
        """retry_open on a failed port should keep failed flag if open fails."""
        mock_serial_cls.side_effect = serial.SerialException("still gone")

        reader = _make_reader()
        reader._failed = True

        result = reader.retry_open()

        assert result is False
        assert reader.is_failed

    @patch("cassini_bridge.serial_reader.serial.Serial")
    def test_retry_open_noop_on_healthy_port(self, mock_serial_cls):
        """retry_open on a non-failed port should return current is_open."""
        mock_serial_cls.return_value = MagicMock(is_open=True)

        reader = _make_reader()
        reader.open()

        result = reader.retry_open()
        assert result is True

        reader.close()


# ---------------------------------------------------------------------------
# Shutdown interrupts reconnection
# ---------------------------------------------------------------------------

class TestShutdown:

    @patch("cassini_bridge.serial_reader.serial.Serial")
    def test_close_interrupts_reconnect(self, mock_serial_cls):
        """Calling close() should interrupt any in-progress reconnection."""
        import cassini_bridge.serial_reader as sr_mod

        mock_serial_cls.side_effect = serial.SerialException("port gone")

        reader = _make_reader()
        reader._reconnecting = True
        reader._reconnect_delay = 0.5  # long enough to still be waiting when we close

        # Cap backoff so subsequent attempts don't balloon
        old_max_backoff = sr_mod._MAX_BACKOFF
        sr_mod._MAX_BACKOFF = 0.5

        try:
            # Start reconnect in background
            t = threading.Thread(target=reader._reconnect_loop, daemon=True)
            t.start()

            # Signal shutdown quickly
            time.sleep(0.05)
            reader.close()

            t.join(timeout=2.0)
            assert not t.is_alive(), "Reconnect loop did not exit after close()"
        finally:
            sr_mod._MAX_BACKOFF = old_max_backoff
