"""Tests for event definitions."""

from cassini.core.events.events import BatchEvaluationCompleteEvent


class TestBatchEvaluationCompleteEvent:
    def test_can_create_event(self):
        event = BatchEvaluationCompleteEvent(
            characteristic_id=1,
            sample_count=100,
            violation_count=5,
            sample_ids=[1, 2, 3],
        )
        assert event.characteristic_id == 1
        assert event.sample_count == 100
        assert event.violation_count == 5
        assert event.sample_ids == [1, 2, 3]
        assert event.timestamp is not None

    def test_default_empty_sample_ids(self):
        event = BatchEvaluationCompleteEvent(
            characteristic_id=1,
            sample_count=0,
            violation_count=0,
        )
        assert event.sample_ids == []
