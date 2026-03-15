"""AI analysis tool definitions and executor for agentic tool-use.

Defines read-only tools that an LLM can invoke to autonomously investigate
SPC quality data during analysis. The ToolExecutor resolves each tool call
against the database and returns structured JSON results.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Data types for the tool-use protocol
# ---------------------------------------------------------------------------


@dataclass
class ToolDef:
    """Definition of a tool the LLM may call."""

    name: str
    description: str
    input_schema: dict  # JSON Schema


@dataclass
class ToolCall:
    """A tool invocation requested by the LLM."""

    tool_name: str
    tool_input: dict
    call_id: str  # Provider-assigned ID for matching results


@dataclass
class ToolResult:
    """Result of executing a tool call."""

    call_id: str
    content: str  # JSON string of tool output


@dataclass
class LLMResponse:
    """Structured response from an LLM provider (tool-use aware)."""

    content: str | None  # Text response (None if tool_use stop)
    input_tokens: int = 0
    output_tokens: int = 0
    model: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    stop_reason: str = "end_turn"  # "end_turn" or "tool_use"
    # Raw message blocks for multi-turn conversation threading
    _raw_messages: list[dict] = field(default_factory=list, repr=False)


# ---------------------------------------------------------------------------
# Tool definitions — read-only SPC investigation tools
# ---------------------------------------------------------------------------


ANALYSIS_TOOLS: list[ToolDef] = [
    ToolDef(
        name="get_violations",
        description=(
            "Get recent SPC rule violations for this characteristic. "
            "Returns violation type, severity, timestamp, and acknowledgment status."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "days": {
                    "type": "integer",
                    "description": "Number of days to look back",
                    "default": 7,
                },
                "limit": {
                    "type": "integer",
                    "description": "Max violations to return",
                    "default": 20,
                },
            },
        },
    ),
    ToolDef(
        name="get_capability",
        description=(
            "Get current process capability indices (Cp, Cpk, Pp, Ppk) "
            "and their confidence intervals for this characteristic."
        ),
        input_schema={"type": "object", "properties": {}},
    ),
    ToolDef(
        name="get_sibling_characteristics",
        description=(
            "Get characteristics measured on the same station/line. "
            "Useful for checking if a process shift affected multiple "
            "dimensions simultaneously."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "include_recent_violations": {
                    "type": "boolean",
                    "default": True,
                },
            },
        },
    ),
    ToolDef(
        name="get_anomaly_events",
        description=(
            "Get recent anomaly detection events (changepoints, "
            "distribution shifts, outliers) for this characteristic."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "days": {
                    "type": "integer",
                    "default": 14,
                },
                "limit": {
                    "type": "integer",
                    "default": 10,
                },
            },
        },
    ),
]


# ---------------------------------------------------------------------------
# Tool executor
# ---------------------------------------------------------------------------


class ToolExecutor:
    """Executes tool calls against the database.

    All tools are read-only and scoped to a single characteristic.
    """

    def __init__(self, session: AsyncSession, characteristic_id: int) -> None:
        self._session = session
        self._char_id = characteristic_id

    async def execute(self, tool_call: ToolCall) -> ToolResult:
        """Dispatch a tool call to the appropriate handler.

        Unknown tools and handler exceptions return structured error
        JSON rather than raising, so the LLM can react gracefully.
        """
        handler = getattr(self, f"_tool_{tool_call.tool_name}", None)
        if not handler:
            return ToolResult(
                call_id=tool_call.call_id,
                content=json.dumps({"error": "Unknown tool"}),
            )
        try:
            result = await handler(tool_call.tool_input)
            return ToolResult(
                call_id=tool_call.call_id,
                content=json.dumps(result, default=str),
            )
        except Exception as exc:
            logger.warning(
                "tool_execution_failed",
                tool=tool_call.tool_name,
                error=str(exc),
            )
            return ToolResult(
                call_id=tool_call.call_id,
                content=json.dumps({"error": "Tool execution failed"}),
            )

    # -- Individual tool handlers -------------------------------------------

    async def _tool_get_violations(self, inputs: dict) -> dict[str, Any]:
        """Query recent SPC rule violations for the characteristic."""
        from cassini.db.models.violation import Violation

        days = min(max(int(inputs.get("days", 7)), 1), 90)
        limit = min(max(int(inputs.get("limit", 20)), 1), 100)
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        stmt = (
            select(Violation)
            .where(
                Violation.char_id == self._char_id,
                Violation.created_at >= cutoff,
            )
            .order_by(Violation.created_at.desc())
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        violations = list(result.scalars().all())

        return {
            "characteristic_id": self._char_id,
            "days_back": days,
            "total_found": len(violations),
            "violations": [
                {
                    "rule_id": v.rule_id,
                    "rule_name": v.rule_name,
                    "severity": v.severity,
                    "acknowledged": v.acknowledged,
                    "created_at": (
                        v.created_at.isoformat() if v.created_at else None
                    ),
                }
                for v in violations
            ],
        }

    async def _tool_get_capability(self, inputs: dict) -> dict[str, Any]:
        """Query the most recent capability snapshot."""
        from cassini.db.models.capability import CapabilityHistory

        stmt = (
            select(CapabilityHistory)
            .where(CapabilityHistory.characteristic_id == self._char_id)
            .order_by(CapabilityHistory.calculated_at.desc())
            .limit(1)
        )
        result = await self._session.execute(stmt)
        cap = result.scalar_one_or_none()

        if not cap:
            return {
                "characteristic_id": self._char_id,
                "available": False,
                "message": "No capability data has been calculated yet.",
            }

        return {
            "characteristic_id": self._char_id,
            "available": True,
            "cp": cap.cp,
            "cpk": cap.cpk,
            "pp": cap.pp,
            "ppk": cap.ppk,
            "cpm": cap.cpm,
            "sample_count": cap.sample_count,
            "normality_p_value": cap.normality_p_value,
            "normality_test": cap.normality_test,
            "calculated_at": cap.calculated_at.isoformat() if cap.calculated_at else None,
        }

    async def _tool_get_sibling_characteristics(
        self, inputs: dict
    ) -> dict[str, Any]:
        """Query characteristics on the same hierarchy node (station/line)."""
        from cassini.db.models.characteristic import Characteristic
        from cassini.db.models.violation import Violation

        include_violations = inputs.get("include_recent_violations", True)

        # First, find the hierarchy_id of the current characteristic
        char_stmt = select(Characteristic.hierarchy_id).where(
            Characteristic.id == self._char_id
        )
        char_result = await self._session.execute(char_stmt)
        hierarchy_id = char_result.scalar_one_or_none()

        if hierarchy_id is None:
            return {
                "characteristic_id": self._char_id,
                "siblings": [],
                "message": "Characteristic not found.",
            }

        # Find sibling characteristics on the same hierarchy node
        sibling_stmt = (
            select(Characteristic)
            .where(
                Characteristic.hierarchy_id == hierarchy_id,
                Characteristic.id != self._char_id,
            )
        )
        sibling_result = await self._session.execute(sibling_stmt)
        siblings = list(sibling_result.scalars().all())

        sibling_data: list[dict[str, Any]] = []
        for sib in siblings:
            entry: dict[str, Any] = {
                "id": sib.id,
                "name": sib.name,
                "chart_type": sib.chart_type,
                "usl": sib.usl,
                "lsl": sib.lsl,
            }

            if include_violations:
                cutoff = datetime.now(timezone.utc) - timedelta(days=7)
                viol_stmt = (
                    select(func.count())
                    .select_from(Violation)
                    .where(
                        Violation.char_id == sib.id,
                        Violation.created_at >= cutoff,
                    )
                )
                viol_result = await self._session.execute(viol_stmt)
                entry["recent_violation_count"] = viol_result.scalar() or 0

            sibling_data.append(entry)

        return {
            "characteristic_id": self._char_id,
            "hierarchy_id": hierarchy_id,
            "sibling_count": len(sibling_data),
            "siblings": sibling_data,
        }

    async def _tool_get_anomaly_events(self, inputs: dict) -> dict[str, Any]:
        """Query recent anomaly detection events."""
        from cassini.db.models.anomaly import AnomalyEvent

        days = min(max(int(inputs.get("days", 14)), 1), 90)
        limit = min(max(int(inputs.get("limit", 10)), 1), 100)
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        stmt = (
            select(AnomalyEvent)
            .where(
                AnomalyEvent.char_id == self._char_id,
                AnomalyEvent.detected_at >= cutoff,
            )
            .order_by(AnomalyEvent.detected_at.desc())
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        events = list(result.scalars().all())

        return {
            "characteristic_id": self._char_id,
            "days_back": days,
            "total_found": len(events),
            "events": [
                {
                    "event_type": e.event_type,
                    "detector_type": e.detector_type,
                    "severity": e.severity,
                    "summary": (e.summary[:200] if e.summary else ""),
                    "is_acknowledged": e.is_acknowledged,
                    "is_dismissed": e.is_dismissed,
                    "detected_at": (
                        e.detected_at.isoformat() if e.detected_at else None
                    ),
                }
                for e in events
            ],
        }
