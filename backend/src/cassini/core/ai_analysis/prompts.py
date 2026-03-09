"""Prompt templates for SPC chart analysis."""

import re
import unicodedata

# Maximum length for user-supplied strings interpolated into prompts
_MAX_FIELD_LENGTH = 200


def _sanitize_for_prompt(value: str, max_length: int = _MAX_FIELD_LENGTH) -> str:
    """Sanitize a user-supplied string before interpolating into an LLM prompt.

    Defends against prompt injection by:
    - Stripping control characters (except basic whitespace)
    - Collapsing whitespace
    - Truncating to a safe length
    - Removing markdown heading markers that could confuse prompt structure
    """
    # Strip Unicode control characters (categories Cc/Cf) except \n, \t, space
    cleaned = "".join(
        ch for ch in value
        if ch in ("\n", "\t", " ") or unicodedata.category(ch) not in ("Cc", "Cf")
    )
    # Collapse multiple whitespace (including newlines) to single space
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    # Remove markdown heading markers that could break prompt structure
    cleaned = re.sub(r"^#+\s*", "", cleaned)
    # Truncate
    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length] + "..."
    return cleaned


SYSTEM_PROMPT = """You are an expert SPC (Statistical Process Control) quality engineer analyzing control chart data. Your role is to:

1. Identify patterns in the data (trends, shifts, cycles, mixtures, stratification)
2. Assess process stability and capability
3. Highlight risks and potential issues
4. Provide actionable recommendations for process improvement

Respond in JSON format with exactly these fields:
{
  "summary": "A 2-3 sentence plain-language summary of the chart's current state",
  "patterns": ["List of identified patterns, each as a concise sentence"],
  "risks": ["List of risks or concerns, each as a concise sentence"],
  "recommendations": ["List of actionable recommendations, each as a concise sentence"]
}

Be specific — reference actual values, time periods, and rule violations when describing patterns. Focus on actionable insights rather than generic advice."""


def build_analysis_prompt(context: dict) -> str:
    """Build the user prompt from chart context data."""
    lines = []

    # Characteristic info — sanitize user-supplied name to prevent injection
    char = context.get("characteristic", {})
    char_name = _sanitize_for_prompt(str(char.get("name", "Unknown")))
    chart_type = _sanitize_for_prompt(str(char.get("chart_type", "unknown")))
    lines.append(f"## Characteristic")
    lines.append(f"- Name: {char_name}")
    lines.append(f"- Chart type: {chart_type}")
    if char.get("usl") is not None:
        lines.append(f"- USL: {char['usl']}")
    if char.get("lsl") is not None:
        lines.append(f"- LSL: {char['lsl']}")
    if char.get("target") is not None:
        lines.append(f"- Target: {char['target']}")
    lines.append("")

    # Control limits
    limits = context.get("control_limits", {})
    if limits:
        lines.append("## Control Limits")
        lines.append(f"- UCL: {limits.get('ucl', 'N/A')}")
        lines.append(f"- Center Line: {limits.get('center_line', 'N/A')}")
        lines.append(f"- LCL: {limits.get('lcl', 'N/A')}")
        lines.append("")

    # Recent values
    values = context.get("recent_values", [])
    if values:
        lines.append(f"## Recent Values (last {len(values)} samples)")
        # Show as compact list (cap at 30 most recent for token efficiency)
        val_strs = [
            f"{v:.4f}" if isinstance(v, float) else str(v) for v in values[-30:]
        ]
        lines.append(", ".join(val_strs))
        lines.append("")

    # Statistics
    stats = context.get("statistics", {})
    if stats:
        lines.append("## Current Statistics")
        for key, val in stats.items():
            lines.append(f"- {key}: {val}")
        lines.append("")

    # Capability
    capability = context.get("capability", {})
    if capability:
        lines.append("## Capability Metrics")
        for key, val in capability.items():
            if val is not None:
                lines.append(f"- {key}: {val}")
        lines.append("")

    # Violations
    violations = context.get("violations", [])
    if violations:
        lines.append(f"## Recent Violations ({len(violations)} total)")
        for v in violations[:10]:
            rule_name = _sanitize_for_prompt(str(v.get("rule_name", "?")), 100)
            lines.append(
                f"- Rule {v.get('rule_id', '?')}: "
                f"{rule_name} ({v.get('severity', '?')})"
            )
        lines.append("")

    # Anomalies
    anomalies = context.get("anomalies", [])
    if anomalies:
        lines.append(f"## Active Anomalies ({len(anomalies)} total)")
        for a in anomalies[:5]:
            summary = _sanitize_for_prompt(str(a.get("summary", "?")), 200)
            lines.append(
                f"- {a.get('event_type', '?')}: {summary}"
            )
        lines.append("")

    # Detected patterns
    patterns = context.get("chart_patterns", {})
    if patterns:
        lines.append("## Detected Chart Patterns")
        for pattern, detected in patterns.items():
            if detected:
                lines.append(f"- {pattern}")
        lines.append("")

    lines.append("Please analyze this SPC chart data and provide your assessment.")

    return "\n".join(lines)
