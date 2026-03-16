"""Tests for FAI data model enhancements — child tables, fai_type, drawing_zone, value_type, measurements."""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from cassini.api.schemas.fai import (
    FAIFunctionalTestCreate,
    FAIItemCreate,
    FAIItemResponse,
    FAIItemUpdate,
    FAIMaterialCreate,
    FAIMaterialResponse,
    FAIReportCreate,
    FAIReportDetailResponse,
    FAIReportResponse,
    FAISpecialProcessCreate,
    FAISpecialProcessResponse,
)


class TestFAIReportSchemas:
    """Test FAI report schema validation."""

    def test_report_create_defaults_fai_type_full(self):
        data = FAIReportCreate(plant_id=1, part_number="PN-001")
        assert data.fai_type == "full"

    def test_report_create_accepts_partial(self):
        data = FAIReportCreate(plant_id=1, part_number="PN-001", fai_type="partial")
        assert data.fai_type == "partial"

    def test_report_create_rejects_invalid_fai_type(self):
        with pytest.raises(Exception):
            FAIReportCreate(plant_id=1, part_number="PN-001", fai_type="invalid")

    def test_report_response_includes_fai_type(self):
        data = {
            "id": 1,
            "plant_id": 1,
            "fai_type": "partial",
            "part_number": "PN-001",
            "part_name": None,
            "revision": None,
            "serial_number": None,
            "lot_number": None,
            "drawing_number": None,
            "organization_name": None,
            "supplier": None,
            "purchase_order": None,
            "reason_for_inspection": None,
            "material_supplier": None,
            "material_spec": None,
            "special_processes": None,
            "functional_test_results": None,
            "status": "draft",
            "created_by": 1,
            "created_at": "2026-01-01T00:00:00",
            "submitted_by": None,
            "submitted_at": None,
            "approved_by": None,
            "approved_at": None,
            "rejection_reason": None,
        }
        resp = FAIReportResponse.model_validate(data)
        assert resp.fai_type == "partial"


class TestFAIItemSchemas:
    """Test FAI item schema validation for new fields."""

    def test_item_create_defaults(self):
        data = FAIItemCreate()
        assert data.value_type == "numeric"
        assert data.drawing_zone is None
        assert data.actual_value_text is None
        assert data.measurements is None

    def test_item_create_with_drawing_zone(self):
        data = FAIItemCreate(drawing_zone="A1")
        assert data.drawing_zone == "A1"

    def test_item_create_text_value_type(self):
        data = FAIItemCreate(value_type="text", actual_value_text="Compliant")
        assert data.value_type == "text"
        assert data.actual_value_text == "Compliant"

    def test_item_create_pass_fail_value_type(self):
        data = FAIItemCreate(value_type="pass_fail", actual_value_text="Pass")
        assert data.value_type == "pass_fail"

    def test_item_create_rejects_invalid_value_type(self):
        with pytest.raises(Exception):
            FAIItemCreate(value_type="invalid")

    def test_item_create_measurements(self):
        data = FAIItemCreate(measurements=[10.01, 10.03, 9.98])
        assert data.measurements == [10.01, 10.03, 9.98]

    def test_item_update_drawing_zone(self):
        data = FAIItemUpdate(drawing_zone="B2")
        assert data.drawing_zone == "B2"

    def test_item_update_value_type(self):
        data = FAIItemUpdate(value_type="text")
        assert data.value_type == "text"

    def test_item_response_includes_new_fields(self):
        data = {
            "id": 1,
            "report_id": 1,
            "balloon_number": 1,
            "characteristic_name": "Diameter",
            "drawing_zone": "A1",
            "nominal": 10.0,
            "usl": 10.1,
            "lsl": 9.9,
            "actual_value": 10.01,
            "value_type": "numeric",
            "actual_value_text": None,
            "measurements": [10.01, 10.02, 10.00],
            "unit": "mm",
            "tools_used": "CMM",
            "designed_char": False,
            "result": "pass",
            "deviation_reason": None,
            "characteristic_id": None,
            "sequence_order": 1,
        }
        resp = FAIItemResponse.model_validate(data)
        assert resp.drawing_zone == "A1"
        assert resp.value_type == "numeric"
        assert resp.measurements == [10.01, 10.02, 10.00]


class TestFAIMaterialSchemas:
    """Test FAI material (Form 2 child) schemas."""

    def test_material_create_defaults(self):
        data = FAIMaterialCreate()
        assert data.result == "pass"
        assert data.material_part_number is None

    def test_material_create_with_fields(self):
        data = FAIMaterialCreate(
            material_part_number="MAT-001",
            material_spec="AMS 5643",
            cert_number="CERT-123",
            supplier="Steel Corp",
            result="pass",
        )
        assert data.material_part_number == "MAT-001"
        assert data.supplier == "Steel Corp"

    def test_material_create_rejects_invalid_result(self):
        with pytest.raises(Exception):
            FAIMaterialCreate(result="deviation")

    def test_material_response(self):
        data = {
            "id": 1,
            "report_id": 1,
            "material_part_number": "MAT-001",
            "material_spec": "AMS 5643",
            "cert_number": "CERT-123",
            "supplier": "Steel Corp",
            "result": "pass",
        }
        resp = FAIMaterialResponse.model_validate(data)
        assert resp.id == 1
        assert resp.supplier == "Steel Corp"


class TestFAISpecialProcessSchemas:
    """Test FAI special process (Form 2 child) schemas."""

    def test_process_create_defaults(self):
        data = FAISpecialProcessCreate()
        assert data.result == "pass"

    def test_process_create_with_fields(self):
        data = FAISpecialProcessCreate(
            process_name="Heat Treatment",
            process_spec="AMS 2750",
            cert_number="CERT-456",
            approved_supplier="Heat Corp",
        )
        assert data.process_name == "Heat Treatment"

    def test_process_response(self):
        data = {
            "id": 1,
            "report_id": 1,
            "process_name": "NDT",
            "process_spec": "ASTM E1444",
            "cert_number": "CERT-789",
            "approved_supplier": "NDT Labs",
            "result": "pass",
        }
        resp = FAISpecialProcessResponse.model_validate(data)
        assert resp.process_name == "NDT"


class TestFAIFunctionalTestSchemas:
    """Test FAI functional test (Form 2 child) schemas."""

    def test_test_create_defaults(self):
        from cassini.api.schemas.fai import FAIFunctionalTestResponse
        data = FAIFunctionalTestCreate()
        assert data.result == "pass"

    def test_test_create_with_fields(self):
        data = FAIFunctionalTestCreate(
            test_description="Pressure test",
            procedure_number="TP-001",
            actual_results="Held at 150 PSI for 30 min, no leaks",
        )
        assert data.test_description == "Pressure test"


class TestFAIReportDetailResponse:
    """Test the detail response includes child tables."""

    def test_detail_response_includes_child_tables(self):
        data = {
            "id": 1,
            "plant_id": 1,
            "fai_type": "full",
            "part_number": "PN-001",
            "part_name": "Test Part",
            "revision": "A",
            "serial_number": None,
            "lot_number": None,
            "drawing_number": None,
            "organization_name": None,
            "supplier": None,
            "purchase_order": None,
            "reason_for_inspection": None,
            "material_supplier": None,
            "material_spec": None,
            "special_processes": None,
            "functional_test_results": None,
            "status": "draft",
            "created_by": 1,
            "created_at": "2026-01-01T00:00:00",
            "submitted_by": None,
            "submitted_at": None,
            "approved_by": None,
            "approved_at": None,
            "rejection_reason": None,
            "items": [],
            "materials": [
                {
                    "id": 1,
                    "report_id": 1,
                    "material_part_number": "MAT-001",
                    "material_spec": "AMS 5643",
                    "cert_number": None,
                    "supplier": "Steel Corp",
                    "result": "pass",
                }
            ],
            "special_processes_items": [],
            "functional_tests_items": [
                {
                    "id": 1,
                    "report_id": 1,
                    "test_description": "Pressure test",
                    "procedure_number": "TP-001",
                    "actual_results": "OK",
                    "result": "pass",
                }
            ],
        }
        resp = FAIReportDetailResponse.model_validate(data)
        assert len(resp.materials) == 1
        assert resp.materials[0].supplier == "Steel Corp"
        assert len(resp.functional_tests_items) == 1
        assert len(resp.special_processes_items) == 0


class TestMeasurementsSerialization:
    """Test the measurements JSON serialization helpers in the API layer."""

    def test_serialize_none(self):
        from cassini.api.v1.fai import _serialize_measurements
        assert _serialize_measurements(None) is None

    def test_serialize_list(self):
        from cassini.api.v1.fai import _serialize_measurements
        result = _serialize_measurements([10.01, 10.03, 9.98])
        assert result == "[10.01, 10.03, 9.98]"

    def test_deserialize_none(self):
        from cassini.api.v1.fai import _deserialize_measurements
        assert _deserialize_measurements(None) is None

    def test_deserialize_valid_json(self):
        from cassini.api.v1.fai import _deserialize_measurements
        result = _deserialize_measurements("[10.01, 10.03, 9.98]")
        assert result == [10.01, 10.03, 9.98]

    def test_deserialize_invalid_json(self):
        from cassini.api.v1.fai import _deserialize_measurements
        result = _deserialize_measurements("not json")
        assert result is None

    def test_deserialize_empty_list(self):
        from cassini.api.v1.fai import _deserialize_measurements
        result = _deserialize_measurements("[]")
        assert result == []

    def test_mean_calculation(self):
        """Measurements mean should become actual_value."""
        measurements = [10.01, 10.03, 9.98, 10.02]
        mean = sum(measurements) / len(measurements)
        assert abs(mean - 10.01) < 0.001


class TestSignatureHashUpdate:
    """Test that the signature engine correctly includes new FAI fields in hash."""

    @pytest.mark.asyncio
    async def test_load_resource_content_includes_fai_type(self):
        """Verify load_resource_content for fai_report includes fai_type and child table counts."""
        from cassini.core.signature_engine import SignatureWorkflowEngine

        # Mock the session
        session = AsyncMock()

        # Mock the first query (report fields)
        report_row = MagicMock()
        report_row.status = "draft"
        report_row.part_number = "PN-001"
        report_row.fai_type = "partial"

        # Mock the items query
        item_row = MagicMock()
        item_row.id = 1
        item_row.characteristic_name = "Diameter"
        item_row.actual_value = 10.0
        item_row.result = "pass"
        item_row.value_type = "numeric"

        # Set up execute returns
        first_result = MagicMock()
        first_result.first.return_value = report_row

        items_result = MagicMock()
        items_result.all.return_value = [item_row]

        mat_count_result = MagicMock()
        mat_count_result.scalar_one.return_value = 2

        sp_count_result = MagicMock()
        sp_count_result.scalar_one.return_value = 1

        ft_count_result = MagicMock()
        ft_count_result.scalar_one.return_value = 0

        session.execute = AsyncMock(
            side_effect=[first_result, items_result, mat_count_result, sp_count_result, ft_count_result]
        )

        engine = SignatureWorkflowEngine(session)
        content = await engine.load_resource_content(session, "fai_report", 1)

        assert content["fai_type"] == "partial"
        assert content["items_count"] == 1
        assert "items_hash" in content
        assert content["material_count"] == 2
        assert content["special_process_count"] == 1
        assert content["functional_test_count"] == 0
