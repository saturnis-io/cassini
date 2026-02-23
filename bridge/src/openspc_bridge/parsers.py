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
    """Configurable regex-based parser.

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


PROFILES = {
    "mitutoyo_digimatic": MitutoyoDigimaticParser,
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
