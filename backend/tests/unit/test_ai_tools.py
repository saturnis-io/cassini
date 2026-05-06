"""Unit tests for AI tool-use abstraction.

Tests cover:
- ToolExecutor dispatching and error handling
- Individual tool handlers with mocked DB sessions
- ClaudeProvider tool-use response parsing
- OpenAI provider tool-use response parsing
- Engine tool loop with mocked provider
- Max iteration guard
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from cassini.core.ai_analysis.tools import (
    ANALYSIS_TOOLS,
    LLMResponse,
    ToolCall,
    ToolDef,
    ToolExecutor,
    ToolResult,
)
from cassini.core.ai_analysis.providers import (
    _parse_claude_response,
    _parse_openai_response,
    _embed_tools_in_prompt,
)
from cassini.core.ai_analysis.engine import (
    _analyze_with_tools,
    _parse_llm_response,
    _response_is_complete_json,
    MAX_TOOL_ITERATIONS,
)


# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------


class TestToolDefinitions:
    """Verify the ANALYSIS_TOOLS list is well-formed."""

    def test_four_tools_defined(self):
        assert len(ANALYSIS_TOOLS) == 4

    def test_tool_names_unique(self):
        names = [t.name for t in ANALYSIS_TOOLS]
        assert len(names) == len(set(names))

    def test_all_have_schemas(self):
        for t in ANALYSIS_TOOLS:
            assert isinstance(t.input_schema, dict)
            assert t.input_schema.get("type") == "object"
            assert isinstance(t.description, str)
            assert len(t.description) > 10


# ---------------------------------------------------------------------------
# ToolExecutor
# ---------------------------------------------------------------------------


class TestToolExecutor:
    """Test ToolExecutor dispatch and error handling."""

    @pytest.fixture
    def executor(self):
        session = AsyncMock()
        return ToolExecutor(session, characteristic_id=42)

    @pytest.mark.asyncio
    async def test_unknown_tool_returns_error(self, executor):
        tc = ToolCall(tool_name="nonexistent", tool_input={}, call_id="c1")
        result = await executor.execute(tc)
        assert result.call_id == "c1"
        data = json.loads(result.content)
        assert data["error"] == "Unknown tool"

    @pytest.mark.asyncio
    async def test_handler_exception_returns_error(self, executor):
        """If a handler raises, we get a structured error, not a crash."""

        async def _explode(_inputs):
            raise RuntimeError("DB connection lost")

        executor._tool_get_violations = _explode

        tc = ToolCall(tool_name="get_violations", tool_input={}, call_id="c2")
        result = await executor.execute(tc)
        assert result.call_id == "c2"
        data = json.loads(result.content)
        assert data["error"] == "Tool execution failed"

    @pytest.mark.asyncio
    async def test_get_violations_returns_expected_shape(self):
        """get_violations returns correct structure with mocked DB."""
        mock_violation = MagicMock()
        mock_violation.rule_id = 1
        mock_violation.rule_name = "One point beyond 3-sigma"
        mock_violation.severity = "CRITICAL"
        mock_violation.acknowledged = False
        mock_violation.created_at = datetime(2026, 3, 14, tzinfo=timezone.utc)

        # Mock the session's execute to return our violation
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_violation]
        session = AsyncMock()
        session.execute.return_value = mock_result

        executor = ToolExecutor(session, characteristic_id=42)
        tc = ToolCall(
            tool_name="get_violations",
            tool_input={"days": 7, "limit": 10},
            call_id="c3",
        )
        result = await executor.execute(tc)
        data = json.loads(result.content)

        assert data["characteristic_id"] == 42
        assert data["days_back"] == 7
        assert data["total_found"] == 1
        assert len(data["violations"]) == 1
        assert data["violations"][0]["rule_id"] == 1
        assert data["violations"][0]["severity"] == "CRITICAL"

    @pytest.mark.asyncio
    async def test_get_capability_no_data(self):
        """get_capability returns available=False when no data."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        session = AsyncMock()
        session.execute.return_value = mock_result

        executor = ToolExecutor(session, characteristic_id=42)
        tc = ToolCall(
            tool_name="get_capability", tool_input={}, call_id="c4"
        )
        result = await executor.execute(tc)
        data = json.loads(result.content)

        assert data["available"] is False
        assert data["characteristic_id"] == 42

    @pytest.mark.asyncio
    async def test_get_capability_with_data(self):
        """get_capability returns capability indices when data exists."""
        mock_cap = MagicMock()
        mock_cap.cp = 1.33
        mock_cap.cpk = 1.21
        mock_cap.pp = 1.30
        mock_cap.ppk = 1.18
        mock_cap.cpm = 1.25
        mock_cap.sample_count = 100
        mock_cap.normality_p_value = 0.42
        mock_cap.normality_test = "anderson-darling"
        mock_cap.calculated_at = datetime(2026, 3, 14, tzinfo=timezone.utc)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_cap
        session = AsyncMock()
        session.execute.return_value = mock_result

        executor = ToolExecutor(session, characteristic_id=42)
        tc = ToolCall(
            tool_name="get_capability", tool_input={}, call_id="c5"
        )
        result = await executor.execute(tc)
        data = json.loads(result.content)

        assert data["available"] is True
        assert data["cpk"] == 1.21
        assert data["sample_count"] == 100

    @pytest.mark.asyncio
    async def test_get_anomaly_events_returns_expected_shape(self):
        """get_anomaly_events returns correct structure."""
        mock_event = MagicMock()
        mock_event.event_type = "changepoint"
        mock_event.detector_type = "pelt"
        mock_event.severity = "high"
        mock_event.summary = "Mean shift detected at sample 42"
        mock_event.is_acknowledged = False
        mock_event.is_dismissed = False
        mock_event.detected_at = datetime(2026, 3, 14, tzinfo=timezone.utc)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_event]
        session = AsyncMock()
        session.execute.return_value = mock_result

        executor = ToolExecutor(session, characteristic_id=42)
        tc = ToolCall(
            tool_name="get_anomaly_events",
            tool_input={"days": 14, "limit": 10},
            call_id="c6",
        )
        result = await executor.execute(tc)
        data = json.loads(result.content)

        assert data["total_found"] == 1
        assert data["events"][0]["event_type"] == "changepoint"
        assert data["events"][0]["detector_type"] == "pelt"

    @pytest.mark.asyncio
    async def test_get_sibling_characteristics_no_hierarchy(self):
        """get_sibling_characteristics handles missing characteristic."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        session = AsyncMock()
        session.execute.return_value = mock_result

        executor = ToolExecutor(session, characteristic_id=999)
        tc = ToolCall(
            tool_name="get_sibling_characteristics",
            tool_input={},
            call_id="c7",
        )
        result = await executor.execute(tc)
        data = json.loads(result.content)

        assert data["siblings"] == []
        assert "not found" in data.get("message", "").lower()


# ---------------------------------------------------------------------------
# Claude response parsing
# ---------------------------------------------------------------------------


class TestClaudeResponseParsing:
    """Test _parse_claude_response with tool-use content blocks."""

    def test_text_only_response(self):
        data = {
            "content": [{"type": "text", "text": "Analysis complete."}],
            "usage": {"input_tokens": 100, "output_tokens": 50},
            "stop_reason": "end_turn",
        }
        resp = _parse_claude_response(data, "claude-sonnet-4-20250514", [])
        assert resp.content == "Analysis complete."
        assert resp.stop_reason == "end_turn"
        assert resp.tool_calls == []
        assert resp.input_tokens == 100

    def test_tool_use_response(self):
        data = {
            "content": [
                {"type": "text", "text": "Let me check violations."},
                {
                    "type": "tool_use",
                    "id": "toolu_123",
                    "name": "get_violations",
                    "input": {"days": 7},
                },
            ],
            "usage": {"input_tokens": 200, "output_tokens": 80},
            "stop_reason": "tool_use",
        }
        resp = _parse_claude_response(data, "claude-sonnet-4-20250514", [])
        assert resp.stop_reason == "tool_use"
        assert len(resp.tool_calls) == 1
        assert resp.tool_calls[0].tool_name == "get_violations"
        assert resp.tool_calls[0].call_id == "toolu_123"
        assert resp.tool_calls[0].tool_input == {"days": 7}
        assert resp.content == "Let me check violations."

    def test_multiple_tool_calls(self):
        data = {
            "content": [
                {
                    "type": "tool_use",
                    "id": "toolu_1",
                    "name": "get_violations",
                    "input": {},
                },
                {
                    "type": "tool_use",
                    "id": "toolu_2",
                    "name": "get_capability",
                    "input": {},
                },
            ],
            "usage": {"input_tokens": 100, "output_tokens": 40},
            "stop_reason": "tool_use",
        }
        resp = _parse_claude_response(data, "claude-sonnet-4-20250514", [])
        assert len(resp.tool_calls) == 2
        assert resp.tool_calls[0].tool_name == "get_violations"
        assert resp.tool_calls[1].tool_name == "get_capability"
        assert resp.content is None  # No text blocks

    def test_raw_messages_updated(self):
        """Ensure _raw_messages tracks conversation history."""
        prior = [{"role": "user", "content": "Analyze this."}]
        data = {
            "content": [{"type": "text", "text": "Done."}],
            "usage": {},
            "stop_reason": "end_turn",
        }
        resp = _parse_claude_response(data, "claude-sonnet-4-20250514", prior)
        assert len(resp._raw_messages) == 2  # user + assistant
        assert resp._raw_messages[0]["role"] == "user"
        assert resp._raw_messages[1]["role"] == "assistant"


# ---------------------------------------------------------------------------
# OpenAI response parsing
# ---------------------------------------------------------------------------


class TestOpenAIResponseParsing:
    """Test _parse_openai_response with tool-use."""

    def test_text_only_response(self):
        data = {
            "choices": [
                {
                    "message": {"content": "Analysis done."},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 100, "completion_tokens": 50},
        }
        resp = _parse_openai_response(data, "gpt-4o")
        assert resp.content == "Analysis done."
        assert resp.stop_reason == "end_turn"
        assert resp.tool_calls == []

    def test_tool_calls_response(self):
        data = {
            "choices": [
                {
                    "message": {
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_abc",
                                "type": "function",
                                "function": {
                                    "name": "get_violations",
                                    "arguments": '{"days": 14}',
                                },
                            }
                        ],
                    },
                    "finish_reason": "tool_calls",
                }
            ],
            "usage": {"prompt_tokens": 150, "completion_tokens": 30},
        }
        resp = _parse_openai_response(data, "gpt-4o")
        assert resp.stop_reason == "tool_use"
        assert len(resp.tool_calls) == 1
        assert resp.tool_calls[0].tool_name == "get_violations"
        assert resp.tool_calls[0].call_id == "call_abc"
        assert resp.tool_calls[0].tool_input == {"days": 14}

    def test_malformed_arguments_handled(self):
        """Malformed JSON arguments should not crash."""
        data = {
            "choices": [
                {
                    "message": {
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_x",
                                "type": "function",
                                "function": {
                                    "name": "get_capability",
                                    "arguments": "not valid json",
                                },
                            }
                        ],
                    },
                    "finish_reason": "tool_calls",
                }
            ],
            "usage": {},
        }
        resp = _parse_openai_response(data, "gpt-4o")
        assert len(resp.tool_calls) == 1
        assert resp.tool_calls[0].tool_input == {}


# ---------------------------------------------------------------------------
# Tool prompt embedding fallback
# ---------------------------------------------------------------------------


class TestToolPromptEmbedding:
    """Test _embed_tools_in_prompt for non-tool-use providers."""

    def test_tools_appended_to_prompt(self):
        tools = [
            ToolDef(
                name="get_violations",
                description="Get SPC violations.",
                input_schema={"type": "object", "properties": {}},
            )
        ]
        result = _embed_tools_in_prompt("You are an SPC expert.", tools)
        assert "get_violations" in result
        assert "Get SPC violations." in result
        assert result.startswith("You are an SPC expert.")


# ---------------------------------------------------------------------------
# Engine tool loop
# ---------------------------------------------------------------------------


class TestEngineToolLoop:
    """Test _analyze_with_tools with mocked providers."""

    @pytest.mark.asyncio
    async def test_no_tool_use_returns_immediately(self):
        """If provider returns end_turn on first call, no tool loop."""
        provider = AsyncMock()
        provider.generate.return_value = LLMResponse(
            content='{"summary": "All good"}',
            stop_reason="end_turn",
        )

        text, calls_made, tokens = await _analyze_with_tools(
            provider, AsyncMock(), 1, "sys", "user"
        )
        assert text == '{"summary": "All good"}'
        assert calls_made == 0
        assert tokens == 0
        provider.generate.assert_called_once()

    @pytest.mark.asyncio
    async def test_single_tool_iteration(self):
        """Provider requests one tool, gets result, then ends."""
        # First call: provider requests a tool
        tool_response = LLMResponse(
            content=None,
            stop_reason="tool_use",
            tool_calls=[
                ToolCall(
                    tool_name="get_capability",
                    tool_input={},
                    call_id="t1",
                )
            ],
            _raw_messages=[
                {"role": "user", "content": "analyze"},
                {"role": "assistant", "content": []},
            ],
        )

        # Second call: provider returns final text
        final_response = LLMResponse(
            content='{"summary": "Cpk is 1.33"}',
            stop_reason="end_turn",
        )

        provider = AsyncMock()
        provider.generate.side_effect = [tool_response, final_response]

        # Mock session that returns empty capability
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        session.execute.return_value = mock_result

        text, calls_made, tokens = await _analyze_with_tools(
            provider, session, 1, "sys", "user"
        )
        assert calls_made == 1
        assert text == '{"summary": "Cpk is 1.33"}'
        assert tokens == 0
        assert provider.generate.call_count == 2

    @pytest.mark.asyncio
    async def test_multiple_tool_iterations(self):
        """Provider requests tools across 2 iterations."""
        call1 = LLMResponse(
            content=None,
            stop_reason="tool_use",
            tool_calls=[
                ToolCall("get_violations", {}, "t1"),
            ],
            _raw_messages=[{"role": "user", "content": "x"}],
        )
        call2 = LLMResponse(
            content=None,
            stop_reason="tool_use",
            tool_calls=[
                ToolCall("get_capability", {}, "t2"),
                ToolCall("get_anomaly_events", {}, "t3"),
            ],
            _raw_messages=[{"role": "user", "content": "x"}],
        )
        final = LLMResponse(
            content='{"summary": "Thorough analysis"}',
            stop_reason="end_turn",
        )

        provider = AsyncMock()
        provider.generate.side_effect = [call1, call2, final]

        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_result.scalar_one_or_none.return_value = None
        session.execute.return_value = mock_result

        text, calls_made, tokens = await _analyze_with_tools(
            provider, session, 1, "sys", "user"
        )
        assert calls_made == 3  # 1 + 2
        assert text == '{"summary": "Thorough analysis"}'
        assert tokens == 0

    @pytest.mark.asyncio
    async def test_max_iterations_guard(self):
        """If provider keeps requesting tools, we stop at MAX_TOOL_ITERATIONS."""
        # Provider always requests tools
        def make_tool_response():
            return LLMResponse(
                content=None,
                stop_reason="tool_use",
                tool_calls=[
                    ToolCall("get_violations", {}, f"t_{i}")
                    for i in range(1)
                ],
                _raw_messages=[{"role": "user", "content": "x"}],
            )

        # Final forced text response (no tools)
        final_text = LLMResponse(
            content='{"summary": "Forced final response"}',
            stop_reason="end_turn",
        )

        provider = AsyncMock()
        # MAX_TOOL_ITERATIONS + 1 tool responses (initial + iterations),
        # then 1 forced text-only response
        provider.generate.side_effect = [
            make_tool_response() for _ in range(MAX_TOOL_ITERATIONS + 1)
        ] + [final_text]

        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        session.execute.return_value = mock_result

        text, calls_made, tokens = await _analyze_with_tools(
            provider, session, 1, "sys", "user"
        )
        # Should have stopped after MAX_TOOL_ITERATIONS
        assert calls_made == MAX_TOOL_ITERATIONS
        assert tokens == 0
        # generate called: 1 initial + MAX_TOOL_ITERATIONS + 1 forced final
        assert provider.generate.call_count == MAX_TOOL_ITERATIONS + 2
        # The forced final response should produce text, not None
        assert text == '{"summary": "Forced final response"}'


# ---------------------------------------------------------------------------
# LLM response parsing
# ---------------------------------------------------------------------------


class TestParseLLMResponse:
    """Test _parse_llm_response JSON extraction."""

    def test_clean_json(self):
        content = json.dumps({
            "summary": "Process stable",
            "patterns": ["Trend up"],
            "risks": ["Drift detected"],
            "recommendations": ["Increase sampling"],
        })
        summary, patterns, risks, recs = _parse_llm_response(content)
        assert summary == "Process stable"
        assert patterns == ["Trend up"]
        assert risks == ["Drift detected"]
        assert recs == ["Increase sampling"]

    def test_markdown_fenced_json(self):
        content = '```json\n{"summary": "OK", "patterns": [], "risks": [], "recommendations": []}\n```'
        summary, patterns, risks, recs = _parse_llm_response(content)
        assert summary == "OK"

    def test_fallback_on_invalid_json(self):
        content = "This is just plain text analysis."
        summary, patterns, risks, recs = _parse_llm_response(content)
        assert summary == content
        assert patterns == []
        assert risks == []
        assert recs == []

    def test_empty_string(self):
        summary, patterns, risks, recs = _parse_llm_response("")
        assert summary == ""
        assert patterns == []

    def test_truncated_json_falls_back(self):
        """Deliberately-truncated JSON regresses to summary-only fallback.

        This nails down the bug we just fixed: the parser returns the raw
        text as ``summary`` and empty arrays for the structured fields.
        That behavior is what makes the new ``_response_is_complete_json``
        gate fire a retry instead of persisting an empty insight.
        """
        truncated = '{"summary": "Process drifting", "patterns": ["abc",'
        summary, patterns, risks, recs = _parse_llm_response(truncated)
        assert summary != ""
        assert patterns == []
        assert risks == []
        assert recs == []


# ---------------------------------------------------------------------------
# Engine token accounting + JSON-completeness gate
# ---------------------------------------------------------------------------


class TestEngineTokenAccounting:
    """Verify _analyze_with_tools sums token usage across every iteration
    and the JSON-validity gate trips correctly on truncated responses.
    """

    @pytest.mark.asyncio
    async def test_tokens_summed_across_iterations(self):
        """Tokens from every provider.generate() call must accumulate."""
        # First call: tool_use (100 in, 50 out)
        tool_response = LLMResponse(
            content=None,
            input_tokens=100,
            output_tokens=50,
            stop_reason="tool_use",
            tool_calls=[
                ToolCall("get_capability", {}, "t1"),
            ],
            _raw_messages=[{"role": "user", "content": "x"}],
        )
        # Second call: end_turn (200 in, 120 out)
        final_response = LLMResponse(
            content='{"summary": "ok", "patterns": ["p"], "risks": [], "recommendations": []}',
            input_tokens=200,
            output_tokens=120,
            stop_reason="end_turn",
        )

        provider = AsyncMock()
        provider.generate.side_effect = [tool_response, final_response]

        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        session.execute.return_value = mock_result

        text, calls_made, tokens = await _analyze_with_tools(
            provider, session, 1, "sys", "user"
        )
        assert tokens == 100 + 50 + 200 + 120  # 470
        assert calls_made == 1

    def test_response_is_complete_json_clean(self):
        """A populated structured JSON object is complete."""
        content = json.dumps({
            "summary": "Process stable",
            "patterns": ["Trend up"],
            "risks": ["Drift"],
            "recommendations": ["Increase sampling"],
        })
        assert _response_is_complete_json(content) is True

    def test_response_is_complete_json_truncated(self):
        """A mid-array truncation cannot parse -> not complete."""
        truncated = '{"summary": "X", "patterns": ["abc",'
        assert _response_is_complete_json(truncated) is False

    def test_response_is_complete_json_plain_text(self):
        """Plain-text fallback (no JSON at all) -> not complete."""
        assert _response_is_complete_json("Just a paragraph.") is False

    def test_response_is_complete_json_empty(self):
        """None and empty string -> not complete."""
        assert _response_is_complete_json(None) is False
        assert _response_is_complete_json("") is False

    def test_response_is_complete_json_summary_only(self):
        """JSON parsed but all arrays empty -> not complete (likely truncated)."""
        summary_only = json.dumps({
            "summary": "Looks fine",
            "patterns": [],
            "risks": [],
            "recommendations": [],
        })
        assert _response_is_complete_json(summary_only) is False
