"""Tests for Sample model spc_status column."""

from cassini.db.models.sample import Sample


class TestSpcStatusColumn:
    def test_spc_status_default_is_complete(self):
        """Column default is 'complete' (applied at flush/insert time)."""
        col = Sample.__table__.columns["spc_status"]
        assert col.default.arg == "complete"
        assert col.server_default.arg == "complete"
        assert col.nullable is False

    def test_spc_status_can_be_pending(self):
        """Samples can be created with pending_spc status."""
        sample = Sample(char_id=1, spc_status="pending_spc")
        assert sample.spc_status == "pending_spc"

    def test_spc_status_can_be_failed(self):
        """Samples can be created with spc_failed status."""
        sample = Sample(char_id=1, spc_status="spc_failed")
        assert sample.spc_status == "spc_failed"

    def test_spc_status_column_max_length(self):
        """spc_status column has String(20) type constraint."""
        col = Sample.__table__.columns["spc_status"]
        assert col.type.length == 20

    def test_spc_status_partial_index_defined(self):
        """Partial index ix_sample_spc_status_pending exists in table args."""
        indexes = {idx.name for idx in Sample.__table__.indexes}
        assert "ix_sample_spc_status_pending" in indexes
