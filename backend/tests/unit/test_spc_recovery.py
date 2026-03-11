"""Tests for SPC recovery on startup."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from cassini.core.engine.spc_queue import SPCQueue, _reset_spc_queue


class TestRecoverPendingSpc:
    @pytest.mark.asyncio
    async def test_recover_enqueues_pending_groups(self):
        """Recovery should group pending samples by (char_id, material_id)."""
        _reset_spc_queue()

        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = [
            MagicMock(id=1, char_id=1, material_id=None),
            MagicMock(id=2, char_id=1, material_id=None),
            MagicMock(id=3, char_id=1, material_id=None),
            MagicMock(id=4, char_id=2, material_id=5),
            MagicMock(id=5, char_id=2, material_id=5),
        ]
        mock_session.execute = AsyncMock(return_value=mock_result)

        queue = SPCQueue(max_size=100)

        from cassini.main import _recover_pending_spc
        await _recover_pending_spc(mock_session, queue)

        # 2 groups: (char_id=1, material_id=None) and (char_id=2, material_id=5)
        assert queue.stats["enqueued"] == 2

        _reset_spc_queue()

    @pytest.mark.asyncio
    async def test_recover_no_pending_is_noop(self):
        """Recovery with no pending samples should be a no-op."""
        _reset_spc_queue()

        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        queue = SPCQueue(max_size=100)

        from cassini.main import _recover_pending_spc
        await _recover_pending_spc(mock_session, queue)

        assert queue.stats["enqueued"] == 0

        _reset_spc_queue()
