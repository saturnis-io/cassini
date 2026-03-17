"""CSV/Excel data import REST endpoints.

Provides a 3-step import workflow:
1. Upload — parse file, return column preview
2. Validate — apply column mapping, preview valid/invalid rows
3. Confirm — import valid rows as samples (with full SPC engine processing)
"""

import json

import structlog
from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import check_plant_role, get_current_user, get_db_session, resolve_plant_id_for_characteristic
from cassini.core.import_service import parse_file, validate_and_map, _parse_csv, _parse_excel
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.user import User
from cassini.db.repositories.sample import SampleRepository
from cassini.db.repositories import CharacteristicRepository, ViolationRepository
from cassini.core.engine.nelson_rules import NelsonRuleLibrary
from cassini.core.engine.rolling_window import get_shared_window_manager
from cassini.core.engine.spc_engine import SPCEngine, extract_char_data
from cassini.core.providers.protocol import SampleContext

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
        logger.warning("import_upload_parse_error", filename=filename, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to parse file — check format is CSV or supported Excel",
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
        logger.warning("import_validate_error", filename=filename, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Validation failed — check column mapping matches file structure",
        )
    except Exception:
        logger.exception(
            "import_validate_failed",
            filename=filename,
            characteristic_id=characteristic_id,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to validate file data — check column mapping and file format",
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
    request: Request,
    file: UploadFile,
    column_mapping: str = Form(...),
    characteristic_id: int = Form(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Parse, validate, and import data as samples."""
    # Plant-scoped authorization
    plant_id = await resolve_plant_id_for_characteristic(characteristic_id, session)
    check_plant_role(user, plant_id, "operator")

    content, filename = await _read_upload(file)
    mapping = _parse_column_mapping(column_mapping)

    char = await _get_characteristic(session, characteristic_id)
    data_type = getattr(char, "data_type", "variable")

    try:
        parsed = _build_full_parsed(content, filename)
        validation = validate_and_map(parsed, mapping, data_type)
    except ValueError as e:
        logger.warning("import_confirm_parse_error", filename=filename, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to parse or validate file — check format and column mapping",
        )

    valid_rows = validation["valid_rows"]
    if not valid_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid rows to import",
        )

    # Sort rows by timestamp (chronological order) so Nelson rules evaluate
    # correctly on historical data. Rows without timestamps sort last.
    valid_rows_indexed = list(enumerate(valid_rows))
    valid_rows_indexed.sort(
        key=lambda pair: (
            pair[1].get("timestamp") is None,
            pair[1].get("timestamp"),
        )
    )

    # Set up SPC engine for processing (same pattern as data_entry.py / samples.py)
    sample_repo = SampleRepository(session)
    char_repo = CharacteristicRepository(session)
    violation_repo = ViolationRepository(session)
    engine = SPCEngine(
        sample_repo=sample_repo,
        char_repo=char_repo,
        violation_repo=violation_repo,
        window_manager=get_shared_window_manager(),
        rule_library=NelsonRuleLibrary(),
    )

    # Pre-load characteristic with rules for SPC engine dedup (avoids
    # per-sample get_with_rules query inside the engine)
    char_with_rules = await char_repo.get_with_rules(characteristic_id)
    char_data = extract_char_data(char_with_rules) if char_with_rules is not None else None

    imported = 0
    import_errors: list[dict] = []

    for original_idx, row_data in valid_rows_indexed:
        try:
            if data_type == "variable":
                context = SampleContext(
                    batch_number=row_data.get("batch_number"),
                    operator_id=row_data.get("operator_id"),
                    source="CSV_IMPORT",
                )

                await engine.process_sample(
                    characteristic_id=characteristic_id,
                    measurements=row_data["measurements"],
                    context=context,
                    char_data=char_data,
                )
                imported += 1
            else:
                # Attribute data — use the attribute SPC engine
                from cassini.core.engine.attribute_engine import process_attribute_sample

                await process_attribute_sample(
                    char_id=characteristic_id,
                    defect_count=row_data["defect_count"],
                    sample_size=row_data.get("sample_size"),
                    units_inspected=row_data.get("units_inspected"),
                    batch_number=row_data.get("batch_number"),
                    operator_id=row_data.get("operator_id"),
                    sample_repo=sample_repo,
                    char_repo=char_repo,
                    violation_repo=violation_repo,
                )
                imported += 1
        except Exception as e:
            import_errors.append({"row_index": original_idx, "error": "Failed to import row"})
            logger.warning(
                "import_row_failed",
                row_index=original_idx,
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

    request.state.audit_context = {
        "resource_type": "import",
        "action": "create",
        "summary": f"CSV import confirmed: {imported} samples for '{char.name}'",
        "fields": {
            "rows_imported": imported,
            "rows_failed": len(import_errors),
            "total_rows": validation["total_rows"],
            "characteristic_id": characteristic_id,
            "characteristic_name": char.name,
            "filename": filename,
        },
    }

    return {
        "imported": imported,
        "errors": len(import_errors),
        "error_details": import_errors,
        "total_rows": validation["total_rows"],
    }
