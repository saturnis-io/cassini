"""SOP-grounded RAG endpoints (Enterprise tier).

Plant-scoped SOP document upload, chunking + embedding, and citation-
locked LLM query. The query path is the trust feature: every claim
must cite a chunk in the retrieved candidate set or the response is
rejected with a 422 ``RagRefusalResponse``.

Authorization
-------------
* All endpoints require Enterprise tier + ``sop-rag`` feature.
* Upload / delete / re-index require ``engineer`` role at the doc's plant.
* Query / list / get require any plant role.

Multi-tenancy
-------------
* Plant id is taken from the URL or a query param and cross-checked
  against the user's plant_roles via ``check_plant_role``.
* The retriever filters chunks by plant_id at SQL level.
* The citation-lock validator re-verifies plant ownership at the DB
  level for every cited chunk (defense in depth).
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

import structlog
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    check_plant_role,
    get_current_user,
    get_db_session,
    get_license_service,
)
from cassini.api.schemas.sop_rag import (
    RagAnswerResponse,
    RagBudgetOut,
    RagBudgetUpdate,
    RagCitation,
    RagQueryRequest,
    RagRefusalResponse,
    SopDocListResponse,
    SopDocOut,
    SopDocStatus,
)
from cassini.core.ai_analysis.providers import ClaudeProvider
from cassini.core.config import get_data_dir
from cassini.core.licensing import LicenseService
from cassini.core.rag.citation_lock import (
    build_strict_retry_prompt,
    parse_cited_response,
    strip_citations,
    validate_citation_lock,
)
from cassini.core.rag.embeddings import create_embedder
from cassini.core.rag.indexer import index_document
from cassini.core.rag.retriever import HybridRetriever
from cassini.db.models.sop_doc import SopChunk, SopDoc, SopRagBudget
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/sop-rag", tags=["sop-rag"])


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB
_ALLOWED_SUFFIXES = {".txt", ".md", ".pdf", ".docx"}
_ALLOWED_CONTENT_TYPES = {
    "text/plain",
    "text/markdown",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
}
_DEFAULT_MONTHLY_CAP_USD = 50.0

# Anthropic price snapshot for sonnet-4-6 — keep in sync with provider config.
_INPUT_PRICE_PER_MTOK = 3.0
_OUTPUT_PRICE_PER_MTOK = 15.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_sop_rag(license_service: LicenseService) -> None:
    if not license_service.has_feature("sop-rag"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="SOP-grounded RAG requires an Enterprise license with the sop-rag feature",
        )


def _doc_storage_dir(plant_id: int) -> Path:
    base = get_data_dir() / "sop_docs" / str(plant_id)
    base.mkdir(parents=True, exist_ok=True)
    return base


def _current_year_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _estimate_cost_usd(input_tokens: int, output_tokens: int) -> float:
    return (
        input_tokens * _INPUT_PRICE_PER_MTOK / 1_000_000
        + output_tokens * _OUTPUT_PRICE_PER_MTOK / 1_000_000
    )


async def _get_or_create_budget(db: AsyncSession, plant_id: int) -> SopRagBudget:
    ym = _current_year_month()
    row = (
        await db.execute(
            select(SopRagBudget).where(
                SopRagBudget.plant_id == plant_id, SopRagBudget.year_month == ym
            )
        )
    ).scalar_one_or_none()
    if row is None:
        row = SopRagBudget(
            plant_id=plant_id,
            year_month=ym,
            monthly_cap_usd=_DEFAULT_MONTHLY_CAP_USD,
            cost_usd=0.0,
            query_count=0,
        )
        db.add(row)
        await db.flush()
    return row


def _build_system_prompt(candidate_chunks: list) -> str:
    chunk_lines = []
    for ch in candidate_chunks:
        label = f" [{ch.paragraph_label}]" if ch.paragraph_label else ""
        chunk_lines.append(
            f"chunk_id={ch.chunk_id} | doc={ch.doc_title}{label}\n"
            f"---\n{ch.text}\n---"
        )
    chunks_block = "\n\n".join(chunk_lines)
    return (
        "You are an SOP investigator. Answer the operator's question using ONLY "
        "the candidate SOP chunks provided below. Every sentence in your answer "
        "MUST end with at least one [citation:<chunk_id>] marker referencing a "
        "chunk_id from the candidate set. If the candidate chunks don't contain "
        "the answer, say so plainly with a single citation to the closest chunk. "
        "Do NOT invent chunk_ids. Do NOT cite chunks that don't appear below.\n\n"
        f"Candidate chunks:\n\n{chunks_block}"
    )


# ---------------------------------------------------------------------------
# Doc CRUD
# ---------------------------------------------------------------------------


@router.post(
    "/docs",
    response_model=SopDocStatus,
    status_code=status.HTTP_201_CREATED,
)
async def upload_doc(
    background_tasks: BackgroundTasks,
    plant_id: Annotated[int, Form()],
    title: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    user: User = Depends(get_current_user),
    license_service: LicenseService = Depends(get_license_service),
    db: AsyncSession = Depends(get_db_session),
) -> SopDocStatus:
    _require_sop_rag(license_service)
    check_plant_role(user, plant_id, "engineer")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file extension: {suffix or '<none>'}",
        )
    content_type = (file.content_type or "application/octet-stream").lower()
    if content_type not in _ALLOWED_CONTENT_TYPES:
        # Fall through with a content type derived from the suffix — the
        # browser sometimes sends a generic octet-stream for non-PDF files.
        content_type = {
            ".txt": "text/plain",
            ".md": "text/markdown",
            ".pdf": "application/pdf",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }[suffix]

    body = await file.read(_MAX_UPLOAD_BYTES + 1)
    if len(body) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {_MAX_UPLOAD_BYTES} bytes",
        )
    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )

    doc_uuid = uuid.uuid4().hex
    storage_dir = _doc_storage_dir(plant_id)
    storage_path = storage_dir / f"{doc_uuid}{suffix}"
    storage_path.write_bytes(body)

    doc = SopDoc(
        plant_id=plant_id,
        title=title.strip()[:255] or (file.filename or "untitled")[:255],
        filename=(file.filename or "untitled")[:255],
        content_type=content_type,
        storage_path=str(storage_path),
        byte_size=len(body),
        char_count=0,
        chunk_count=0,
        status="pending",
        uploaded_by=user.id,
    )
    try:
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
    except Exception:
        # DB commit failed — clean up the orphaned file on disk.
        try:
            storage_path.unlink(missing_ok=True)
        except OSError as exc:
            logger.warning(
                "sop_rag_orphan_cleanup_failed",
                path=str(storage_path),
                error=str(exc),
            )
        raise

    background_tasks.add_task(_run_index_in_background, doc.id)

    return SopDocStatus(
        id=doc.id,
        status=doc.status,
        pii_warning=doc.pii_warning,
        pii_match_summary=doc.pii_match_summary,
    )


async def _run_index_in_background(doc_id: int) -> None:
    """Standalone session for the background indexer."""
    from cassini.db.database import get_database

    factory = get_database().session_factory
    async with factory() as session:
        embedder = create_embedder("local")
        try:
            await index_document(doc_id, embedder, session)
            await session.commit()
        except Exception:  # noqa: BLE001 — already logged inside index_document
            await session.rollback()


@router.get("/docs", response_model=SopDocListResponse)
async def list_docs(
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    license_service: LicenseService = Depends(get_license_service),
    db: AsyncSession = Depends(get_db_session),
) -> SopDocListResponse:
    _require_sop_rag(license_service)
    check_plant_role(user, plant_id, "operator")

    rows = (
        await db.execute(
            select(SopDoc)
            .where(SopDoc.plant_id == plant_id)
            .order_by(SopDoc.created_at.desc())
        )
    ).scalars().all()
    return SopDocListResponse(items=[SopDocOut.model_validate(r) for r in rows], total=len(rows))


@router.get("/docs/{doc_id}", response_model=SopDocOut)
async def get_doc(
    doc_id: int,
    user: User = Depends(get_current_user),
    license_service: LicenseService = Depends(get_license_service),
    db: AsyncSession = Depends(get_db_session),
) -> SopDocOut:
    _require_sop_rag(license_service)
    doc = await db.get(SopDoc, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="SOP doc not found")
    # Don't leak existence to non-members — return 404, not 403, on cross-plant.
    try:
        check_plant_role(user, doc.plant_id, "operator")
    except HTTPException:
        raise HTTPException(status_code=404, detail="SOP doc not found") from None
    return SopDocOut.model_validate(doc)


@router.delete("/docs/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_doc(
    doc_id: int,
    user: User = Depends(get_current_user),
    license_service: LicenseService = Depends(get_license_service),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    _require_sop_rag(license_service)
    doc = await db.get(SopDoc, doc_id)
    if doc is None:
        # Don't leak existence to non-members.
        raise HTTPException(status_code=404, detail="SOP doc not found")
    check_plant_role(user, doc.plant_id, "engineer")

    storage_path = Path(doc.storage_path)
    await db.delete(doc)
    await db.commit()
    try:
        if storage_path.exists():
            storage_path.unlink()
    except OSError as exc:
        logger.warning(
            "sop_rag_delete_file_failed", path=str(storage_path), error=str(exc)
        )


@router.post("/docs/{doc_id}/reindex", response_model=SopDocStatus)
async def reindex_doc(
    doc_id: int,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    license_service: LicenseService = Depends(get_license_service),
    db: AsyncSession = Depends(get_db_session),
) -> SopDocStatus:
    _require_sop_rag(license_service)
    doc = await db.get(SopDoc, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="SOP doc not found")
    check_plant_role(user, doc.plant_id, "engineer")
    doc.status = "pending"
    doc.status_message = None
    await db.commit()
    background_tasks.add_task(_run_index_in_background, doc.id)
    return SopDocStatus(id=doc.id, status="pending")


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------


@router.post(
    "/query",
    response_model=RagAnswerResponse,
    responses={
        422: {"model": RagRefusalResponse},
        402: {"model": RagRefusalResponse},
    },
)
async def query_sop_rag(
    payload: RagQueryRequest,
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    license_service: LicenseService = Depends(get_license_service),
    db: AsyncSession = Depends(get_db_session),
) -> RagAnswerResponse:
    _require_sop_rag(license_service)
    check_plant_role(user, plant_id, "operator")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM provider not configured (ANTHROPIC_API_KEY missing)",
        )

    # Lock the budget row so concurrent queries from the same plant serialize
    # at the cap check. Postgres takes a row-level lock; SQLite already
    # serializes writes through its journal so the with_for_update is a no-op
    # but the test path still passes.
    await _get_or_create_budget(db, plant_id)
    ym = _current_year_month()
    locked = (
        await db.execute(
            select(SopRagBudget)
            .where(
                SopRagBudget.plant_id == plant_id,
                SopRagBudget.year_month == ym,
            )
            .with_for_update()
        )
    ).scalar_one()
    if locked.cost_usd >= locked.monthly_cap_usd:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=RagRefusalResponse(
                refused=True,
                reason="budget_exceeded",
                detail=(
                    f"Monthly cap of ${locked.monthly_cap_usd:.2f} reached for "
                    f"{locked.year_month}; resets next month or admin can raise the cap."
                ),
            ).model_dump(),
        )

    embedder = create_embedder("local")
    retriever = HybridRetriever(db, embedder)
    candidates = await retriever.retrieve(plant_id, payload.question, top_k=payload.top_k)

    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=RagRefusalResponse(
                refused=True,
                reason="no_relevant_chunks",
                detail="No SOP chunks indexed for this plant or none matched the question",
            ).model_dump(),
        )

    candidate_ids = {c.chunk_id for c in candidates}
    provider = ClaudeProvider(
        api_key=api_key,
        model="claude-sonnet-4-6",
        max_tokens=2048,
    )

    total_input = 0
    total_output = 0

    async def _charge_and_commit() -> None:
        cost_local = _estimate_cost_usd(total_input, total_output)
        locked.cost_usd = float(locked.cost_usd) + cost_local
        locked.query_count = locked.query_count + 1
        locked.updated_at = datetime.now(timezone.utc)
        await db.commit()

    # Attempt 1: standard prompt.
    system_prompt = _build_system_prompt(candidates)
    response = await provider.generate(
        system_prompt=system_prompt,
        user_prompt=payload.question,
    )
    answer_text = response.content or ""
    sentences = parse_cited_response(answer_text)
    result = await validate_citation_lock(sentences, candidate_ids, plant_id, db)

    total_input = response.input_tokens
    total_output = response.output_tokens
    last_response = response

    # Attempt 2 (one retry) with a stricter prompt. Wrap the retry so a
    # provider failure between attempts still records first-attempt cost
    # (Anthropic billed regardless) before raising 503.
    if not result.valid:
        retry_system = (
            system_prompt
            + "\n\n"
            + build_strict_retry_prompt(
                result.failure_reason or "uncited_sentence", result.failed_sentence
            )
        )
        try:
            response2 = await provider.generate(
                system_prompt=retry_system,
                user_prompt=payload.question,
            )
        except Exception as exc:  # noqa: BLE001 — provider 5xx / network blip
            await _charge_and_commit()
            logger.error(
                "sop_rag_retry_provider_failed",
                plant_id=plant_id,
                user_id=user.id,
                error=str(exc),
                charged_usd=round(_estimate_cost_usd(total_input, total_output), 4),
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="LLM provider error during retry — first-attempt tokens charged.",
            ) from exc
        total_input += response2.input_tokens
        total_output += response2.output_tokens
        last_response = response2
        answer_text = response2.content or ""
        sentences = parse_cited_response(answer_text)
        result = await validate_citation_lock(sentences, candidate_ids, plant_id, db)

    cost = _estimate_cost_usd(total_input, total_output)

    if not result.valid:
        await _charge_and_commit()
        logger.info(
            "sop_rag_refusal",
            plant_id=plant_id,
            user_id=user.id,
            reason=result.failure_reason,
            cost_usd=round(cost, 4),
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=RagRefusalResponse(
                refused=True,
                reason=result.failure_reason or "uncited_sentence",
                failed_sentence=result.failed_sentence,
                failed_chunk_id=result.failed_chunk_id,
                detail="Citation lock rejected the LLM response after one retry.",
            ).model_dump(),
        )

    # Successful answer — record cost, return citations.
    await _charge_and_commit()

    cited_ids: set[int] = set()
    for s in sentences:
        cited_ids.update(s.chunk_ids)
    cited_chunks = [c for c in candidates if c.chunk_id in cited_ids]
    citations = [
        RagCitation(
            chunk_id=c.chunk_id,
            doc_id=c.doc_id,
            doc_title=c.doc_title,
            chunk_index=c.chunk_index,
            paragraph_label=c.paragraph_label,
            text=c.text,
            score=c.score,
        )
        for c in cited_chunks
    ]

    logger.info(
        "sop_rag_answered",
        plant_id=plant_id,
        user_id=user.id,
        candidates=len(candidates),
        citations=len(citations),
        cost_usd=round(cost, 4),
    )

    return RagAnswerResponse(
        answer=answer_text,
        answer_stripped=strip_citations(answer_text),
        citations=citations,
        sentences=[{"text": s.text, "chunk_ids": s.chunk_ids} for s in sentences],
        candidate_chunk_ids=sorted(candidate_ids),
        cost_usd=round(cost, 4),
        input_tokens=total_input,
        output_tokens=total_output,
        model=last_response.model,
    )


# ---------------------------------------------------------------------------
# Budget
# ---------------------------------------------------------------------------


@router.get("/budget", response_model=RagBudgetOut)
async def get_budget(
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    license_service: LicenseService = Depends(get_license_service),
    db: AsyncSession = Depends(get_db_session),
) -> RagBudgetOut:
    _require_sop_rag(license_service)
    check_plant_role(user, plant_id, "operator")
    budget = await _get_or_create_budget(db, plant_id)
    return RagBudgetOut(
        plant_id=budget.plant_id,
        year_month=budget.year_month,
        monthly_cap_usd=budget.monthly_cap_usd,
        cost_usd=budget.cost_usd,
        query_count=budget.query_count,
        remaining_usd=max(0.0, budget.monthly_cap_usd - budget.cost_usd),
    )


@router.put("/budget", response_model=RagBudgetOut)
async def update_budget(
    payload: RagBudgetUpdate,
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    license_service: LicenseService = Depends(get_license_service),
    db: AsyncSession = Depends(get_db_session),
) -> RagBudgetOut:
    _require_sop_rag(license_service)
    check_plant_role(user, plant_id, "admin")
    budget = await _get_or_create_budget(db, plant_id)
    budget.monthly_cap_usd = payload.monthly_cap_usd
    budget.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return RagBudgetOut(
        plant_id=budget.plant_id,
        year_month=budget.year_month,
        monthly_cap_usd=budget.monthly_cap_usd,
        cost_usd=budget.cost_usd,
        query_count=budget.query_count,
        remaining_usd=max(0.0, budget.monthly_cap_usd - budget.cost_usd),
    )
