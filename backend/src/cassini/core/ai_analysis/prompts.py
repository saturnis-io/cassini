"""Prompt templates for SPC chart analysis."""

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

    # Characteristic info
    char = context.get("characteristic", {})
    lines.append(f"## Characteristic: {char.get('name', 'Unknown')}")
    lines.append(f"- Chart type: {char.get('chart_type', 'unknown')}")
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
            lines.append(
                f"- Rule {v.get('rule_id', '?')}: "
                f"{v.get('rule_name', '?')} ({v.get('severity', '?')})"
            )
        lines.append("")

    # Anomalies
    anomalies = context.get("anomalies", [])
    if anomalies:
        lines.append(f"## Active Anomalies ({len(anomalies)} total)")
        for a in anomalies[:5]:
            lines.append(
                f"- {a.get('event_type', '?')}: {a.get('summary', '?')}"
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
