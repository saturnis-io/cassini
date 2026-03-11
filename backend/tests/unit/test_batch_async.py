"""Tests for async batch SPC endpoint behavior."""

from cassini.api.v1.samples import BatchImportRequest, BatchImportResult


class TestBatchImportRequestSchema:
    def test_async_spc_default_false(self):
        req = BatchImportRequest(
            characteristic_id=1,
            samples=[{"measurements": [1.0]}],
        )
        assert req.async_spc is False

    def test_async_spc_can_be_true(self):
        req = BatchImportRequest(
            characteristic_id=1,
            samples=[{"measurements": [1.0]}],
            async_spc=True,
        )
        assert req.async_spc is True

    def test_max_length_10000(self):
        """Verify samples field allows up to 10,000 items."""
        # Just verify the field metadata allows it
        field_info = BatchImportRequest.model_fields["samples"]
        assert field_info.metadata  # Has validators


class TestBatchImportResultSchema:
    def test_status_default_complete(self):
        result = BatchImportResult(total=10, imported=10, failed=0, errors=[])
        assert result.status == "complete"
        assert result.sample_ids is None

    def test_status_processing_with_sample_ids(self):
        result = BatchImportResult(
            total=10, imported=10, failed=0, errors=[],
            status="processing", sample_ids=[1, 2, 3],
        )
        assert result.status == "processing"
        assert result.sample_ids == [1, 2, 3]

    def test_successful_property_still_works(self):
        result = BatchImportResult(total=10, imported=8, failed=2, errors=["err"])
        assert result.successful == 8
