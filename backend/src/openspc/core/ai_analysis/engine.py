"""AIAnalysisEngine -- on-demand LLM-powered chart analysis."""
from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timezone, timedelta
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.core.ai_analysis.context_builder import build_context
from openspc.core.ai_analysis.prompts import SYSTEM_PROMPT, build_analysis_prompt
from openspc.core.ai_analysis.providers import create_provider

logger = structlog.get_logger(__name__)


class AINotConfigured(Exception):
    """Raised when AI provider is not configured or disabled."""


class AIAnalysisEngine:
    """On-demand AI-powered chart analysis engine.

    Workflow:
    1. Load AI config for plant (Fernet-encrypted API key)
    2. Build chart context from DB (characteristic, samples, violations, etc.)
    3. Check cache (same context hash within 1 hour)
    4. Call LLM provider (Claude or OpenAI)
    5. Parse structured JSON response
    6. Persist insight to ``ai_insight`` table
    7. Return structured result dict
    """

    async def analyze(
        self, session: AsyncSession, char_id: int, plant_id: int
    ) -> dict:
        """Generate AI analysis for a characteristic's chart.

        Args:
            session: Active async DB session.
            char_id: Characteristic ID to analyze.
            plant_id: Plant ID for config lookup.

        Returns:
            Dict with summary, patterns, risks, recommendations, and metadata.

        Raises:
            AINotConfigured: If AI provider is not set up or disabled.
            ValueError: If LLM call fails.
        """
        from openspc.db.models.ai_config import AIProviderConfig, AIInsight

        # Load config
        config_stmt = select(AIProviderConfig).where(
            AIProviderConfig.plant_id == plant_id
        )
        config_result = await session.execute(config_stmt)
        config = config_result.scalar_one_or_none()

        if not config or not config.is_enabled:
            raise AINotConfigured(
                "AI analysis is not configured or disabled for this plant"
            )

        # Pre-extract config values to avoid repeated ORM access
        provider_type = config.provider_type
        model_name = config.model_name
        max_tokens = config.max_tokens

        # Decrypt API key
        try:
            api_key = config.decrypted_api_key
        except Exception:
            raise AINotConfigured("AI API key could not be decrypted")

        if not api_key:
            raise AINotConfigured("AI API key is not set")

        # Build context
        context = await build_context(session, char_id)

        # Compute context hash for caching (based on data that changes)
        context_dict = {
            "characteristic": context.characteristic,
            "control_limits": context.control_limits,
            "recent_values": context.recent_values,
            "statistics": context.statistics,
        }
        context_json = json.dumps(context_dict, sort_keys=True, default=str)
        context_hash = hashlib.sha256(context_json.encode()).hexdigest()

        # Check cache (same hash within 1 hour)
        one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
        cache_stmt = (
            select(AIInsight)
            .where(
                AIInsight.characteristic_id == char_id,
                AIInsight.context_hash == context_hash,
                AIInsight.generated_at > one_hour_ago,
            )
            .order_by(AIInsight.generated_at.desc())
            .limit(1)
        )
        cache_result = await session.execute(cache_stmt)
        cached = cache_result.scalar_one_or_none()

        if cached:
            logger.info("ai_analysis_cache_hit", char_id=char_id)
            return _insight_to_dict(cached)

        # Build prompt
        user_prompt = build_analysis_prompt(
            {
                "characteristic": context.characteristic,
                "control_limits": context.control_limits,
                "recent_values": context.recent_values,
                "statistics": context.statistics,
                "capability": context.capability,
                "violations": context.violations,
                "anomalies": context.anomalies,
                "chart_patterns": context.chart_patterns,
            }
        )

        # Call LLM
        start_time = time.monotonic()
        try:
            provider = create_provider(
                provider_type, api_key, model_name, max_tokens
            )
            llm_response = await provider.generate(SYSTEM_PROMPT, user_prompt)
        except Exception as e:
            logger.warning(
                "ai_analysis_llm_error", char_id=char_id, error=str(e)
            )
            raise ValueError(
                "AI analysis failed. Check server logs for details."
            )

        latency_ms = int((time.monotonic() - start_time) * 1000)

        # Parse response
        summary, patterns, risks, recommendations = _parse_llm_response(
            llm_response.content
        )

        # Persist insight
        insight = AIInsight(
            characteristic_id=char_id,
            provider_type=provider_type,
            model_name=llm_response.model,
            context_hash=context_hash,
            summary=summary,
            patterns=json.dumps(patterns),
            risks=json.dumps(risks),
            recommendations=json.dumps(recommendations),
            tokens_used=llm_response.input_tokens + llm_response.output_tokens,
            latency_ms=latency_ms,
        )
        session.add(insight)
        await session.commit()
        await session.refresh(insight)

        return _insight_to_dict(insight)

    async def test_connection(
        self, session: AsyncSession, plant_id: int
    ) -> dict:
        """Test LLM connection with a minimal prompt.

        Args:
            session: Active async DB session.
            plant_id: Plant ID for config lookup.

        Returns:
            Dict with status ("connected" or "failed") and metadata.
        """
        from openspc.db.models.ai_config import AIProviderConfig

        config_stmt = select(AIProviderConfig).where(
            AIProviderConfig.plant_id == plant_id
        )
        config_result = await session.execute(config_stmt)
        config = config_result.scalar_one_or_none()

        if not config:
            raise AINotConfigured("No AI configuration found")

        try:
            api_key = config.decrypted_api_key
        except Exception:
            raise AINotConfigured("AI API key could not be decrypted")

        if not api_key:
            raise AINotConfigured("AI API key is not set")

        try:
            provider = create_provider(
                config.provider_type, api_key, config.model_name, config.max_tokens
            )
            response = await provider.generate(
                "You are a test assistant.",
                "Reply with exactly: CONNECTION_OK",
            )
            return {
                "status": "connected",
                "model": response.model,
                "tokens_used": response.input_tokens + response.output_tokens,
            }
        except Exception as e:
            logger.warning("ai_test_connection_failed", error=str(e))
            return {
                "status": "failed",
                "message": "Connection test failed. Check API key and network connectivity.",
            }


def _parse_llm_response(
    content: str,
) -> tuple[str, list[str], list[str], list[str]]:
    """Parse LLM response, expecting JSON format but handling fallbacks.

    The LLM is instructed to return JSON with summary, patterns, risks,
    and recommendations fields.  If the response is wrapped in markdown
    code fences we strip them first.  On any parse failure the raw text
    is used as the summary with empty structured fields.
    """
    try:
        # Try to extract JSON from response (may have markdown code fences)
        json_str = content
        if "```json" in content:
            json_str = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            json_str = content.split("```")[1].split("```")[0].strip()

        data = json.loads(json_str)
        return (
            data.get("summary", content[:500]),
            data.get("patterns", []),
            data.get("risks", []),
            data.get("recommendations", []),
        )
    except (json.JSONDecodeError, IndexError, KeyError):
        # Fallback: use raw text as summary
        return content[:2000], [], [], []


def _insight_to_dict(insight: Any) -> dict:
    """Convert AIInsight model to response dict."""
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

    return {
        "id": insight.id,
        "characteristic_id": insight.characteristic_id,
        "summary": insight.summary,
        "patterns": patterns,
        "risks": risks,
        "recommendations": recommendations,
        "provider_type": insight.provider_type,
        "model_name": insight.model_name,
        "tokens_used": insight.tokens_used,
        "latency_ms": insight.latency_ms,
        "generated_at": (
            insight.generated_at.isoformat() if insight.generated_at else None
        ),
    }
