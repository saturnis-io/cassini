"""CSV/Excel data import REST endpoints.

Provides a 3-step import workflow:
1. Upload — parse file, return column preview
2. Validate — apply column mapping, preview valid/invalid rows
3. Confirm — import valid rows as samples
"""

import json

import structlog
from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import get_current_user, get_db_session
from openspc.core.import_service import parse_file, validate_and_map, _parse_csv, _parse_excel
from openspc.db.models.characteristic import Characteristic
from openspc.db.models.user import User
from openspc.db.repositories.sample import SampleRepository

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/import", tags=["import"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


async def _read_upload(file: UploadFile) -> tuple[bytes, str]:
    """Read and validate an uploaded file.

    Returns:
        Tuple of (file_content, filename).

    Raises:
        HTTPException: If file is too large or missing.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {MAX_FILE_SIZE // (1024 * 1024)}MB",
        )

    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is empty",
        )

    return content, file.filename


async def _get_characteristic(
    session: AsyncSession, characteristic_id: int
) -> Characteristic:
    """Fetch characteristic by ID. Raises 404 if not found."""
    stmt = select(Characteristic).where(Characteristic.id == characteristic_id)
    result = await session.execute(stmt)
    char = result.scalar_one_or_none()
    if char is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {characteristic_id} not found",
        )
    return char


def _parse_column_mapping(raw: str) -> dict:
    """Parse column_mapping from JSON string. Raises 400 on invalid JSON."""
    try:
        mapping = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid column_mapping JSON",
        )
    if not isinstance(mapping, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="column_mapping must be a JSON object",
        )
    return mapping


def _build_full_parsed(content: bytes, filename: str) -> dict:
    """Parse file and attach all data_rows (not just preview) to the result."""
    parsed = parse_file(content, filename)

    # Re-parse to get all data rows (parse_file only stores preview_rows)
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "csv":
        all_rows = _parse_csv(content)
    else:
        all_rows = _parse_excel(content)

    # Skip header row
    data_rows = all_rows[1:] if all_rows else []
    # Normalize to strings for consistent mapping
    parsed["data_rows"] = [
        [str(cell).strip() if cell is not None else "" for cell in row]
        for row in data_rows
    ]
    return parsed


@router.post(
    "/upload",
    summary="Upload file for preview",
    description="Parse a CSV or Excel file and return column metadata with preview rows.",
)
async def upload_file(
    file: UploadFile,
    user: User = Depends(get_current_user),
) -> dict:
    """Upload a CSV/Excel file and get column preview for mapping."""
    content, filename = await _read_upload(file)

    try:
        result = parse_file(content, filename)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    logger.info(
        "import_file_uploaded",
        filename=filename,
        row_count=result["row_count"],
        columns=len(result["columns"]),
        user_id=user.id,
    )

    return result


@router.post(
    "/validate",
    summary="Validate column mapping",
    description="Apply column mapping to uploaded file and preview valid/invalid rows.",
)
async def validate_mapping(
    file: UploadFile,
    column_mapping: str = Form(...),
    characteristic_id: int = Form(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Validate column mapping against file data and characteristic type."""
    content, filename = await _read_upload(file)
    mapping = _parse_column_mapping(column_mapping)

    char = await _get_characteristic(session, characteristic_id)
    data_type = getattr(char, "data_type", "variable")

    try:
        parsed = _build_full_parsed(content, filename)
        result = validate_and_map(parsed, mapping, data_type)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    logger.info(
        "import_validated",
        filename=filename,
        characteristic_id=characteristic_id,
        data_type=data_type,
        valid_count=result["valid_count"],
        error_count=len(result["error_rows"]),
        user_id=user.id,
    )

    return result


@router.post(
    "/confirm",
    summary="Confirm and import data",
    description="Import validated rows as samples for the target characteristic.",
    status_code=status.HTTP_201_CREATED,
)
async def confirm_import(
    file: UploadFile,
    column_mapping: str = Form(...),
    characteristic_id: int = Form(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Parse, validate, and import data as samples."""
    content, filename = await _read_upload(file)
    mapping = _parse_column_mapping(column_mapping)

    char = await _get_characteristic(session, characteristic_id)
    data_type = getattr(char, "data_type", "variable")

    try:
        parsed = _build_full_parsed(content, filename)
        validation = validate_and_map(parsed, mapping, data_type)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    valid_rows = validation["valid_rows"]
    if not valid_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid rows to import",
        )

    sample_repo = SampleRepository(session)
    imported = 0
    import_errors: list[dict] = []

    for idx, row_data in enumerate(valid_rows):
        try:
            if data_type == "variable":
                context: dict = {}
                if "timestamp" in row_data and row_data["timestamp"] is not None:
                    context["timestamp"] = row_data["timestamp"]
                if "batch_number" in row_data:
                    context["batch_number"] = row_data["batch_number"]
                if "operator_id" in row_data:
                    context["operator_id"] = row_data["operator_id"]

                await sample_repo.create_with_measurements(
                    char_id=characteristic_id,
                    values=row_data["measurements"],
                    **context,
                )
                imported += 1
            else:
                # TODO: Use SampleRepository.create_attribute_sample() once Track A adds it.
                # For now, create attribute samples directly with the Sample model.
                from openspc.db.models.sample import Sample

                sample_kwargs: dict = {
                    "char_id": characteristic_id,
                    "defect_count": row_data["defect_count"],
                }
                if "sample_size" in row_data:
                    sample_kwargs["sample_size"] = row_data["sample_size"]
                if "units_inspected" in row_data:
                    sample_kwargs["units_inspected"] = row_data["units_inspected"]
                if "timestamp" in row_data and row_data["timestamp"] is not None:
                    sample_kwargs["timestamp"] = row_data["timestamp"]
                if "batch_number" in row_data:
                    sample_kwargs["batch_number"] = row_data["batch_number"]
                if "operator_id" in row_data:
                    sample_kwargs["operator_id"] = row_data["operator_id"]

                sample = Sample(**sample_kwargs)
                session.add(sample)
                await session.flush()
                imported += 1
        except Exception as e:
            import_errors.append({"row_index": idx, "error": str(e)})
            logger.warning(
                "import_row_failed",
                row_index=idx,
                error=str(e),
                characteristic_id=characteristic_id,
            )

    await session.commit()

    logger.info(
        "import_completed",
        filename=filename,
        characteristic_id=characteristic_id,
        data_type=data_type,
        imported=imported,
        errors=len(import_errors),
        total_rows=validation["total_rows"],
        user_id=user.id,
    )

    return {
        "imported": imported,
        "errors": len(import_errors),
        "error_details": import_errors,
        "total_rows": validation["total_rows"],
    }
