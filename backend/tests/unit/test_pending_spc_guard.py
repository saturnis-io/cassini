"""Tests for pending SPC guard."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from cassini.core.engine.spc_guard import check_no_pending_spc


class TestPendingSpcGuard:
    @pytest.mark.asyncio
    async def test_no_pending_allows_processing(self):
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one.return_value = 0
        session.execute = AsyncMock(return_value=mock_result)
        # Should not raise
        await check_no_pending_spc(session, characteristic_id=1)

    @pytest.mark.asyncio
    async def test_pending_raises_conflict(self):
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one.return_value = 3
        session.execute = AsyncMock(return_value=mock_result)
        with pytest.raises(ValueError, match="pending async SPC"):
            await check_no_pending_spc(session, characteristic_id=1)
