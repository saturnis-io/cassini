"""Gage output parsers for RS-232/USB serial data."""
import re
from abc import ABC, abstractmethod


class GageParser(ABC):
    """Base class for gage output parsers."""

    @abstractmethod
    def parse(self, line: str) -> float | None:
        """Parse a line of serial output into a float value. Returns None if unparseable."""


class MitutoyoDigimaticParser(GageParser):
    """Mitutoyo SPC/Digimatic output parser.

    Format: 01A+00123.456\r\n
    - Bytes 0-1: Header (e.g. "01")
    - Byte 2: Status (A=normal, B=error)
    - Byte 3: Sign (+/-)
    - Bytes 4-12: Value with decimal point
    """

    PATTERN = re.compile(r"^\d{2}[A-Z]([+-]\d+\.\d+)")

    def parse(self, line: str) -> float | None:
        line = line.strip()
        match = self.PATTERN.match(line)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                return None
        return None


class GenericParser(GageParser):
    r"""Configurable regex-based parser.

    Uses a regex with a named capture group 'value' to extract the float.
    Example pattern: r"(?P<value>[+-]?\d+\.?\d*)"
    """

    def __init__(self, pattern: str):
        self.regex = re.compile(pattern)

    def parse(self, line: str) -> float | None:
        line = line.strip()
        match = self.regex.search(line)
        if match and "value" in match.groupdict():
            try:
                return float(match.group("value"))
            except ValueError:
                return None
        return None


class MahrMarComParser(GageParser):
    """Mahr MarCom output parser.

    Format: M+00.1234 or +00.1234
    - Optional 'M' prefix
    - Sign (+/-)
    - Digits with decimal point
    """

    PATTERN = re.compile(r"^M?([+-]\d+\.\d+)")

    def parse(self, line: str) -> float | None:
        line = line.strip()
        match = self.PATTERN.match(line)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                return None
        return None


class SylvacParser(GageParser):
    """Sylvac gage output parser.

    Format: +00.1234 or -0.5678 or 12.345
    - Optional sign (+/-)
    - Digits with decimal point, may have leading zeros
    """

    PATTERN = re.compile(r"^([+-]?\d+\.\d+)")

    def parse(self, line: str) -> float | None:
        line = line.strip()
        match = self.PATTERN.match(line)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                return None
        return None


class StarrettDataSureParser(GageParser):
    """Starrett DataSure output parser.

    Format: D +00.1234 mm or D -0.5678 in
    - 'D' prefix followed by whitespace
    - Sign (+/-)
    - Digits with optional decimal point
    - Optional unit suffix (ignored)
    """

    PATTERN = re.compile(r"^D\s+([+-]?\d+\.?\d*)")

    def parse(self, line: str) -> float | None:
        line = line.strip()
        match = self.PATTERN.match(line)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                return None
        return None


class KeyenceParser(GageParser):
    """Keyence sensor output parser.

    Format: CH01,+00.1234 or CH1,-0.5678
    - Channel prefix CHnn followed by comma
    - Sign (+/-)
    - Digits with optional decimal point
    """

    PATTERN = re.compile(r"^CH\d+,([+-]?\d+\.?\d*)")

    def parse(self, line: str) -> float | None:
        line = line.strip()
        match = self.PATTERN.match(line)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                return None
        return None


PROFILES = {
    "mitutoyo_digimatic": MitutoyoDigimaticParser,
    "mahr_marcom": MahrMarComParser,
    "sylvac": SylvacParser,
    "starrett_datasure": StarrettDataSureParser,
    "keyence": KeyenceParser,
    "generic": GenericParser,
}

def create_parser(profile: str, parse_pattern: str | None = None) -> GageParser:
    """Factory function to create a parser from profile name."""
    if profile == "generic":
        if not parse_pattern:
            parse_pattern = r"(?P<value>[+-]?\d+\.?\d*)"
        return GenericParser(parse_pattern)
    cls = PROFILES.get(profile)
    if cls is None:
        raise ValueError(f"Unknown parser profile: {profile}")
    return cls()
