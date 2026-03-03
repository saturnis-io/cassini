"""AI Analysis API endpoints.

Provides AI provider configuration (per-plant), on-demand LLM analysis
of SPC chart data, insight history, and connection testing.
"""

import json
import time
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    check_plant_role,
    get_current_user,
    get_db_session,
    resolve_plant_id_for_characteristic,
)
from cassini.api.schemas.ai_analysis import (
    AIConfigResponse,
    AIConfigUpdate,
    AIInsightResponse,
    AITestResponse,
)
from cassini.db.models.ai_config import AIInsight, AIProviderConfig
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/ai", tags=["ai_analysis"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _config_to_response(config: AIProviderConfig, plant_id: int) -> AIConfigResponse:
    """Build AIConfigResponse from a model, masking the API key."""
    return AIConfigResponse(
        id=config.id,
        plant_id=plant_id,
        provider_type=config.provider_type,
        model_name=config.model_name,
        max_tokens=config.max_tokens,
        is_enabled=config.is_enabled,
        has_api_key=bool(config.api_key),
        base_url=config.base_url,
        azure_resource_name=config.azure_resource_name,
        azure_deployment_id=config.azure_deployment_id,
        azure_api_version=config.azure_api_version,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


def _insight_to_response(
    insight: AIInsight, char_name: str | None = None
) -> AIInsightResponse:
    """Build AIInsightResponse from a model, parsing JSON text fields."""
    patterns: list[str] = []
    risks: list[str] = []
    recommendations: list[str] = []

    try:
        if insight.patterns:
            patterns = json.loads(insight.patterns)
    except (json.JSONDecodeError, TypeError):
        pass
    try:
        if insight.risks:
            risks = json.loads(insight.risks)
    except (json.JSONDecodeError, TypeError):
        pass
    try:
        if insight.recommendations:
            recommendations = json.loads(insight.recommendations)
    except (json.JSONDecodeError, TypeError):
        pass

    return AIInsightResponse(
        id=insight.id,
        characteristic_id=insight.characteristic_id,
        characteristic_name=char_name,
        provider_type=insight.provider_type,
        model_name=insight.model_name,
        summary=insight.summary,
        patterns=patterns,
        risks=risks,
        recommendations=recommendations,
        tokens_used=insight.tokens_used,
        latency_ms=insight.latency_ms,
        generated_at=insight.generated_at,
    )


async def _get_char_name(session: AsyncSession, char_id: int) -> str | None:
    """Get characteristic name by ID."""
    stmt = select(Characteristic.name).where(Characteristic.id == char_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


# ===========================================================================
# CONFIGURATION ENDPOINTS (static paths first)
# ===========================================================================


@router.get("/config", response_model=AIConfigResponse)
async def get_ai_config(
    plant_id: int = Query(..., description="Plant ID"),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> AIConfigResponse:
    """Get AI configuration for a plant.

    Returns default values if no configuration exists yet.
    Requires engineer+ role for the plant.
    """
    check_plant_role(user, plant_id, "engineer")

    stmt = select(AIProviderConfig).where(AIProviderConfig.plant_id == plant_id)
    result = await session.execute(stmt)
    config = result.scalar_one_or_none()

    if config is None:
        # Return defaults with no persisted ID
        return AIConfigResponse(plant_id=plant_id)

    return _config_to_response(config, plant_id)


@router.put("/config", response_model=AIConfigResponse)
async def update_ai_config(
    body: AIConfigUpdate,
    plant_id: int = Query(..., description="Plant ID"),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> AIConfigResponse:
    """Update AI configuration for a plant.

    Upserts: creates a new config if none exists.
    API key is Fernet-encrypted before storage and never returned.
    Requires admin role for the plant.
    """
    check_plant_role(user, plant_id, "admin")

    stmt = select(AIProviderConfig).where(AIProviderConfig.plant_id == plant_id)
    result = await session.execute(stmt)
    config = result.scalar_one_or_none()

    if config is None:
        config = AIProviderConfig(plant_id=plant_id)
        session.add(config)

    update_data = body.model_dump(exclude_unset=True)

    # Handle API key encryption separately
    if "api_key" in update_data:
        raw_key = update_data.pop("api_key")
        if raw_key is not None:
            from cassini.db.dialects import encrypt_password, get_encryption_key

            enc_key = get_encryption_key()
            config.api_key = encrypt_password(raw_key, enc_key)

    # Apply remaining fields (only known model columns)
    _allowed_fields = {
        "provider_type", "model_name", "max_tokens", "is_enabled",
        "base_url", "azure_resource_name", "azure_deployment_id",
        "azure_api_version",
    }
    for field, value in update_data.items():
        if field in _allowed_fields:
            setattr(config, field, value)

    config.updated_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(config)

    logger.info(
        "ai_config_updated",
        plant_id=plant_id,
        user=user.username,
        fields=list(body.model_dump(exclude_unset=True).keys()),
    )

    return _config_to_response(config, plant_id)


@router.post("/test", response_model=AITestResponse)
async def test_ai_connection(
    plant_id: int = Query(..., description="Plant ID"),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> AITestResponse:
    """Test LLM connection for a plant's AI configuration.

    Sends a minimal test prompt and reports success/failure with latency.
    Requires admin role for the plant.
    """
    check_plant_role(user, plant_id, "admin")

    from cassini.core.ai_analysis import AIAnalysisEngine, AINotConfigured

    engine = AIAnalysisEngine()
    start_time = time.monotonic()

    try:
        result = await engine.test_connection(session, plant_id)
        latency_ms = int((time.monotonic() - start_time) * 1000)

        if result.get("status") == "connected":
            return AITestResponse(
                success=True,
                message=f"Connected to {result.get('model', 'LLM')} successfully",
                latency_ms=latency_ms,
            )
        else:
            return AITestResponse(
                success=False,
                message="Connection test failed. Check API key and network connectivity.",
                latency_ms=latency_ms,
            )
    except AINotConfigured:
        return AITestResponse(
            success=False,
            message="AI analysis not configured for this plant",
        )
    except Exception:
        logger.exception("ai_test_connection_error", plant_id=plant_id)
        return AITestResponse(
            success=False,
            message="Connection test failed. Check server logs for details.",
        )


# ===========================================================================
# ANALYSIS AND INSIGHT ENDPOINTS (parameterized paths)
# ===========================================================================


@router.post("/analyze/{char_id}", response_model=AIInsightResponse)
async def analyze_characteristic(
    char_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> AIInsightResponse:
    """Generate AI analysis for a characteristic's chart data.

    Resolves plant from characteristic, loads AI config, calls the LLM,
    and persists the insight. Returns cached insight if available.
    Requires engineer+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "engineer")

    from cassini.core.ai_analysis import AIAnalysisEngine, AINotConfigured

    engine = AIAnalysisEngine()

    try:
        result = await engine.analyze(session, char_id, plant_id)
    except AINotConfigured:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="AI analysis not configured for this plant",
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI analysis failed. Please try again later.",
        )
    except TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="AI analysis timed out. Please try again later.",
        )
    except Exception:
        logger.exception("ai_analysis_error", char_id=char_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during AI analysis",
        )

    char_name = await _get_char_name(session, char_id)

    logger.info(
        "ai_analysis_generated",
        char_id=char_id,
        user=user.username,
        tokens=result.get("tokens_used"),
    )

    return AIInsightResponse(
        id=result["id"],
        characteristic_id=result["characteristic_id"],
        characteristic_name=char_name,
        provider_type=result["provider_type"],
        model_name=result["model_name"],
        summary=result["summary"],
        patterns=result.get("patterns", []),
        risks=result.get("risks", []),
        recommendations=result.get("recommendations", []),
        tokens_used=result.get("tokens_used"),
        latency_ms=result.get("latency_ms"),
        generated_at=result["generated_at"],
    )


@router.get("/insights/{char_id}", response_model=AIInsightResponse)
async def get_latest_insight(
    char_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> AIInsightResponse:
    """Get the most recent AI insight for a characteristic.

    Requires engineer+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "engineer")

    stmt = (
        select(AIInsight)
        .where(AIInsight.characteristic_id == char_id)
        .order_by(AIInsight.generated_at.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    insight = result.scalar_one_or_none()

    if insight is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No AI insights found for characteristic {char_id}",
        )

    char_name = await _get_char_name(session, char_id)
    return _insight_to_response(insight, char_name)


@router.get("/insights/{char_id}/history", response_model=list[AIInsightResponse])
async def get_insight_history(
    char_id: int,
    limit: int = Query(10, ge=1, le=100, description="Maximum results to return"),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[AIInsightResponse]:
    """Get past AI insights for a characteristic.

    Requires engineer+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "engineer")

    stmt = (
        select(AIInsight)
        .where(AIInsight.characteristic_id == char_id)
        .order_by(AIInsight.generated_at.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    insights = list(result.scalars().all())

    char_name = await _get_char_name(session, char_id)
    return [_insight_to_response(i, char_name) for i in insights]
