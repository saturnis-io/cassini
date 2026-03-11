"""Guard against mixed sync/async SPC for the same characteristic."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from cassini.db.models.sample import Sample


async def check_no_pending_spc(session: AsyncSession, characteristic_id: int) -> None:
    """Raise ValueError if characteristic has pending async SPC samples.

    This prevents Nelson Rule ordering corruption by ensuring no
    single-sample sync SPC submission happens while async batch SPC
    is still processing for the same characteristic.

    The query is fast because it uses the partial index
    ``ix_sample_spc_status_pending``.

    Args:
        session: Active database session.
        characteristic_id: Characteristic to check.

    Raises:
        ValueError: If any samples have ``spc_status == 'pending_spc'``.
    """
    stmt = (
        select(func.count())
        .select_from(Sample)
        .where(Sample.char_id == characteristic_id)
        .where(Sample.spc_status == "pending_spc")
    )
    result = await session.execute(stmt)
    count = result.scalar_one()
    if count > 0:
        raise ValueError(
            f"Characteristic {characteristic_id} has {count} samples with "
            f"pending async SPC. Wait for completion before submitting single samples."
        )
