# AI Quality Agent for Cassini SPC — Research Document

**Date**: 2026-03-07
**Type**: Research / Exploration
**Status**: Draft
**Author**: Research session

---

## 1. Executive Summary

This document explores the feasibility, architecture, and differentiation strategy for building an autonomous AI Quality Agent within the Cassini SPC platform. The agent would go beyond Cassini's existing one-shot AI analysis (which generates a structured summary of a single characteristic's chart data) to perform multi-step, tool-using investigations that autonomously trace quality issues to their root causes.

The core thesis: **an AI agent that can use Cassini's own API endpoints as tools, triggered by real-time events, investigating across characteristics/processes/operators/gages, and building a plant-specific knowledge base over time, would be a genuine differentiator in the SPC market** — not just "ChatGPT on quality data."

---

## 2. Current State in Cassini

### What exists today

| Component | Location | What it does |
|-----------|----------|--------------|
| `AIAnalysisEngine` | `core/ai_analysis/engine.py` | One-shot LLM analysis of a single characteristic. Builds context (50 recent values, violations, anomalies, capability, patterns), calls LLM, parses structured JSON, caches 1hr. |
| `context_builder` | `core/ai_analysis/context_builder.py` | Loads chart context from DB: characteristic config, samples w/ measurements, violations, anomalies, capability history. Computes trend/run length/patterns. |
| `providers` | `core/ai_analysis/providers.py` | Multi-provider abstraction: Claude, OpenAI, Azure OpenAI, Gemini, OpenAI-compatible (vLLM/Ollama). Raw `generate(system, user)` interface — no tool use. |
| `EventBus` | `core/events/bus.py` | Async pub/sub with 15 event types. Fire-and-forget or wait-for-completion. Error isolation per handler. |
| Event types | `core/events/events.py` | `SampleProcessedEvent`, `ViolationCreatedEvent`, `AnomalyDetectedEvent`, `PredictedOOCEvent`, `CorrelationAlertEvent`, `ControlLimitsUpdatedEvent`, + signature/workflow/ERP events. |
| `AnomalyDetector` | `core/anomaly/detector.py` | Subscribes to `SampleProcessedEvent`, runs PELT/IsolationForest/KS detectors, publishes `AnomalyDetectedEvent`. |
| Existing API surface | 263 endpoints | Charts, samples, violations, capability, correlations, MSA, FAI, anomaly, forecasting, hierarchy, audit trail, etc. |

### Key gap

The current AI feature is **stateless and single-scope**: it looks at one characteristic at a time, makes one LLM call, and returns. It cannot:
- Follow up on its own findings ("Cpk is dropping — let me check if the gage was recently calibrated")
- Correlate across characteristics ("Is this shift happening on sibling characteristics too?")
- Check process context ("Was there a material lot change around the time of the shift?")
- Learn from past investigations ("Last time we saw this pattern on Line 3, it was a fixture issue")

---

## 3. Agent Architecture Patterns

### 3.1 ReAct (Reason-Act-Observe)

The ReAct pattern implements a thought-action-observation loop:

```
THOUGHT: "Cpk dropped below 1.0 and there are 3 Nelson Rule 2 violations. Let me check if related characteristics show the same shift."
ACTION: get_sibling_characteristics(char_id=42)
OBSERVATION: [{"id": 43, "name": "Width"}, {"id": 44, "name": "Height"}]
THOUGHT: "Let me check violations on Width..."
ACTION: get_violations(char_id=43, since="2026-03-01")
...
```

**Strengths**: Flexible, handles unexpected findings, naturally auditable (each step is logged). Well-proven in RCA applications — the RCAgent paper (Wang et al., 2023) demonstrated autonomous root cause analysis for cloud incidents using this pattern.

**Weaknesses**: Can loop or wander without guardrails. Token cost scales with investigation depth. Requires careful max-iteration limits.

**Fit for Cassini**: HIGH. Quality investigations are inherently exploratory — the agent doesn't know upfront whether the root cause is a gage issue, material change, or operator error. ReAct's flexibility matches this.

### 3.2 Plan-and-Execute

The agent first creates an investigation plan, then executes each step:

```
PLAN:
1. Get current chart data and violations for char 42
2. Check gage R&R status for the measurement system
3. Check sibling characteristics for correlated shifts
4. Check recent control limit recalculations
5. Synthesize findings into root cause report

EXECUTE: [runs each step, may replan if findings warrant it]
```

**Strengths**: More predictable cost (plan bounds the work), easier to show progress to users ("Step 3 of 5: checking sibling characteristics...").

**Weaknesses**: Rigid — if step 2 reveals something unexpected, replanning adds latency. Worse for truly exploratory investigations.

**Fit for Cassini**: MEDIUM. Good for scheduled/on-demand investigations where the user wants predictable execution. Less ideal for real-time event-triggered responses.

### 3.3 Multi-Agent Systems

Specialized agents with distinct roles:

| Agent | Role | Tools |
|-------|------|-------|
| **Investigator** | Gathers data, runs queries, checks correlations | Query tools, analysis tools |
| **Diagnostician** | Interprets findings, proposes root causes | Context tools, knowledge base |
| **Reporter** | Generates structured reports, drafts notifications | Report templates, notification system |
| **Reviewer** | Validates the diagnostician's logic, checks for gaps | All read-only tools |

**Strengths**: Separation of concerns, each agent can use a smaller/cheaper model. The reviewer agent provides built-in adversarial checking.

**Weaknesses**: Coordination overhead, harder to debug, higher total token cost, more complex to implement.

**Fit for Cassini**: LOW for v1, MEDIUM for v2. Start with a single ReAct agent, consider splitting into specialized agents once the tool set and investigation patterns are proven.

### 3.4 Recommended Architecture: Hybrid ReAct + Structured Output

Combine ReAct's flexibility with structured investigation phases:

```
Phase 1: TRIAGE (fast, cheap model)
  - Classify the trigger event
  - Decide investigation scope (single char, process-wide, plant-wide)
  - Estimate priority (informational, actionable, critical)

Phase 2: INVESTIGATE (capable model, ReAct loop)
  - Use tools to gather evidence
  - Max 15 iterations with cost cap
  - Each step logged to investigation record

Phase 3: SYNTHESIZE (capable model, structured output)
  - Produce structured InvestigationReport
  - Confidence score per finding
  - Recommended actions with severity
```

---

## 4. Triggering Mechanisms

### 4.1 Event-Driven (Primary)

Subscribe to the existing EventBus:

| Trigger Event | Agent Action |
|---------------|-------------|
| `ViolationCreatedEvent` (severity=CRITICAL) | Immediate investigation |
| `AnomalyDetectedEvent` (severity=WARNING+) | Investigation within 5 min (debounce for burst) |
| `PredictedOOCEvent` | Proactive investigation before the predicted OOC |
| `CorrelationAlertEvent` | Cross-characteristic investigation |
| Multiple `ViolationCreatedEvent` within window | Escalated investigation (pattern across chars) |

**Debouncing is critical**: A process shift may trigger 5-10 violations in rapid succession. The agent should wait for a configurable quiet period (e.g., 60 seconds after the last event for the same characteristic) before launching an investigation, then investigate all accumulated events together.

### 4.2 On-Demand (User-Initiated)

A "Deep Investigate" button on the dashboard or violation list that triggers a full agent investigation instead of the current one-shot analysis. This replaces or extends the existing `/api/v1/ai/analyze/{char_id}` endpoint.

### 4.3 Scheduled (Background)

Daily/weekly automated reviews:
- "Scan all characteristics with Cpk < 1.33 and generate improvement recommendations"
- "Review all unacknowledged violations older than 48 hours"
- "Generate weekly quality summary for each production line"

### 4.4 Implementation Consideration

The agent should run as an **async background task** (not blocking the API request). The user gets an `investigation_id` back immediately and can poll or receive WebSocket updates as the investigation progresses.

```
POST /api/v1/agent/investigate
  -> 202 Accepted { investigation_id: "inv_abc123", status: "running" }

GET /api/v1/agent/investigations/{id}
  -> { status: "running", steps_completed: 4, current_step: "Checking gage R&R..." }

WebSocket: { type: "investigation_update", investigation_id: "inv_abc123", step: 5, ... }
```

---

## 5. Tool Design for the Quality Agent

### 5.1 Query Tools (Read-Only)

These map directly to existing Cassini API endpoints:

| Tool | Wraps Endpoint | Purpose |
|------|---------------|---------|
| `get_chart_data` | `GET /charts/{char_id}/data` | Recent sample values, subgroup means, timestamps |
| `get_violations` | `GET /violations/` | Violations for a characteristic, filterable by date/rule/severity |
| `get_capability` | `GET /capability/{char_id}` | Current Cp, Cpk, Pp, Ppk values |
| `get_capability_history` | `GET /capability/{char_id}/history` | Capability trend over time |
| `get_anomaly_events` | `GET /anomaly/events` | PELT changepoints, isolation forest outliers, KS distribution shifts |
| `get_characteristic_config` | `GET /characteristics/{id}` | Spec limits, chart type, subgroup size, control limits |
| `get_sibling_characteristics` | `GET /characteristics/?hierarchy_id=X` | Other characteristics at the same station/line |
| `get_correlation_matrix` | `GET /correlation/matrix` | Pearson/Spearman correlations between characteristics |
| `get_msa_study` | `GET /msa/studies/{id}` | Gage R&R results, measurement system adequacy |
| `get_forecast` | `GET /forecasting/{char_id}` | ARIMA predictions, predicted OOC horizon |
| `get_hierarchy_path` | `GET /hierarchy/{node_id}` | Plant > Line > Station > Characteristic path |
| `get_audit_log` | `GET /audit/logs` | Recent changes to the characteristic or its parents |

### 5.2 Analysis Tools (Compute)

These would be new, agent-specific tools that perform computations not exposed as standalone endpoints:

| Tool | Purpose |
|------|---------|
| `compare_time_periods` | Compare statistics (mean, sigma, Cpk) between two date ranges for a characteristic |
| `find_correlated_shifts` | Given a shift on char A, check if chars B, C, D shifted at the same time |
| `check_measurement_system` | Verify the gage R&R is adequate and calibration is current |
| `compute_process_shift_magnitude` | Quantify how far the process mean shifted in sigma units |
| `identify_common_cause_candidates` | Based on which characteristics shifted and which didn't, identify shared factors |

### 5.3 Context Tools (Domain Knowledge)

| Tool | Purpose |
|------|---------|
| `get_process_history` | Timeline of recent changes (limit recalcs, config changes, data source changes) |
| `search_past_investigations` | RAG search over past investigation reports for similar patterns |
| `get_plant_context` | Plant-level info (shift schedule, product mix, recent audits) |
| `get_nelson_rule_description` | Explain what a specific Nelson rule violation means and common causes |

### 5.4 Action Tools (Write, Guarded)

These require human approval before execution:

| Tool | Purpose | Approval Required |
|------|---------|-------------------|
| `draft_investigation_report` | Generate structured report with findings | No (draft only) |
| `propose_corrective_action` | Suggest specific corrective actions | No (suggestion only) |
| `escalate_to_supervisor` | Send notification to supervisor role | Yes (configurable) |
| `request_gage_recalibration` | Create a recalibration request | Yes (always) |
| `suggest_control_limit_recalc` | Recommend recalculating control limits | Yes (always) |

**Critical design principle**: The agent NEVER takes irreversible actions autonomously. It drafts, suggests, and escalates — humans decide.

### 5.5 Tool Implementation Strategy

Tools should be thin wrappers around existing services, not duplicated logic:

```python
# Tool definition (for LLM function calling)
GET_VIOLATIONS_TOOL = {
    "name": "get_violations",
    "description": "Get recent control chart violations for a characteristic. "
                   "Returns rule ID, name, severity, timestamp, and acknowledgment status.",
    "input_schema": {
        "type": "object",
        "properties": {
            "characteristic_id": {"type": "integer", "description": "The characteristic ID"},
            "since_days": {"type": "integer", "description": "Look back N days (default 7)", "default": 7},
            "severity": {"type": "string", "enum": ["WARNING", "CRITICAL"], "description": "Filter by severity"},
        },
        "required": ["characteristic_id"]
    }
}

# Tool executor (server-side, uses existing repository/service)
async def execute_get_violations(session, params):
    repo = ViolationRepository(session)
    since = datetime.now(tz=UTC) - timedelta(days=params.get("since_days", 7))
    violations = await repo.get_by_characteristic(
        params["characteristic_id"], since=since, severity=params.get("severity")
    )
    # Return condensed, token-efficient representation
    return [{"rule": v.rule_name, "severity": v.severity,
             "at": v.created_at.isoformat(), "ack": v.acknowledged} for v in violations]
```

---

## 6. Root Cause Investigation Workflow

### 6.1 Standard Investigation Flow

```
TRIGGER: ViolationCreatedEvent (Rule 2: 9 points same side, CRITICAL)
  |
  v
TRIAGE: "Critical Nelson Rule 2 violation on Bore Diameter (char 42).
         Rule 2 indicates a sustained shift in process mean.
         Scope: process-wide investigation. Priority: HIGH."
  |
  v
STEP 1: Get current chart data + statistics
  -> "Mean has shifted from 10.002 to 10.015 over last 20 samples.
      UCL=10.030, so approaching upper limit."
  |
  v
STEP 2: Check when the shift started
  -> compare_time_periods(last 7 days vs previous 7 days)
  -> "Shift began approximately March 4. Mean increased by 1.3 sigma."
  |
  v
STEP 3: Check sibling characteristics at the same station
  -> get_sibling_characteristics -> get_violations for each
  -> "Width (char 43) also shows Rule 2 violation starting March 4.
      Height (char 44) is stable. Suggests a common cause affecting
      bore and width but not height."
  |
  v
STEP 4: Check measurement system
  -> get_msa_study for char 42's measurement system
  -> "Gage R&R: 12.3% total variation. Adequate (< 30%).
      Last calibration: Feb 28. Not a measurement system issue."
  |
  v
STEP 5: Check for correlated process changes
  -> get_audit_log for the station, filtered to March 3-5
  -> "Control limits recalculated on March 3. No config changes."
  |
  v
STEP 6: Search past investigations
  -> search_past_investigations("bore diameter shift rule 2")
  -> "Similar investigation on Jan 15: bore + width shifted together.
      Confirmed root cause: fixture wear on Station 3 chuck.
      Resolution: fixture replacement."
  |
  v
SYNTHESIZE:
  {
    "title": "Process Mean Shift on Bore Diameter and Width",
    "severity": "HIGH",
    "confidence": 0.75,
    "findings": [
      "Process mean shifted +1.3σ on Bore Diameter starting March 4",
      "Width shows correlated shift; Height unaffected",
      "Measurement system adequate (GRR 12.3%)",
      "No configuration changes in the timeframe"
    ],
    "probable_cause": "Fixture wear on Station 3 (based on similar Jan 15 investigation)",
    "recommended_actions": [
      {"action": "Inspect Station 3 chuck/fixture for wear", "priority": "IMMEDIATE"},
      {"action": "Consider recalculating control limits after fixture service", "priority": "AFTER_FIX"}
    ],
    "evidence_chain": [...steps with tool calls and results...]
  }
```

### 6.2 Investigation Boundaries

To prevent runaway investigations:

| Guardrail | Value | Rationale |
|-----------|-------|-----------|
| Max tool calls per investigation | 20 | Cost control, ~$0.50-1.00 per investigation |
| Max concurrent investigations | 3 per plant | Resource management |
| Investigation timeout | 5 minutes | User patience threshold |
| Max token budget | 50K input + 10K output | Cost cap |
| Debounce window | 60 seconds | Batch burst violations |
| Cooldown per characteristic | 1 hour | Prevent re-investigation of same issue |

---

## 7. Root Cause Knowledge Base

### 7.1 The Feedback Loop

The most valuable long-term differentiator is a knowledge base that learns from confirmed investigations:

```
         Agent Investigation
                |
                v
        Draft Root Cause Report
                |
                v
    Human Reviews: CONFIRM / CORRECT / REJECT
                |
        +-------+-------+
        |               |
    CONFIRM         CORRECT
        |               |
        v               v
  Store as-is     Store corrected version
        |               |
        +-------+-------+
                |
                v
    Embed in Knowledge Base (vector store)
                |
                v
    Future investigations retrieve similar cases
    via semantic search, improving accuracy
```

### 7.2 Data Model for Investigations

```
investigation
  id: int (PK)
  plant_id: int (FK)
  trigger_type: str  -- "violation", "anomaly", "predicted_ooc", "manual", "scheduled"
  trigger_event_id: int  -- FK to violation/anomaly/etc.
  characteristic_id: int (FK)  -- primary characteristic
  status: str  -- "running", "completed", "failed", "cancelled"
  priority: str  -- "LOW", "MEDIUM", "HIGH", "CRITICAL"
  started_at: datetime
  completed_at: datetime
  total_tool_calls: int
  total_tokens: int
  cost_estimate_usd: float

investigation_step
  id: int (PK)
  investigation_id: int (FK)
  step_number: int
  phase: str  -- "triage", "investigate", "synthesize"
  thought: str  -- agent's reasoning
  tool_name: str  -- tool called (null for synthesis)
  tool_input: json  -- parameters passed
  tool_output: json  -- result received (truncated for storage)
  tokens_used: int
  duration_ms: int
  created_at: datetime

investigation_report
  id: int (PK)
  investigation_id: int (FK)
  title: str
  severity: str
  confidence: float  -- agent's confidence (0.0-1.0)
  findings: json  -- list of finding strings
  probable_cause: str
  recommended_actions: json  -- list of {action, priority}
  human_verdict: str  -- null, "confirmed", "corrected", "rejected"
  human_correction: str  -- null or corrected root cause text
  human_notes: str
  reviewed_by: int (FK -> user)
  reviewed_at: datetime

investigation_characteristic
  investigation_id: int (FK)
  characteristic_id: int (FK)
  -- junction table for multi-char investigations
```

### 7.3 Knowledge Base Architecture

**Option A: Vector Store (Recommended)**

Embed investigation reports using the same LLM provider's embedding model. Store embeddings alongside the investigation report. At retrieval time, embed the current investigation context and find the k-nearest past investigations.

- **Embedding source**: Concatenate `title + findings + probable_cause + human_correction`
- **Storage**: New `investigation_embedding` table with `investigation_report_id` FK and `embedding` column (BLOB/vector)
- **Retrieval**: Cosine similarity search, top-5 results, filtered by plant_id
- **Embedding models**: OpenAI `text-embedding-3-small`, Anthropic Voyager (if available), or sentence-transformers for local deployment

**Why vector store over keyword search**: Quality issues are described in diverse ways. "Fixture wear" and "tooling degradation" and "chuck looseness" are semantically related but keyword-disjoint. Embeddings capture this.

**Option B: Structured Tag System (Complementary)**

In addition to embeddings, tag each confirmed investigation with structured metadata:

```
tags:
  failure_mode: "fixture_wear"
  affected_components: ["bore", "width"]
  station: "station_3"
  chart_pattern: "mean_shift"
  nelson_rules: [2]
  resolution: "fixture_replacement"
```

This enables both semantic search (embeddings) and structured queries ("show me all fixture_wear investigations on station_3").

**Option C: Knowledge Graph (Future)**

Build a graph connecting `Station -> Fixture -> Failure Mode -> Symptom Pattern -> Resolution`. This is the most powerful representation but the most complex to build and maintain. Consider for v3.

### 7.4 Cold Start Strategy

New deployments have zero investigation history. Strategies:

1. **Pre-seed with generic SPC knowledge**: Common root causes for each Nelson rule violation type, organized by industry (automotive, aerospace, semiconductor, pharma)
2. **Import from existing CAPA systems**: If the plant has a Corrective Action system, import historical root cause data
3. **Cross-plant learning** (with consent): Anonymized patterns from other deployments, opt-in
4. **Manual seeding**: Quality engineers can manually add known failure modes and their symptoms during onboarding

---

## 8. Regulatory Considerations

### 8.1 21 CFR Part 11 Compliance

In FDA-regulated environments, AI agent actions have specific compliance implications.

**Key principle from IntuitionLabs guidance**: "When an AI algorithm 'approves' a quality result or automatically adjusts a process, ensuring its decision is documented, reviewed, and authorized under Part 11 is a key compliance question."

| Requirement | How Cassini Agent Addresses It |
|-------------|-------------------------------|
| **Audit trail** | Every investigation step (thought, tool call, result) is persisted in `investigation_step` table with timestamps. Audit middleware captures all API calls. |
| **Human oversight** | Agent NEVER acknowledges violations, signs off on actions, or modifies data. It only produces reports that humans review. |
| **Electronic signatures** | Human review of investigation reports uses existing `sign()` workflow. Agent findings are not valid until signed. |
| **Traceability** | Full evidence chain: trigger event -> investigation steps -> report -> human review -> corrective action. |
| **Reproducibility** | Investigation context (tool inputs/outputs) is stored, enabling re-examination of the agent's reasoning. |
| **Validation** | Agent tool outputs can be independently verified (the data is in the system). Agent conclusions are opinions, not decisions. |

**The critical boundary**: The agent is an **advisory system**, not a **decision system**. It suggests; humans decide. This is the safest regulatory posture and matches how quality engineers actually want AI to work — they want help investigating, not to be replaced.

### 8.2 AS9100 / Aerospace Considerations

- Agent investigation reports can be attached to NCR (Non-Conformance Report) workflows
- Agent findings must not bypass the existing FAI approval workflow (separation of duties)
- Agent-suggested corrective actions should map to CAPA (Corrective and Preventive Action) codes

### 8.3 Annex 22 (EU GMP — New)

The upcoming Annex 22 specifically establishes requirements for AI/ML in pharmaceutical manufacturing. Key requirements that apply:

- AI systems must be validated for their intended use
- Performance must be monitored over time (drift detection on the agent's accuracy)
- Training data (the knowledge base) must be documented and version-controlled
- Human oversight must be maintained for safety-critical decisions

### 8.4 Audit Trail Integration

The agent's actions should appear in Cassini's existing audit log with a dedicated resource type:

```python
# New audit patterns for core/audit.py
_RESOURCE_PATTERNS = [
    ...
    (re.compile(r"/api/v1/agent/"), "ai_agent"),
]

# Action labels for AuditLogViewer.tsx
ACTION_LABELS = {
    ...
    "ai_agent": {
        "investigate": "Started Investigation",
        "complete": "Completed Investigation",
        "review": "Reviewed Investigation",
    }
}
```

---

## 9. Competitive Landscape

### 9.1 Existing SPC Platforms

| Platform | AI Capabilities | Agent-Level Features |
|----------|----------------|---------------------|
| **InfinityQS ProFicient** | Real-time SPC analytics, automated alerts, enterprise reporting | No autonomous investigation. Rule-based alerting only. |
| **Minitab** | Statistical analysis, predictive analytics, machine learning modules | Toolbox approach — user drives analysis. No agent automation. |
| **Predikto** (now part of UTC) | Predictive maintenance ML | Focused on equipment failure prediction, not SPC investigation. |
| **Sight Machine** | Manufacturing analytics, anomaly detection, AI-driven root cause | Closest competitor — has "root cause analysis" features, but reportedly still analyst-driven rather than autonomous. |
| **ComplianceQuest** | IQC with predictive AI, adaptive inspection levels | Automated inspection decisions, but not investigative agents. |
| **Advantive (InfinityQS)** | "SPC + AI: Moving from Insight to Foresight" | Marketing-level AI claims, primarily automated alerting and dashboards. |

### 9.2 General AI Agent Frameworks

| Framework | Strengths | Fit for Cassini |
|-----------|-----------|----------------|
| **LangChain / LangGraph** | Mature ecosystem, graph-based flows, production-proven (57% of respondents have agents in production). 20K+ GitHub stars. | HIGH — could use LangGraph for investigation flow orchestration |
| **CrewAI** | Role-based multi-agent, 20K+ GitHub stars, good for task decomposition | MEDIUM — useful if we move to multi-agent in v2 |
| **Anthropic Tool Use SDK** | Native Claude integration, `strict: true` schema validation, programmatic tool calling | HIGH — since Cassini already uses Claude as a provider |
| **OpenAI Agents SDK** | Function calling, structured outputs, code interpreter | MEDIUM — alternative if customer uses OpenAI |
| **AutoGen (Microsoft)** | Multi-agent conversation, code execution | LOW — over-engineered for single-agent SPC use case |

### 9.3 Adjacent AI Agent Products

| Product | Relevance |
|---------|-----------|
| **RCAgent** (research paper) | First LLM-based RCA framework using tool-augmented agents for cloud operations. Directly applicable architecture pattern. |
| **ChipAgents RCA** | Autonomous ASIC root cause analysis — semiconductor-specific but similar concept. |
| **Logz.io AI Agent** | AI-powered RCA for observability data. Production-proven agent-based investigation. |
| **f7i.ai** | "Statistical Process Control in 2026: The Asset Health Framework" — positions SPC as part of asset health, AI-driven. |

### 9.4 Market Context

- Deloitte predicts a **4x increase in agentic AI adoption in manufacturing by 2026** (from 6% to 24%)
- Gartner warns that **"over 40% of agentic AI projects will be cancelled by end of 2027"** due to unclear value or cost overruns
- This means there is a window of opportunity: the market expects AI agents, but most implementations will fail. A well-scoped, genuinely useful agent (not a toy) can capture significant mindshare.

---

## 10. Differentiation: Beyond "ChatGPT on Quality Data"

### 10.1 What makes this NOT just another AI wrapper

| Feature | "ChatGPT wrapper" | Cassini Quality Agent |
|---------|-------------------|-----------------------|
| Scope | Single prompt, single response | Multi-step investigation across the data model |
| Context | Whatever the user pastes in | Full access to 263 API endpoints as tools |
| Memory | Stateless | Knowledge base of confirmed past investigations |
| Trigger | User clicks a button | Autonomous event-driven + on-demand |
| Output | Text blob | Structured report with evidence chain, confidence scores, actionable recommendations |
| Learning | None | Feedback loop — human corrections improve future investigations |
| Compliance | Not auditable | Full audit trail, electronic signature integration |
| Domain expertise | Generic LLM knowledge | SPC-specific tools, Nelson rule explanations, AIAG/ASTM standards references |

### 10.2 The "10x Moment"

The genuinely novel capability is **cross-characteristic investigation with temporal correlation**. No existing SPC tool does this autonomously:

> "Bore Diameter on Station 3 shows a mean shift. The agent automatically checks Width and Height at the same station, finds Width also shifted at the same time but Height didn't. It checks the gage R&R for Bore's measurement system — adequate. It searches past investigations and finds a similar pattern from January that was caused by fixture wear. It drafts a report recommending fixture inspection, with 75% confidence based on the historical match."

This is what a senior quality engineer does manually over 30-60 minutes. The agent does it in 2-3 minutes.

### 10.3 Moat: The Knowledge Base

The knowledge base creates a compounding advantage:
- **Day 1**: Agent has generic SPC knowledge + the data in Cassini
- **Month 3**: Agent has 50 confirmed investigations specific to this plant
- **Month 12**: Agent has 200+ investigations, knows the common failure modes for each station, which gages drift, which operators see more violations
- **Year 2**: The knowledge base itself becomes a valuable asset — switching costs increase

This is the classic data flywheel: more usage -> more investigations -> better knowledge base -> better investigations -> more usage.

---

## 11. MCP Server Synergy

### 11.1 Built-In Agent vs. MCP External Agents

Cassini could serve both internal and external agent models:

```
                    +------------------+
                    |  Cassini Backend  |
                    |                  |
                    |  Built-in Agent  |  <-- Internal: uses DB directly
                    |  (event-driven)  |      Lower latency, full context
                    |                  |
                    +--------+---------+
                             |
                    +--------+---------+
                    |   MCP Server     |  <-- External: API-mediated
                    |  (tools + data)  |      Claude Desktop, custom agents
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
        Claude Desktop  Custom Agent   Other MCP Client
```

### 11.2 Complementary Roles

| Aspect | Built-In Agent | MCP External Agent |
|--------|---------------|-------------------|
| Trigger | Event bus (real-time) | User-initiated (ad-hoc) |
| Context | Full DB access, internal services | API-mediated, tool-limited |
| Latency | Low (in-process) | Higher (HTTP + MCP protocol) |
| Customization | Fixed investigation workflow | User can ask arbitrary questions |
| Cost | Managed by Cassini (budget controls) | User's own API key/budget |
| Audit | Full internal audit trail | MCP server logs tool calls |
| Use case | "Automated quality sentinel" | "Quality engineer's AI assistant" |

### 11.3 MCP Tool Overlap

The MCP server's tools and the built-in agent's tools should share the same underlying implementation. The agent tool `get_violations(char_id=42)` and the MCP tool `cassini_get_violations(char_id=42)` should call the same service layer.

This means building the tool layer once and exposing it through two interfaces:
1. Internal: Python function calls within the agent loop
2. External: MCP tool definitions served over the MCP protocol

### 11.4 MCP as Distribution Channel

If Cassini publishes an MCP server, any AI agent (Claude Desktop, Cursor, custom CrewAI agents, etc.) can investigate quality data without Cassini building the agent itself. This is a lower-effort way to offer "AI agent" capabilities — let the ecosystem build agents, Cassini provides the tools.

**Risk**: Less control over the experience, no knowledge base accumulation, no event-driven triggering.

**Recommendation**: Build both. The MCP server is table stakes (low effort, broad reach). The built-in agent is the differentiator (high effort, deep value).

---

## 12. Implementation Phasing

### Phase 1: Foundation (2-3 weeks)

- Define tool interfaces (Python protocol/ABC)
- Implement 8 core query tools wrapping existing endpoints
- Build investigation data model (3 tables: investigation, investigation_step, investigation_report)
- Alembic migration
- Basic ReAct loop using existing `BaseLLMProvider` + tool use (Claude Messages API with tools)
- Manual trigger only (POST endpoint)
- Investigation viewer UI (read-only timeline of steps)

### Phase 2: Event-Driven + Knowledge Base (2-3 weeks)

- EventBus subscriber for ViolationCreatedEvent / AnomalyDetectedEvent
- Debouncing and cooldown logic
- Investigation embedding + vector search (simple: store in DB, cosine similarity in Python)
- Human review UI (confirm/correct/reject)
- Feedback loop: confirmed investigations become searchable knowledge
- WebSocket updates during investigation progress

### Phase 3: Advanced Tools + Multi-Characteristic (1-2 weeks)

- Cross-characteristic investigation tools
- Temporal correlation analysis
- MSA/gage verification tools
- Audit log context tools
- Investigation cost tracking and budget controls

### Phase 4: MCP Server + Polish (1-2 weeks)

- Expose agent tools as MCP server
- Scheduled investigations (cron-style)
- Investigation analytics dashboard (accuracy over time, common root causes)
- Cold-start knowledge seeding

---

## 13. Technical Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM hallucination in investigation reports | Agent claims false findings | Every finding must reference a specific tool call result. Structured output schema enforces evidence linking. |
| Token cost runaway | $50+ per investigation | Hard budget cap (50K input tokens), max 20 tool calls, triage phase gates investigation scope |
| Agent loops (calls same tool repeatedly) | Wasted compute, never terminates | Tool call deduplication, max iteration limit, loop detection (same tool+params within 3 calls) |
| Stale knowledge base | Past investigations no longer relevant | Timestamp-weighted retrieval (recent investigations scored higher), expiration after 1 year |
| Provider-specific tool use formats | Fragile multi-provider support | Abstract tool execution behind provider-agnostic interface. Start with Claude (best tool use), add OpenAI as second. |
| Concurrent investigation conflicts | Two investigations query/modify same data | Read-only tools only. Agent cannot modify data. Concurrent reads are safe. |
| Regulatory pushback on "AI making quality decisions" | Customer won't deploy | Clear "advisory only" positioning. Agent outputs are suggestions, not decisions. Full audit trail. Human signature required. |

---

## 14. Open Questions

1. **Should the agent use the same LLM provider as the one-shot analysis, or have its own config?** Recommendation: same config, but with a separate token budget and model override option (agent may benefit from a more capable model).

2. **How do we handle multi-plant knowledge?** Should a fixture wear pattern found in Plant A be retrievable when Plant B sees the same symptoms? Recommendation: opt-in cross-plant knowledge sharing with plant-level consent.

3. **What's the right confidence threshold for automated escalation?** If the agent identifies a critical issue with 90%+ confidence, should it auto-notify the supervisor? Recommendation: configurable per plant, default to "always require human review."

4. **Should the agent have access to raw measurement values or only aggregated statistics?** Raw values enable more detailed analysis but increase token cost. Recommendation: aggregated by default, raw on-demand (agent can request if needed).

5. **How do we measure agent quality over time?** Track: % of investigations confirmed vs. corrected vs. rejected, average confidence vs. actual accuracy, time-to-root-cause before and after agent deployment.

---

## 15. Sources

- [AI-Enabled SPC for Semiconductor Manufacturing (IJSRM)](https://ijsrm.net/index.php/ijsrm/article/view/6439)
- [SPC + AI: Insight to Foresight (Advantive)](https://www.advantive.com/blog/spc-ai-moving-from-insight-to-foresight-in-manufacturing-quality-quality/)
- [Manufacturing 2026: From AI Pilot to Agentic Profit (Dataiku)](https://www.dataiku.com/stories/blog/manufacturing-ai-trends-2026)
- [AI Quality Control Intelligence Guide (RapidInnovation)](https://www.rapidinnovation.io/post/ai-agent-quality-control-intelligence)
- [RCAgent: Cloud Root Cause Analysis by Autonomous Agents (arXiv)](https://arxiv.org/html/2310.16340v2)
- [Workflow Agent vs Autonomous Agent for RCA (Ushio, Medium)](https://tsuyoshiushio.medium.com/workflow-agent-vs-autonomous-agent-architecture-for-rca-1b65f122defe)
- [Exploring LLM-based Agents for Root Cause Analysis (arXiv)](https://arxiv.org/html/2403.04123v1)
- [21 CFR Part 11 Compliance for AI Systems (IntuitionLabs)](https://intuitionlabs.ai/articles/21-cfr-part-11-compliance-ai-systems)
- [21 CFR Part 11 for AI Systems: FDA Compliance Guide (IntuitionLabs)](https://intuitionlabs.ai/articles/21-cfr-part-11-ai-compliance)
- [Top Agentic AI Frameworks in 2026 (AlphaMatch)](https://www.alphamatch.ai/blog/top-agentic-ai-frameworks-2026)
- [AutoGen vs LangGraph vs CrewAI in 2026 (DEV Community)](https://dev.to/synsun/autogen-vs-langgraph-vs-crewai-which-agent-framework-actually-holds-up-in-2026-3fl8)
- [State of Agent Engineering (LangChain)](https://www.langchain.com/state-of-agent-engineering)
- [Advanced RAG for Manufacturing Quality Control (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S147403462400658X)
- [Knowledge Graph Enhanced RAG for FMEA (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S2452414X25000317)
- [MCP Specification (modelcontextprotocol.io)](https://modelcontextprotocol.io/specification/2025-11-25)
- [2026: Enterprise-Ready MCP Adoption (CData)](https://www.cdata.com/blog/2026-year-enterprise-ready-mcp-adoption)
- [Anthropic Tool Use Documentation](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [Advanced Tool Use Engineering (Anthropic)](https://www.anthropic.com/engineering/advanced-tool-use)
- [Evolving IQC: Predictive AI in 2026 (ComplianceQuest)](https://www.compliancequest.com/blog/iqc-evolution-2025-from-defects-to-intelligent-detection/)
- [ChipAgents RCA (chipagents.ai)](https://chipagents.ai/blogs/chipagents-rca)
