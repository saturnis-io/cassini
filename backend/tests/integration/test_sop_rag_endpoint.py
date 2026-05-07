"""Integration tests for the SOP-grounded RAG endpoints.

Covers:
* License gating (no Enterprise → 403).
* Plant-scoped multi-tenancy (A uploads, B can't see).
* Citation lock pass and refusal paths with mocked LLM provider.
* Budget enforcement.
* Retriever DB path with seeded chunks.

The LLM provider is monkey-patched so no network calls or API keys are
required. Embedder is replaced with a deterministic stub so tests are
fast and don't need sentence-transformers.
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import numpy as np
import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from cassini.api.deps import get_current_user, get_db_session, get_license_service
from cassini.api.v1.sop_rag import router as sop_rag_router
from cassini.core.ai_analysis.tools import LLMResponse
from cassini.core.rag.embeddings import BaseEmbedder
from cassini.db.models.hierarchy import Hierarchy, HierarchyType
from cassini.db.models.plant import Plant
from cassini.db.models.sop_doc import SopChunk, SopDoc, SopRagBudget
from cassini.db.models.user import User, UserPlantRole, UserRole


class _StubEmbedder(BaseEmbedder):
    """Deterministic embedder for tests — keyword overlap → cosine."""

    model_name = "stub-test"
    dim = 8

    _VOCAB = ["torque", "bolt", "lubricant", "assembly", "verify", "operator", "plant", "sop"]

    def embed(self, texts):  # type: ignore[override]
        out = np.zeros((len(texts), self.dim), dtype=np.float32)
        for i, t in enumerate(texts):
            tokens = [w.lower().strip(".,") for w in t.split()]
            for j, vw in enumerate(self._VOCAB):
                if vw in tokens:
                    out[i, j] = 1.0
            norm = np.linalg.norm(out[i])
            if norm:
                out[i] /= norm
        return out


class _StubLicense:
    def __init__(self, has_sop_rag: bool = True) -> None:
        self._has_sop_rag = has_sop_rag

    def has_feature(self, feature: str) -> bool:
        if feature == "sop-rag":
            return self._has_sop_rag
        return False


class _StubPlantRole:
    def __init__(self, plant_id: int, role: UserRole) -> None:
        self.plant_id = plant_id
        self.role = role


class _StubUser:
    def __init__(self, user_id: int, plant_id: int, role: UserRole) -> None:
        self.id = user_id
        self.username = f"user{user_id}"
        self.is_active = True
        self.plant_roles = [_StubPlantRole(plant_id=plant_id, role=role)]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def two_plants(async_session):
    plant_a = Plant(name="Plant A", code="PA")
    plant_b = Plant(name="Plant B", code="PB")
    async_session.add_all([plant_a, plant_b])
    await async_session.commit()
    await async_session.refresh(plant_a)
    await async_session.refresh(plant_b)
    return plant_a, plant_b


@pytest_asyncio.fixture
async def engineer_a(two_plants):
    return _StubUser(101, two_plants[0].id, UserRole.engineer)


@pytest_asyncio.fixture
async def engineer_b(two_plants):
    return _StubUser(102, two_plants[1].id, UserRole.engineer)


def _build_app(async_session, user, license_obj=None) -> FastAPI:
    app = FastAPI()
    app.include_router(sop_rag_router)

    async def override_session():
        yield async_session

    def override_user():
        return user

    def override_license():
        return license_obj or _StubLicense(has_sop_rag=True)

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[get_license_service] = override_license
    return app


@pytest_asyncio.fixture
async def client_a(async_session, engineer_a):
    app = _build_app(async_session, engineer_a)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def client_b(async_session, engineer_b):
    app = _build_app(async_session, engineer_b)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def seeded_chunks(async_session, two_plants):
    """Seed plant A with 3 SOP chunks pre-embedded by the stub."""
    plant_a, plant_b = two_plants
    embedder = _StubEmbedder()

    doc = SopDoc(
        plant_id=plant_a.id,
        title="Bolt torque procedure",
        filename="torque.txt",
        content_type="text/plain",
        storage_path="/tmp/torque.txt",
        byte_size=100,
        char_count=300,
        chunk_count=3,
        embedding_model="stub-test",
        status="ready",
    )
    async_session.add(doc)
    await async_session.flush()

    texts = [
        "Tighten the bolt to torque spec before assembly.",
        "Apply lubricant before final assembly.",
        "Verify operator sign-off after assembly.",
    ]
    arr = embedder.embed(texts)
    for i, txt in enumerate(texts):
        async_session.add(
            SopChunk(
                doc_id=doc.id,
                plant_id=plant_a.id,
                chunk_index=i,
                text=txt,
                token_count=len(txt.split()),
                paragraph_label=None,
                embedding=embedder.to_bytes(arr[i]),
                embedding_dim=embedder.dim,
            )
        )

    # Plant B owns one chunk so cross-plant tests have a target.
    doc_b = SopDoc(
        plant_id=plant_b.id,
        title="Plant B doc",
        filename="b.txt",
        content_type="text/plain",
        storage_path="/tmp/b.txt",
        byte_size=50,
        char_count=50,
        chunk_count=1,
        embedding_model="stub-test",
        status="ready",
    )
    async_session.add(doc_b)
    await async_session.flush()
    async_session.add(
        SopChunk(
            doc_id=doc_b.id,
            plant_id=plant_b.id,
            chunk_index=0,
            text="Plant B confidential procedure.",
            token_count=4,
            paragraph_label=None,
            embedding=embedder.to_bytes(embedder.embed(["plant"])[0]),
            embedding_dim=embedder.dim,
        )
    )
    await async_session.commit()
    return doc


@pytest.fixture
def patch_embedder(monkeypatch):
    """Replace create_embedder so router uses StubEmbedder."""
    from cassini.api.v1 import sop_rag as router_mod

    monkeypatch.setattr(router_mod, "create_embedder", lambda name="local": _StubEmbedder())


@pytest.fixture
def patch_anthropic_key(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-fake-key")


def _mock_provider_response(text: str, input_tokens: int = 100, output_tokens: int = 50):
    """Build a canned ClaudeProvider.generate response."""
    return LLMResponse(
        content=text,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        model="claude-sonnet-4-6",
        tool_calls=[],
        stop_reason="end_turn",
        _raw_messages=[],
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_license_gate_blocks_without_sop_rag_feature(
    async_session, engineer_a, two_plants
):
    """Community / Pro users should hit 403 even if route reaches the handler."""
    app = _build_app(async_session, engineer_a, _StubLicense(has_sop_rag=False))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/v1/sop-rag/docs", params={"plant_id": two_plants[0].id})
    assert r.status_code == 403
    assert "Enterprise" in r.json()["detail"]


@pytest.mark.asyncio
async def test_list_docs_plant_scoped(client_a, two_plants, seeded_chunks):
    """Engineer A sees plant-A docs; only their plant's docs."""
    plant_a, plant_b = two_plants
    r = await client_a.get("/api/v1/sop-rag/docs", params={"plant_id": plant_a.id})
    assert r.status_code == 200
    items = r.json()["items"]
    titles = {item["title"] for item in items}
    assert "Bolt torque procedure" in titles
    assert "Plant B doc" not in titles


@pytest.mark.asyncio
async def test_list_docs_cross_plant_returns_403(
    client_a, two_plants, seeded_chunks
):
    """Engineer A asking for plant B's docs hits the role check."""
    _, plant_b = two_plants
    r = await client_a.get("/api/v1/sop-rag/docs", params={"plant_id": plant_b.id})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_query_returns_cited_answer(
    monkeypatch, client_a, two_plants, seeded_chunks, patch_embedder, patch_anthropic_key
):
    """Mocked LLM returns a well-cited answer; endpoint returns 200 with citations."""
    plant_a, _ = two_plants

    async def fake_generate(self, *_, **__):
        # We don't know the chunk_ids ahead of time — use ids from seeded chunks.
        # The seeded_chunks fixture creates plant A chunks with sequential ids
        # starting at 1 (because plants are inserted first then chunks).
        # The retriever surfaces them by score; we cite all 3.
        return _mock_provider_response(
            "Tighten to spec [citation:1]. Apply lubricant [citation:2]. "
            "Verify sign-off [citation:3]."
        )

    monkeypatch.setattr(
        "cassini.core.ai_analysis.providers.ClaudeProvider.generate", fake_generate
    )

    r = await client_a.post(
        "/api/v1/sop-rag/query",
        params={"plant_id": plant_a.id},
        json={"question": "How do I assemble the bolt?"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["refused"] is False
    assert len(body["citations"]) >= 1
    assert body["cost_usd"] > 0
    assert "[citation:" in body["answer"]
    assert "[citation:" not in body["answer_stripped"]


@pytest.mark.asyncio
async def test_query_refuses_uncited_response_after_retry(
    monkeypatch, client_a, two_plants, seeded_chunks, patch_embedder, patch_anthropic_key
):
    """Mocked LLM returns uncited content twice; endpoint returns 422."""
    plant_a, _ = two_plants

    call_count = {"n": 0}

    async def fake_generate(self, *_, **__):
        call_count["n"] += 1
        return _mock_provider_response(
            "This is an uncited claim. Another claim with no citation."
        )

    monkeypatch.setattr(
        "cassini.core.ai_analysis.providers.ClaudeProvider.generate", fake_generate
    )

    r = await client_a.post(
        "/api/v1/sop-rag/query",
        params={"plant_id": plant_a.id},
        json={"question": "How do I assemble the bolt?"},
    )
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert detail["refused"] is True
    assert detail["reason"] == "uncited_sentence"
    # Exactly two attempts: standard then strict-retry.
    assert call_count["n"] == 2


@pytest.mark.asyncio
async def test_query_refuses_chunk_outside_candidate_set(
    monkeypatch, client_a, two_plants, seeded_chunks, patch_embedder, patch_anthropic_key
):
    """Mocked LLM cites chunk_id 999 which doesn't exist in candidate set."""
    plant_a, _ = two_plants

    async def fake_generate(self, *_, **__):
        return _mock_provider_response("Bogus answer [citation:999].")

    monkeypatch.setattr(
        "cassini.core.ai_analysis.providers.ClaudeProvider.generate", fake_generate
    )

    r = await client_a.post(
        "/api/v1/sop-rag/query",
        params={"plant_id": plant_a.id},
        json={"question": "Anything?"},
    )
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert detail["reason"] == "out_of_set"
    assert detail["failed_chunk_id"] == 999


@pytest.mark.asyncio
async def test_query_charges_first_attempt_when_retry_provider_fails(
    monkeypatch, async_session, client_a, two_plants, seeded_chunks,
    patch_embedder, patch_anthropic_key,
):
    """First-attempt fails citation lock; retry raises provider error → 503 + budget charged."""
    plant_a, _ = two_plants

    call_count = {"n": 0}

    async def fake_generate(self, *_, **__):
        call_count["n"] += 1
        if call_count["n"] == 1:
            return _mock_provider_response(
                "Uncited claim about torque.", input_tokens=200, output_tokens=80
            )
        raise RuntimeError("simulated provider 5xx")

    monkeypatch.setattr(
        "cassini.core.ai_analysis.providers.ClaudeProvider.generate", fake_generate
    )

    r = await client_a.post(
        "/api/v1/sop-rag/query",
        params={"plant_id": plant_a.id},
        json={"question": "How do I assemble the bolt?"},
    )
    assert r.status_code == 503
    assert "first-attempt tokens charged" in r.text.lower() or "retry" in r.text.lower()

    # Budget got charged for the first attempt's spend.
    from sqlalchemy import select

    budget = (
        await async_session.execute(
            select(SopRagBudget).where(SopRagBudget.plant_id == plant_a.id)
        )
    ).scalar_one()
    assert budget.cost_usd > 0
    assert budget.query_count == 1


@pytest.mark.asyncio
async def test_query_no_indexed_chunks_returns_422(
    monkeypatch, client_a, two_plants, patch_embedder, patch_anthropic_key
):
    """Plant has no SOP docs → 422 with reason 'no_relevant_chunks'."""
    plant_a, _ = two_plants
    # No seeded_chunks fixture → empty corpus.
    r = await client_a.post(
        "/api/v1/sop-rag/query",
        params={"plant_id": plant_a.id},
        json={"question": "anything"},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["reason"] == "no_relevant_chunks"


@pytest.mark.asyncio
async def test_budget_get_creates_row_with_default_cap(
    client_a, two_plants
):
    plant_a, _ = two_plants
    r = await client_a.get("/api/v1/sop-rag/budget", params={"plant_id": plant_a.id})
    assert r.status_code == 200
    body = r.json()
    assert body["plant_id"] == plant_a.id
    assert body["monthly_cap_usd"] == 50.0
    assert body["cost_usd"] == 0.0
    assert body["remaining_usd"] == 50.0


@pytest.mark.asyncio
async def test_budget_exceeded_returns_402(
    monkeypatch, async_session, client_a, two_plants, seeded_chunks,
    patch_embedder, patch_anthropic_key,
):
    """Pre-charge the budget over the cap; query returns 402."""
    plant_a, _ = two_plants

    # Charge the budget over the cap before calling.
    from datetime import datetime, timezone

    ym = datetime.now(timezone.utc).strftime("%Y-%m")
    budget = SopRagBudget(
        plant_id=plant_a.id,
        year_month=ym,
        monthly_cap_usd=10.0,
        cost_usd=11.0,
        query_count=5,
    )
    async_session.add(budget)
    await async_session.commit()

    r = await client_a.post(
        "/api/v1/sop-rag/query",
        params={"plant_id": plant_a.id},
        json={"question": "anything"},
    )
    assert r.status_code == 402
    detail = r.json()["detail"]
    assert detail["reason"] == "budget_exceeded"


@pytest.mark.asyncio
async def test_get_doc_404_for_other_plant(
    client_a, client_b, two_plants, seeded_chunks
):
    """Cross-plant get_doc returns 404 — never reveals existence to non-members."""
    a_doc_id = seeded_chunks.id
    r = await client_b.get(f"/api/v1/sop-rag/docs/{a_doc_id}")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_doc_success_engineer_owner(
    async_session, client_a, two_plants, seeded_chunks
):
    a_doc_id = seeded_chunks.id
    r = await client_a.delete(f"/api/v1/sop-rag/docs/{a_doc_id}")
    assert r.status_code == 204

    # Confirm cascade — the chunks for this doc are gone.
    from sqlalchemy import select

    remaining = (
        await async_session.execute(
            select(SopChunk).where(SopChunk.doc_id == a_doc_id)
        )
    ).scalars().all()
    assert remaining == []


@pytest.mark.asyncio
async def test_retriever_returns_only_plant_a_chunks(
    async_session, two_plants, seeded_chunks
):
    """Direct retriever call — plant A query never returns plant B's chunk."""
    from cassini.core.rag.retriever import HybridRetriever

    plant_a, plant_b = two_plants
    embedder = _StubEmbedder()
    retriever = HybridRetriever(async_session, embedder)

    out = await retriever.retrieve(plant_id=plant_a.id, query="bolt torque", top_k=10)
    plant_ids = {c.plant_id for c in out}
    assert plant_ids == {plant_a.id} or plant_ids == set()  # never includes plant_b
    assert plant_b.id not in plant_ids
