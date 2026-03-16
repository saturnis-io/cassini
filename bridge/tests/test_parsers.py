"""Tests for gage output parsers."""
import pytest

from cassini_bridge.parsers import (
    GageParser,
    GenericParser,
    KeyenceParser,
    MahrMarComParser,
    MitutoyoDigimaticParser,
    StarrettDataSureParser,
    SylvacParser,
    create_parser,
    PROFILES,
)


# ---------------------------------------------------------------------------
# MitutoyoDigimaticParser
# ---------------------------------------------------------------------------

class TestMitutoyoDigimatic:
    def test_normal_positive(self):
        parser = MitutoyoDigimaticParser()
        assert parser.parse("01A+00123.456\r\n") == 123.456

    def test_normal_negative(self):
        parser = MitutoyoDigimaticParser()
        assert parser.parse("01A-00123.456") == -123.456

    def test_no_match(self):
        parser = MitutoyoDigimaticParser()
        assert parser.parse("garbage data") is None

    def test_empty(self):
        parser = MitutoyoDigimaticParser()
        assert parser.parse("") is None


# ---------------------------------------------------------------------------
# MahrMarComParser
# ---------------------------------------------------------------------------

class TestMahrMarCom:
    def test_with_m_prefix_positive(self):
        parser = MahrMarComParser()
        assert parser.parse("M+00.1234") == 0.1234

    def test_with_m_prefix_negative(self):
        parser = MahrMarComParser()
        assert parser.parse("M-12.3456") == -12.3456

    def test_without_m_prefix(self):
        parser = MahrMarComParser()
        assert parser.parse("+00.1234") == 0.1234

    def test_negative_without_m(self):
        parser = MahrMarComParser()
        assert parser.parse("-00.5678") == -0.5678

    def test_whitespace(self):
        parser = MahrMarComParser()
        assert parser.parse("  M+01.2345  ") == 1.2345

    def test_no_match(self):
        parser = MahrMarComParser()
        assert parser.parse("garbage") is None

    def test_no_decimal(self):
        """Mahr format requires decimal point."""
        parser = MahrMarComParser()
        assert parser.parse("M+123") is None

    def test_empty(self):
        parser = MahrMarComParser()
        assert parser.parse("") is None


# ---------------------------------------------------------------------------
# SylvacParser
# ---------------------------------------------------------------------------

class TestSylvac:
    def test_positive_with_sign(self):
        parser = SylvacParser()
        assert parser.parse("+00.1234") == 0.1234

    def test_negative_with_sign(self):
        parser = SylvacParser()
        assert parser.parse("-12.3456") == -12.3456

    def test_no_sign(self):
        parser = SylvacParser()
        assert parser.parse("12.345") == 12.345

    def test_leading_zeros(self):
        parser = SylvacParser()
        assert parser.parse("000.5000") == 0.5

    def test_whitespace(self):
        parser = SylvacParser()
        assert parser.parse("  +01.2345  ") == 1.2345

    def test_no_match_no_decimal(self):
        parser = SylvacParser()
        assert parser.parse("123") is None

    def test_empty(self):
        parser = SylvacParser()
        assert parser.parse("") is None


# ---------------------------------------------------------------------------
# StarrettDataSureParser
# ---------------------------------------------------------------------------

class TestStarrettDataSure:
    def test_positive_with_unit(self):
        parser = StarrettDataSureParser()
        assert parser.parse("D +00.1234 mm") == 0.1234

    def test_negative_with_unit(self):
        parser = StarrettDataSureParser()
        assert parser.parse("D -12.3456 in") == -12.3456

    def test_no_unit(self):
        parser = StarrettDataSureParser()
        assert parser.parse("D +00.1234") == 0.1234

    def test_multiple_spaces(self):
        parser = StarrettDataSureParser()
        assert parser.parse("D   +5.678") == 5.678

    def test_integer_value(self):
        parser = StarrettDataSureParser()
        assert parser.parse("D 123") == 123.0

    def test_no_sign(self):
        parser = StarrettDataSureParser()
        assert parser.parse("D 0.1234") == 0.1234

    def test_whitespace(self):
        parser = StarrettDataSureParser()
        assert parser.parse("  D +01.2345 mm  ") == 1.2345

    def test_no_match(self):
        parser = StarrettDataSureParser()
        assert parser.parse("X +00.1234") is None

    def test_empty(self):
        parser = StarrettDataSureParser()
        assert parser.parse("") is None


# ---------------------------------------------------------------------------
# KeyenceParser
# ---------------------------------------------------------------------------

class TestKeyence:
    def test_channel_1_positive(self):
        parser = KeyenceParser()
        assert parser.parse("CH01,+00.1234") == 0.1234

    def test_channel_1_negative(self):
        parser = KeyenceParser()
        assert parser.parse("CH01,-12.3456") == -12.3456

    def test_channel_2(self):
        parser = KeyenceParser()
        assert parser.parse("CH02,+5.678") == 5.678

    def test_single_digit_channel(self):
        parser = KeyenceParser()
        assert parser.parse("CH1,+0.1234") == 0.1234

    def test_integer_value(self):
        parser = KeyenceParser()
        assert parser.parse("CH01,123") == 123.0

    def test_no_sign(self):
        parser = KeyenceParser()
        assert parser.parse("CH01,0.1234") == 0.1234

    def test_whitespace(self):
        parser = KeyenceParser()
        assert parser.parse("  CH01,+01.2345  ") == 1.2345

    def test_no_match(self):
        parser = KeyenceParser()
        assert parser.parse("DATA,+00.1234") is None

    def test_empty(self):
        parser = KeyenceParser()
        assert parser.parse("") is None


# ---------------------------------------------------------------------------
# PROFILES and create_parser factory
# ---------------------------------------------------------------------------

class TestProfiles:
    def test_all_profiles_registered(self):
        expected = {
            "mitutoyo_digimatic",
            "mahr_marcom",
            "sylvac",
            "starrett_datasure",
            "keyence",
            "generic",
        }
        assert set(PROFILES.keys()) == expected

    def test_create_parser_mitutoyo(self):
        parser = create_parser("mitutoyo_digimatic")
        assert isinstance(parser, MitutoyoDigimaticParser)

    def test_create_parser_mahr(self):
        parser = create_parser("mahr_marcom")
        assert isinstance(parser, MahrMarComParser)

    def test_create_parser_sylvac(self):
        parser = create_parser("sylvac")
        assert isinstance(parser, SylvacParser)

    def test_create_parser_starrett(self):
        parser = create_parser("starrett_datasure")
        assert isinstance(parser, StarrettDataSureParser)

    def test_create_parser_keyence(self):
        parser = create_parser("keyence")
        assert isinstance(parser, KeyenceParser)

    def test_create_parser_generic_default_pattern(self):
        parser = create_parser("generic")
        assert isinstance(parser, GenericParser)
        assert parser.parse("value is 12.34") == 12.34

    def test_create_parser_generic_custom_pattern(self):
        parser = create_parser("generic", r"RESULT=(?P<value>\d+\.\d+)")
        assert isinstance(parser, GenericParser)
        assert parser.parse("RESULT=42.5") == 42.5

    def test_create_parser_unknown_raises(self):
        with pytest.raises(ValueError, match="Unknown parser profile"):
            create_parser("nonexistent_gage")

    def test_all_parsers_are_gage_parser_subclass(self):
        for name, cls in PROFILES.items():
            if name == "generic":
                instance = cls(r"(?P<value>[+-]?\d+\.?\d*)")
            else:
                instance = cls()
            assert isinstance(instance, GageParser), f"{name} is not a GageParser subclass"
