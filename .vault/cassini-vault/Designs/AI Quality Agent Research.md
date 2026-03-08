---
title: AI Quality Agent Research
type: design
status: draft
date: 2026-03-07
tags:
  - ai
  - agent
  - quality
  - research
  - root-cause-analysis
  - differentiation
---

# AI Quality Agent Research

Research exploration of building an autonomous AI Quality Agent for the Cassini SPC platform. The agent would go beyond the existing one-shot AI analysis to perform multi-step, tool-using investigations that autonomously trace quality issues to their root causes.

## Key Findings

1. **Architecture**: Hybrid ReAct + Structured Output recommended. Triage (fast model) -> Investigate (ReAct loop, max 20 tool calls) -> Synthesize (structured report).

2. **Triggering**: Event-driven via existing EventBus (ViolationCreatedEvent, AnomalyDetectedEvent) with debouncing + on-demand + scheduled.

3. **Tool Design**: 12 query tools wrapping existing API endpoints, 5 analysis tools (new), 4 context tools, 5 guarded action tools. Agent NEVER takes irreversible actions.

4. **Knowledge Base**: Vector store of confirmed past investigations with human feedback loop. Compounding advantage over time (data flywheel).

5. **Regulatory**: Agent is advisory only (suggests, never decides). Full audit trail of every investigation step. Electronic signatures for human review.

6. **MCP Synergy**: Built-in agent (event-driven, deep) complements MCP server (external agents, ad-hoc). Shared tool layer.

7. **Differentiation**: Cross-characteristic temporal correlation investigation + plant-specific knowledge base = genuine moat vs "ChatGPT on quality data."

## Full Document

See `docs/plans/2026-03-07-ai-quality-agent-research.md` for the complete 15-section research document.

## Related Notes

- [[System Overview]]
- [[SPC Engine]]
- [[Anomaly Detection]]
