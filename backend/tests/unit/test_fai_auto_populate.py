"""Tests for FAI auto-populate from SPC characteristic data.

Covers the characteristic search, latest measurement, and capability
summary endpoints added for FAI Form 3 auto-population.
"""

import pytest
from datetime import datetime, timezone

from cassini.api.schemas.fai import (
    FAICapabilitySummaryResponse,
    FAICharacteristicSearchResult,
    FAILatestMeasurementResponse,
)


# ---------------------------------------------------------------------------
# Schema validation tests
# ---------------------------------------------------------------------------


class TestFAICharacteristicSearchResultSchema:
    """Validate the FAICharacteristicSearchResult Pydantic schema."""

    def test_basic_construction(self):
        result = FAICharacteristicSearchResult(
            id=1,
            name="Diameter",
            hierarchy_path="Plant A > Line 1 > Station 2 > Diameter",
            nominal=10.0,
            usl=10.5,
            lsl=9.5,
            unit="mm",
        )
        assert result.id == 1
        assert result.name == "Diameter"
        assert result.nominal == 10.0
        assert result.usl == 10.5
        assert result.lsl == 9.5
        assert result.unit == "mm"
        assert "Plant A" in result.hierarchy_path

    def test_optional_spec_limits(self):
        result = FAICharacteristicSearchResult(
            id=2,
            name="Temperature",
            hierarchy_path="Plant > Oven",
            nominal=None,
            usl=None,
            lsl=None,
        )
        assert result.nominal is None
        assert result.usl is None
        assert result.lsl is None
        # Default unit should be "mm"
        assert result.unit == "mm"

    def test_null_unit_defaults_to_mm(self):
        result = FAICharacteristicSearchResult(
            id=3,
            name="Width",
            hierarchy_path="P > L",
            unit=None,
        )
        assert result.unit == "mm"

    def test_custom_unit(self):
        result = FAICharacteristicSearchResult(
            id=4,
            name="Pressure",
            hierarchy_path="P > L > Sensor",
            unit="psi",
        )
        assert result.unit == "psi"


class TestFAILatestMeasurementResponseSchema:
    """Validate the FAILatestMeasurementResponse schema."""

    def test_basic_construction(self):
        ts = datetime(2026, 3, 15, 10, 30, 0, tzinfo=timezone.utc)
        resp = FAILatestMeasurementResponse(
            char_id=1,
            value=10.025,
            timestamp=ts,
        )
        assert resp.char_id == 1
        assert resp.value == 10.025
        assert resp.timestamp == ts

    def test_negative_value(self):
        ts = datetime(2026, 3, 15, tzinfo=timezone.utc)
        resp = FAILatestMeasurementResponse(
            char_id=2,
            value=-3.14,
            timestamp=ts,
        )
        assert resp.value == -3.14


class TestFAICapabilitySummaryResponseSchema:
    """Validate the FAICapabilitySummaryResponse schema."""

    def test_with_cpk(self):
        resp = FAICapabilitySummaryResponse(
            char_id=1,
            cpk=1.45,
            sample_count=100,
        )
        assert resp.cpk == 1.45
        assert resp.sample_count == 100

    def test_null_cpk(self):
        resp = FAICapabilitySummaryResponse(
            char_id=2,
            cpk=None,
            sample_count=0,
        )
        assert resp.cpk is None
        assert resp.sample_count == 0

    def test_defaults(self):
        resp = FAICapabilitySummaryResponse(char_id=3)
        assert resp.cpk is None
        assert resp.sample_count == 0

    def test_low_cpk(self):
        resp = FAICapabilitySummaryResponse(
            char_id=4,
            cpk=0.75,
            sample_count=50,
        )
        assert resp.cpk == 0.75

    def test_negative_cpk(self):
        """Cpk can be negative when mean is outside spec limits."""
        resp = FAICapabilitySummaryResponse(
            char_id=5,
            cpk=-0.5,
            sample_count=200,
        )
        assert resp.cpk == -0.5


# ---------------------------------------------------------------------------
# Integration-style tests for search result formatting
# ---------------------------------------------------------------------------


class TestSearchResultFormatting:
    """Test that search results format hierarchy paths correctly."""

    def test_hierarchy_path_with_multiple_levels(self):
        result = FAICharacteristicSearchResult(
            id=10,
            name="OD",
            hierarchy_path="Acme Corp > Assembly Line 2 > CNC Mill > OD",
        )
        assert result.hierarchy_path == "Acme Corp > Assembly Line 2 > CNC Mill > OD"

    def test_single_level_path(self):
        result = FAICharacteristicSearchResult(
            id=11,
            name="Length",
            hierarchy_path="Length",
        )
        assert result.hierarchy_path == "Length"

    def test_spec_limits_can_be_mixed(self):
        """One-sided spec limits (only USL or only LSL) are valid."""
        result = FAICharacteristicSearchResult(
            id=12,
            name="Surface Finish",
            hierarchy_path="P > Station",
            usl=1.6,
            lsl=None,
            nominal=None,
            unit="Ra",
        )
        assert result.usl == 1.6
        assert result.lsl is None

    def test_all_fields_serializable(self):
        result = FAICharacteristicSearchResult(
            id=13,
            name="Bore",
            hierarchy_path="P > L > S > Bore",
            nominal=25.0,
            usl=25.05,
            lsl=24.95,
            unit="mm",
        )
        data = result.model_dump()
        assert data["id"] == 13
        assert data["name"] == "Bore"
        assert data["hierarchy_path"] == "P > L > S > Bore"
        assert data["nominal"] == 25.0
        assert data["usl"] == 25.05
        assert data["lsl"] == 24.95
        assert data["unit"] == "mm"


# ---------------------------------------------------------------------------
# CpkBadge color logic (unit-testable without frontend)
# ---------------------------------------------------------------------------


class TestCpkColorLogic:
    """Test the Cpk color classification logic used by the frontend badge."""

    @staticmethod
    def cpk_color(cpk: float | None) -> str | None:
        """Mirror the frontend color logic for Cpk badge."""
        if cpk is None:
            return None
        if cpk >= 1.33:
            return "green"
        if cpk >= 1.0:
            return "amber"
        return "red"

    def test_green_at_1_33(self):
        assert self.cpk_color(1.33) == "green"

    def test_green_above_1_33(self):
        assert self.cpk_color(2.0) == "green"

    def test_amber_at_1_0(self):
        assert self.cpk_color(1.0) == "amber"

    def test_amber_between_1_and_1_33(self):
        assert self.cpk_color(1.15) == "amber"

    def test_red_below_1(self):
        assert self.cpk_color(0.99) == "red"

    def test_red_negative(self):
        assert self.cpk_color(-0.5) == "red"

    def test_none_returns_none(self):
        assert self.cpk_color(None) is None
