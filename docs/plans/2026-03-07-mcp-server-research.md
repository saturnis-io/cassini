# MCP Server for Cassini SPC Platform — Research & Exploration

**Date**: 2026-03-07
**Status**: Research Only — No Implementation
**Author**: Research session

---

## 1. Tool Curation Strategy

Cassini has ~263 REST API endpoints across 45 router files. An MCP server should NOT expose all of them. The goal is ~30-50 high-value tools that map to what a quality engineer would ask an AI assistant to do. The curation principle: **expose analytical and investigative tools, restrict configuration and administrative tools**.

### Tier 1: Core SPC Intelligence (15-18 tools)

These are the tools an AI agent would use most frequently — reading process state, investigating issues, and answering quality questions.

| Tool Name | Maps To | Description |
|-----------|---------|-------------|
| `get_plant_overview` | `GET /plants/` + hierarchy tree | List all plants with their hierarchy structure |
| `list_characteristics` | `GET /characteristics/` | List characteristics with filtering (plant, hierarchy node, data type) |
| `get_characteristic_detail` | `GET /characteristics/{id}` | Full characteristic config including spec limits, control limits, rules |
| `get_chart_data` | `GET /characteristics/{id}/chart-data` | Time-series data points with control limits, violations marked |
| `get_capability` | `GET /characteristics/{id}/capability` | Current Cp, Cpk, Pp, Ppk, normality test results |
| `get_capability_history` | `GET /characteristics/{id}/capability/history` | Capability trend over time |
| `list_violations` | `GET /violations/` | Active violations with filtering (plant, severity, acknowledged, date range) |
| `get_violation_stats` | `GET /violations/stats` | Aggregated violation counts by rule, severity, acknowledgment status |
| `get_prediction_forecast` | `GET /predictions/{id}/forecast` | ARIMA/ETS forecast with confidence intervals and predicted OOC alerts |
| `get_prediction_dashboard` | `GET /predictions/dashboard` | Multi-characteristic prediction overview |
| `get_anomaly_events` | `GET /anomaly/events` | Pattern-based anomaly detections |
| `get_distribution_fit` | `GET /characteristics/{id}/distribution` | Distribution analysis (normality, best-fit family) |
| `explain_metric` | `GET /explain/{id}` | Show-your-work computation trace for any statistical metric |
| `get_ai_insight` | `GET /ai/insights/{id}` | Latest AI analysis for a characteristic |
| `list_samples` | `GET /samples/` | Raw measurement data with filtering |
| `get_multivariate_analysis` | `GET /multivariate/{id}` | T-squared, MEWMA, correlation analysis |

### Tier 2: Investigation & Cross-Referencing (8-10 tools)

These help an agent trace problems across the system and correlate data.

| Tool Name | Maps To | Description |
|-----------|---------|-------------|
| `get_hierarchy_tree` | `GET /plants/{id}/hierarchy/tree` | Full ISA-95 equipment hierarchy for a plant |
| `get_msa_study` | `GET /msa/studies/{id}` | Gage R&R / measurement system analysis results |
| `list_msa_studies` | `GET /msa/studies` | All MSA studies with status |
| `get_fai_report` | `GET /fai/reports/{id}` | First Article Inspection report (AS9102) |
| `get_audit_log` | `GET /audit/` | Audit trail entries (who did what, when) |
| `get_doe_analysis` | `GET /doe/{id}` | DOE factorial analysis results |
| `search_annotations` | `GET /annotations/` | Chart annotations and notes by characteristic |
| `get_ishikawa` | `GET /ishikawa/{id}` | Ishikawa (fishbone) diagram data for root cause analysis |

### Tier 3: Limited Write Operations (5-8 tools)

Write operations should be carefully controlled. Only expose actions where AI assistance adds clear value and where the consequence of error is bounded.

| Tool Name | Maps To | Risk Level | Description |
|-----------|---------|------------|-------------|
| `acknowledge_violation` | `POST /violations/{id}/acknowledge` | Medium | Acknowledge a violation with reason code |
| `add_annotation` | `POST /annotations/` | Low | Add a note to a chart data point |
| `trigger_ai_analysis` | `POST /ai/analyze/{id}` | Low | Request AI analysis of a characteristic |
| `save_capability_snapshot` | `POST /characteristics/{id}/capability/snapshot` | Low | Persist current capability for trending |
| `add_sample` | `POST /data-entry/` | Medium | Submit manual measurement data |
| `run_prediction` | `POST /predictions/{id}/train` | Low | Train/retrain forecast model |

### Explicitly Excluded

These endpoints should NOT be MCP tools:
- **Auth/Users/OIDC**: Login, token refresh, user CRUD, SSO configuration
- **API Key Management**: Creating/revoking API keys
- **System Settings**: Database admin, retention policies, system configuration
- **Data Source Config**: MQTT broker setup, OPC-UA server configuration, gage bridge management
- **ERP Connectors**: Adapter configuration, sync triggers
- **Push Notifications**: Subscription management
- **WebSocket**: Real-time subscriptions (MCP has its own streaming model)
- **License Management**: License key validation
- **DevTools**: Seed data, developer utilities
- **Bulk Import**: CSV/file import operations
- **Electronic Signatures**: Signing workflows (these require human accountability)

---

## 2. Resource Definitions

MCP Resources provide read-only context that an AI agent can pull into its context window without invoking a tool. These are best for stable, summary-level data that enriches the agent's understanding of the current state.

### Static Resources

| Resource URI | Description | Update Frequency |
|-------------|-------------|-----------------|
| `cassini://plants` | List of all plants with IDs, names, and characteristic counts | On plant CRUD |
| `cassini://plants/{id}/hierarchy` | Full ISA-95 hierarchy tree for a plant | On hierarchy changes |
| `cassini://schema/violation-rules` | Nelson rule definitions (1-8) with descriptions | Static |
| `cassini://schema/reason-codes` | Standard violation acknowledgment reason codes | Static |
| `cassini://schema/chart-types` | Available chart types (X-bar R, X-bar S, I-MR, p, np, c, u, CUSUM, EWMA) | Static |

### Dynamic Resources (Resource Templates)

| Resource URI Template | Description |
|----------------------|-------------|
| `cassini://plants/{plantId}/status` | Plant health summary: active violations count, characteristics at risk, latest Cpk values |
| `cassini://characteristics/{charId}/summary` | Single-characteristic digest: current Cpk, control status, recent violations, spec limits |
| `cassini://violations/active` | All unacknowledged violations across all plants with severity and age |
| `cassini://predictions/at-risk` | Characteristics with predicted future OOC conditions |
| `cassini://capabilities/below-threshold?threshold=1.33` | All characteristics with Cpk below the specified threshold |

### Resource Design Principles

1. **Summarize, don't dump**: Resources should return pre-digested summaries, not raw query results. An agent needs "Plant A has 3 critical violations and 2 characteristics with Cpk < 1.0" not 500 rows of violation data.
2. **Include hierarchy paths**: Always include the full hierarchy breadcrumb (Plant > Line > Station > Characteristic) so the agent can reference things by name, not just ID.
3. **Cache-friendly**: Resources should have clear cache lifetimes. Plant structure changes rarely; violation counts change frequently.

---

## 3. Use Cases and Scenarios

### Scenario 1: Morning Quality Standup Prep
**Prompt**: "Prepare a summary of overnight quality for Plant Austin"
**Agent actions**: Read `cassini://plants/1/status` resource, call `list_violations(plant_id=1, start_date=last_night)`, call `get_violation_stats(plant_id=1)`. Synthesize into a briefing: "3 new critical violations on Station 5 Diameter characteristic. Cpk dropped from 1.45 to 0.98. 2 violations require acknowledgment."

### Scenario 2: Cpk Investigation
**Prompt**: "Why did Cpk drop on the Bore Diameter characteristic at Station 3?"
**Agent actions**: `get_capability(char_id=42)` for current state, `get_capability_history(char_id=42)` to find when it dropped, `get_chart_data(char_id=42)` to see recent data points, `list_violations(characteristic_id=42)` to see what rules triggered, `get_ai_insight(char_id=42)` for pattern analysis. Correlate timestamps and explain root cause.

### Scenario 3: Monthly Quality Report
**Prompt**: "Generate a monthly quality summary for all plants"
**Agent actions**: For each plant, read status resource, get capability for all characteristics, compute summary statistics (% characteristics meeting Cpk > 1.33, violation trends, top offenders). Output structured report with trend arrows.

### Scenario 4: Trending Toward Out-of-Control
**Prompt**: "Are any characteristics trending toward out-of-control?"
**Agent actions**: Read `cassini://predictions/at-risk` resource, call `get_prediction_forecast()` for flagged characteristics, cross-reference with `get_chart_data()` to confirm trend. Alert on characteristics predicted to exceed control limits within N samples.

### Scenario 5: MSA Decision Support
**Prompt**: "Is our measurement system for Surface Roughness adequate?"
**Agent actions**: `list_msa_studies(characteristic_id=55)`, `get_msa_study(study_id=12)`. Evaluate GRR%, ndc, and provide AIAG classification (acceptable / marginal / unacceptable). Recommend next steps.

### Scenario 6: FAI Status Check
**Prompt**: "What FAI reports are pending approval?"
**Agent actions**: `list_fai_reports(status=submitted)`. For each, show part name, form completeness, submitted by, waiting since. Flag any overdue.

### Scenario 7: Violation Triage
**Prompt**: "Triage the 15 unacknowledged violations and recommend which to investigate first"
**Agent actions**: `list_violations(acknowledged=false)`. Rank by severity, recency, and affected characteristic's Cpk. Group by root cause pattern if Nelson rules cluster. Recommend top 3 for investigation.

### Scenario 8: Cross-Station Correlation
**Prompt**: "Is the diameter issue on Station 3 related to the surface finish problem on Station 5?"
**Agent actions**: `get_chart_data()` for both characteristics, check temporal correlation of violations, `get_multivariate_analysis()` if available. Look for common cause patterns (same shift, same material batch).

### Scenario 9: Process Capability Certification
**Prompt**: "Can we certify the new production line meets customer Cpk requirements?"
**Agent actions**: For each characteristic on the line, `get_capability()` and compare against customer-specified minimums (typically Cpk >= 1.33 for existing, >= 1.67 for new processes). Flag any below threshold. Check sample count adequacy.

### Scenario 10: Anomaly Pattern Recognition
**Prompt**: "What anomaly patterns have been detected in the last week?"
**Agent actions**: `get_anomaly_events(start_date=7_days_ago)`. Group by type (drift, shift, cyclic, mixture). Map to characteristics and stations. Identify if patterns are isolated or systemic.

### Scenario 11: Shift Comparison
**Prompt**: "Compare quality metrics between day shift and night shift at Plant Austin"
**Agent actions**: `get_chart_data()` with time filters for each shift period, compute mean/sigma/Cpk per shift, `list_violations()` per shift window. Present side-by-side comparison.

### Scenario 12: Supplier Quality Incoming Inspection
**Prompt**: "How has incoming material quality changed since we switched suppliers?"
**Agent actions**: `get_chart_data()` for incoming inspection characteristics, filter by date before/after supplier switch, compute capability comparison, check violation rate change.

### Scenario 13: Predictive Maintenance Correlation
**Prompt**: "Is the increasing variability on Station 2 correlated with equipment age?"
**Agent actions**: `get_chart_data()` to identify sigma trend, `get_prediction_forecast()` for extrapolation, `search_annotations()` for maintenance notes. Correlate with maintenance schedule data.

### Scenario 14: Root Cause Fishbone
**Prompt**: "Help me build an Ishikawa diagram for the OOC condition on Characteristic 42"
**Agent actions**: `get_ishikawa(char_id=42)` for existing diagram, `list_violations(characteristic_id=42)` for recent patterns, `get_ai_insight(char_id=42)` for AI-suggested causes. Synthesize into structured cause categories.

### Scenario 15: Audit Preparation
**Prompt**: "Prepare data for our upcoming ISO 9001 audit — show SPC compliance evidence"
**Agent actions**: For each critical characteristic: `get_capability_history()` showing sustained control, `get_violation_stats()` showing response times, `get_audit_log()` showing acknowledgment compliance, `list_msa_studies()` showing measurement system validation. Compile evidence package.

---

## 4. Auth and Permissions Model

### Current Cassini Auth Architecture

Cassini already has a layered auth system:
1. **JWT tokens** (15-min access + 7-day refresh cookie) for interactive users
2. **API keys** (hashed, rate-limited, expirable) for M2M integration
3. **Role-based access**: operator < supervisor < engineer < admin, scoped per-plant via `user_plant_role`

### MCP Auth Approach: OAuth 2.1 with API Key Bootstrap

The MCP specification (November 2025 revision) mandates **OAuth 2.1** for remote MCP servers, with PKCE required for all clients. The recommended architecture:

#### Option A: OAuth 2.1 Resource Server (Recommended for Production)

```
[AI Agent / Claude Desktop]
    → OAuth 2.1 Authorization Code + PKCE
    → [Authorization Server (Cassini or external IdP)]
    → Bearer token with scopes
    → [Cassini MCP Server validates token]
```

- Cassini's MCP server acts as an **OAuth 2.1 resource server** — it validates tokens but doesn't issue them
- Scopes map to Cassini's role system:
  - `cassini:read` — equivalent to operator (read all data)
  - `cassini:analyze` — equivalent to engineer (trigger analyses, save snapshots)
  - `cassini:write` — equivalent to supervisor (acknowledge violations, enter data)
  - `cassini:admin` — equivalent to admin (never exposed via MCP by default)
- Plant scoping via **token claims**: the token includes `plant_ids: [1, 3, 7]` restricting which plants the agent can access

#### Option B: API Key Pass-Through (Simpler, Good for Initial Release)

```
[AI Agent]
    → Cassini API Key in MCP config
    → [Cassini MCP Server uses key for all API calls]
```

- Leverages existing API key infrastructure
- Each MCP connection gets its own API key with configurable rate limits
- Simpler to implement but less granular (no per-request user attribution)
- Good enough for initial release; migrate to OAuth 2.1 later

### Permission Guardrails for AI Agents

| Concern | Mitigation |
|---------|------------|
| AI acknowledges violations it shouldn't | Plant-scoped tokens. Agent can only ack violations in plants it has `cassini:write` scope for. |
| AI enters bad measurement data | Validate against spec limits before accepting. Flag entries from MCP-sourced API keys in audit log. |
| AI triggers expensive analyses | Rate limiting per API key. Prediction training capped at N/hour. |
| AI accesses sensitive config | Admin-level endpoints excluded from MCP tools entirely. |
| Audit trail attribution | All MCP actions logged with `source: mcp` and the API key/token identity, distinguishable from human actions. |
| Read-only mode | Support a `cassini:read` scope that only exposes Tier 1 tools + resources. No write tools available. |

### Human-in-the-Loop Pattern

For high-consequence actions (acknowledging violations, entering data), the MCP server could implement **confirmation prompts**:
- Agent calls `acknowledge_violation()`
- MCP server returns a confirmation prompt: "Confirm: Acknowledge violation #42 (Critical, Rule 1 — Outlier) on Bore Diameter at Station 3 with reason 'Tool Change'?"
- Agent must present this to the user for approval before the action executes
- This maps to MCP's `prompts` primitive — pre-defined interaction patterns

---

## 5. Competitive Landscape

### Direct Competitors (SPC Software + AI/API)

| Product | AI Agent / MCP Status | Notes |
|---------|----------------------|-------|
| **Minitab Real-Time SPC** | No MCP server. Has REST API for data integration. No AI agent story. | Market leader in SPC analytics. Enterprise-focused. |
| **InfinityQS ProFicient/Enact** | No MCP server. Cloud API (Enact). No public AI agent integration. | Largest installed base. Recently acquired by Advantive. |
| **Hexagon Q-DAS** | No MCP server. AQDEF file format integration. No AI agent story. | Strong in automotive (VDA). |
| **DataLyzer SPC** | No MCP server. OPC integration focus. | Mid-market. |
| **Ellistat** | No MCP server. Has AI for process adjustment, not agent-based. | French company, EU market. |
| **Prolink SQCPack** | No MCP server. Traditional desktop + cloud. | Long-established brand. |
| **ABB MOM SPC** | Part of ABB's MOM suite. No MCP. SCADA integration. | Enterprise manufacturing. |
| **PTC ThingWorx** | IoT platform with SPC add-on. No MCP. REST APIs available. | Broad IoT play, SPC is secondary. |

### MCP Landscape in Manufacturing/Quality

Based on web research, **no SPC or quality management platform currently offers an MCP server**. The MCP ecosystem in manufacturing is nascent:

- **PDF Solutions** published a thought-leadership piece on agentic AI in process control (semiconductor), mentioning MCP as a future integration protocol, but no shipping product
- **Industrial AI platforms** (Sight Machine, Uptake, Augury) focus on predictive maintenance, not SPC, and none offer MCP
- The top MCP server directories (index.dev, intuz.com, medium lists) catalog MCP servers for databases, CRMs, dev tools, and general enterprise systems — **zero manufacturing or quality-specific entries**
- **f7i.ai** wrote about SPC + asset health in 2026 but from a consulting perspective, not a software product with MCP

### What This Means for Cassini

**Cassini would be the first SPC platform with an MCP server.** This is a genuine first-mover advantage in a category where:
- The major players (Minitab, InfinityQS, Hexagon) are slow-moving enterprise vendors
- The industry is aware of AI's potential (PDF Solutions, f7i.ai articles) but nobody has shipped an agent-compatible interface
- Manufacturing companies are adopting MCP for other enterprise systems (ERP, CRM, ticketing) and will expect quality systems to follow

---

## 6. Technical Approach

### Primary Option: `fastapi-mcp` Library

The `fastapi-mcp` library (v0.4.0, tadata-org/fastapi_mcp on GitHub) is purpose-built for this:

```python
from fastapi_mcp import FastMCP

# Wrap the existing FastAPI app
mcp = FastMCP.from_fastapi(
    app=cassini_app,
    # Selectively expose only curated endpoints
    include_operations=["get_capability", "list_violations", ...],
)
mcp.mount()  # Adds /mcp endpoint to the FastAPI app
```

**How it works**:
- Communicates through FastAPI's ASGI interface — no separate HTTP calls between MCP server and API
- Preserves Pydantic request/response schemas as MCP tool input/output definitions
- Preserves FastAPI dependency injection (including `Depends()` auth)
- GET endpoints with path params become Resource Templates; POST/PUT/DELETE become Tools
- Zero/minimal configuration for basic setup

**Key advantages for Cassini**:
- All 263 endpoints already have OpenAPI schemas via Pydantic — MCP tool definitions are auto-generated
- Auth dependencies (`get_current_user`, `check_plant_role`) carry over into MCP
- Same server process — no deployment complexity

### Alternative: `FastMCP.from_openapi()`

If we want to run the MCP server as a separate process:

```python
from fastmcp import FastMCP

mcp = FastMCP.from_openapi(
    openapi_url="http://localhost:8000/openapi.json",
    # Or pass the spec dict directly
)
```

This generates an MCP server from the OpenAPI spec and proxies calls to the REST API. More deployment flexibility but adds network hop.

### Alternative: Hand-Written FastMCP Tools

For maximum control over tool descriptions and behavior:

```python
from fastmcp import FastMCP

mcp = FastMCP("Cassini SPC")

@mcp.tool()
async def get_process_capability(
    characteristic_id: int,
    window_size: int = 1000
) -> dict:
    """Get process capability indices (Cp, Cpk, Pp, Ppk) for a characteristic.

    Use this to evaluate whether a manufacturing process is capable of
    meeting specification requirements. Cpk > 1.33 is generally acceptable;
    Cpk > 1.67 is required for new processes.
    """
    # Call internal service directly, not via HTTP
    async with get_session() as session:
        char, values, sigma = await _get_char_and_values(
            characteristic_id, session, window_size
        )
        result = calculate_capability(values, char.usl, char.lsl, ...)
        return result.model_dump()
```

**Advantages**: Better tool descriptions (optimized for LLM consumption), can compose multiple API calls into single tools, can add SPC domain context to descriptions.

**Disadvantages**: More code to maintain, doesn't auto-track API changes.

### Recommended Approach: Hybrid

1. **Start with `fastapi-mcp`** for the curated ~35 endpoints — zero implementation effort
2. **Add hand-written composite tools** for high-value agent workflows that span multiple endpoints (e.g., `investigate_cpk_drop` that calls capability + chart data + violations in one tool)
3. **Add hand-written resources** for the summary resources (plant status, active violations) that don't map 1:1 to endpoints

### Transport

**Streamable HTTP** (the current MCP standard, replacing deprecated SSE):
- Cassini already runs as an HTTP server — Streamable HTTP is natural
- Infrastructure-friendly: works with standard HTTP middleware, proxies, load balancers
- Supports stateless operation — no persistent connections required
- Backward-compatible: can still use SSE for streaming when needed

The MCP endpoint would be at `/mcp` on the existing Cassini backend server.

### Python Requirements

- **MCP Python SDK**: `mcp` package on PyPI (current: v2.6.x). Requires Python 3.12+
- **Note**: Cassini currently targets Python 3.11+. The MCP SDK requires 3.12+, so this would bump the minimum Python version
- **FastMCP**: The high-level API (`fastmcp` package) wraps the official SDK with ergonomic decorators

---

## 7. What Makes This Genuinely Novel

### Beyond REST: What MCP Enables That REST Alone Cannot

**1. Contextual Tool Selection**

With a REST API, the integrator must know which endpoints to call. With MCP, the AI agent receives tool descriptions and autonomously selects which to use based on the user's natural language request. A quality engineer says "why is Station 3 acting up?" and the agent decides to call capability, violations, chart data, and anomaly detection — it doesn't need to know the API structure.

**2. Compositional Reasoning Across Tools**

REST gives you data. MCP gives you data + the context for an AI to reason over it. An agent can chain `get_capability()` → see Cpk dropped → `get_chart_data()` → see a shift at sample 450 → `list_violations()` → see Rule 2 (9 consecutive same side) triggered → `search_annotations()` → find "new material batch" annotation near that sample → synthesize: "Cpk dropped because a material batch change at sample 450 introduced a process mean shift."

No REST API consumer does this automatically. It requires an AI agent with MCP tool access.

**3. Semantic Resource Discovery**

MCP resources let an agent proactively load context before being asked. When a user opens a conversation about "Plant Austin quality," the agent can automatically read `cassini://plants/1/status` to have the current state in context. REST APIs are pull-only; MCP resources enable push-context patterns.

**4. Prompts as Guided Workflows**

MCP's prompts primitive can encode domain-specific workflows:
- `acknowledge-violation` prompt: structured flow for collecting reason code, confirming details, handling the write
- `capability-review` prompt: guided walkthrough of evaluating a characteristic's process capability against requirements
- `shift-handoff` prompt: structured template for generating an end-of-shift quality summary

These are reusable templates that any MCP client (Claude Desktop, Cursor, custom agents) can invoke.

**5. The "SPC Copilot" Experience**

REST API + documentation = developer integration. MCP server = **quality engineer talks to their SPC system in natural language**. The differentiation is the audience: REST is for software developers building integrations; MCP is for quality engineers, supervisors, and plant managers getting answers from their data without writing code or navigating dashboards.

**6. Multi-System Orchestration**

When a manufacturing company has Cassini (SPC) + their ERP + their CMMS all as MCP servers, an AI agent can orchestrate across all three:
- "The bore diameter is trending OOC — check if there's a maintenance order open for the CNC machine, and notify the supplier about the material batch"
- This crosses SPC → CMMS → ERP → supplier portal in a single agent workflow
- MCP's standardized protocol makes this composable without point-to-point integrations

**7. Competitive Moat**

As documented in section 5, no SPC vendor has an MCP server. By shipping first, Cassini:
- Becomes the default choice for companies adopting agentic AI in manufacturing
- Gets listed in MCP server directories and registries (a discovery channel competitors don't have)
- Sets the standard for how SPC data should be exposed to AI agents
- Creates lock-in through agent workflows that depend on Cassini's tool definitions

---

## 8. Implementation Roadmap (Recommended Phases)

### Phase 1: Read-Only MCP Server (1-2 weeks)

- Mount `fastapi-mcp` on curated read-only endpoints (~20 tools)
- Add 5 resource definitions (plant status, active violations, etc.)
- API key auth pass-through
- Streamable HTTP transport at `/mcp`
- Documentation + Claude Desktop demo config

### Phase 2: Write Operations + Prompts (1 week)

- Add Tier 3 write tools with confirmation prompts
- Add 3-4 guided workflow prompts
- Rate limiting for MCP-sourced requests
- Audit trail differentiation (`source: mcp`)

### Phase 3: Composite Tools + OAuth (2 weeks)

- Hand-written composite tools for top 5 investigation workflows
- OAuth 2.1 resource server implementation
- Scoped tokens with plant-level restrictions
- Tool filtering based on token scopes

### Phase 4: Real-Time Subscriptions (Future)

- WebSocket-to-MCP event bridging for real-time violation alerts
- Notification-driven agent triggers ("alert me if any characteristic drops below Cpk 1.0")

---

## 9. Open Questions

1. **Python version**: MCP SDK requires 3.12+. Cassini targets 3.11+. Is this bump acceptable?
2. **Deployment topology**: Same process as backend, or separate MCP gateway process?
3. **Tool naming**: Use Cassini-specific names (`get_capability`) or generic manufacturing terms (`get_process_capability_indices`)?
4. **Multi-tenant**: Should the MCP server support multi-tenant deployments where different API keys see different plants?
5. **Tool description optimization**: How much SPC domain knowledge should be embedded in tool descriptions vs. left to the agent's general knowledge?
6. **Commercial tier**: Should MCP be a community feature (differentiation for all users) or commercial (enterprise upsell)?

---

## Sources

- [MCP Python SDK — GitHub](https://github.com/modelcontextprotocol/python-sdk)
- [MCP Python SDK Documentation](https://modelcontextprotocol.github.io/python-sdk/)
- [Build an MCP Server — Model Context Protocol](https://modelcontextprotocol.io/docs/develop/build-server)
- [MCP Authorization Tutorial](https://modelcontextprotocol.io/docs/tutorials/security/authorization)
- [FastAPI-MCP — GitHub](https://github.com/tadata-org/fastapi_mcp)
- [FastMCP + FastAPI Integration](https://gofastmcp.com/integrations/fastapi)
- [OpenAPI to MCP — PyPI](https://pypi.org/project/openapi-to-mcp/)
- [MCP Transports Specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [Why MCP Deprecated SSE for Streamable HTTP](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/)
- [MCP Authentication Best Practices 2026](https://www.stainless.com/mcp/mcp-server-api-key-management-best-practices)
- [OAuth 2.1 for MCP Servers](https://www.scalekit.com/blog/migrating-from-api-keys-to-oauth-mcp-servers)
- [AI in Process Control Evolution — PDF Solutions](https://www.pdf.com/the-evolution-of-ai-in-process-control-from-basic-spc-to-agentic-ai-systems/)
- [SPC in 2026: Asset Health Framework — f7i.ai](https://f7i.ai/blog/statistical-process-control-spc-the-definitive-guide-to-asset-health-and-reliability-in-2026)
- [54 Patterns for Building Better MCP Tools — Arcade](https://www.arcade.dev/blog/mcp-tool-patterns)
- [MCP Architecture Deep Dive](https://www.getknit.dev/blog/mcp-architecture-deep-dive-tools-resources-and-prompts-explained)
- [Scaling Agentic AI with MCP — OneReach](https://onereach.ai/blog/scaling-agentic-ai-with-mcp-use-cases-benefits/)
- [Industrial AI Trends 2026 — IIoT World](https://www.iiot-world.com/artificial-intelligence-ml/2026-industrial-ai-trends-driving-global-manufacturing-with-agentic-systems/)
