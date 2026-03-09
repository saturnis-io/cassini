---
type: strategy
status: active
created: 2026-02-12
updated: 2026-03-06
tags:
  - strategy
  - active
aliases:
  - Pricing Strategy
---

# Pricing Strategy 2026

> **Full source**: `.planning/PRICING-STRATEGY-2026.md`
> **Basis**: Competitive analysis of 13 commercial SPC tools + LLM/AI market impact research

---

## The LLM Reality Check

**Truth 1**: The code itself is approaching commodity value. AI-assisted development built 170+ endpoints in weeks. You cannot price based on volume of code written.

**Truth 2**: The domain model is not a commodity. Nelson Rules, CUSUM parameters, Sparkplug B topic mapping, 21 CFR Part 11 workflows, retention policy inheritance -- none of this comes from a naive LLM prompt. The *decisions* encoded in the codebase are the product, not the code.

**Bottom line**: LLMs don't make the software worthless. They make the development cost irrelevant to pricing. **Price on value delivered** (compliance achieved, defects prevented, audit trail provided), not on cost to build.

---

## Pricing Architecture: Open-Core + Compliance Gate

Model validated by GitLab ($759M revenue), Grafana ($400M ARR), Supabase ($70M ARR), PostHog ($1.4B valuation).

### Tier 0 -- Community Edition (Free, Forever, Self-Hosted)

**What's included**: Everything currently built, minus compliance and enterprise operations.

- All chart types (variable + attribute + CUSUM + EWMA)
- All 8 Nelson Rules
- Process capability (Cp/Cpk/Pp/Ppk/Cpm)
- MQTT + OPC-UA connectivity
- AI/ML anomaly detection
- CSV/Excel import
- Single-plant operation
- Basic RBAC (4-tier)
- Docker deployment, REST API, WebSocket real-time
- Community support (GitHub Issues/Discussions)

**Why give this away**: Distribution engine. Every quality engineer who downloads Cassini becomes a future enterprise customer when they scale, get audited, or need multi-plant. Free tier is customer acquisition at $0 CAC.

**License**: AGPL-3.0 (forces companies that modify the code to open-source changes, creating natural pull toward commercial license).

### Tier 1 -- Professional ($500/month, ~$5,000/year)

**Target**: SME manufacturers (<$50M revenue), 5-50 users, 1-3 plants

**Adds**:
- Multi-plant support (up to 5)
- SSO/OIDC integration ([[Features/SSO]])
- Email + webhook notifications ([[Features/Notifications]])
- Scheduled reports
- Records retention with automated purge ([[Features/Records Retention]])
- Priority email support (48-hour SLA)

**Pricing logic**: $5K/year = 10-20% of mid-market competitors (WinSPC $8K-$16K, SQCpack $7K-$12K). Not undercutting -- disruption pricing.

### Tier 2 -- Enterprise ($2,500/month, ~$25,000/year)

**Target**: Mid-market manufacturers ($50M-$500M revenue), 50-200 users, 3-20 plants

**Adds**:
- Unlimited plants
- 21 CFR Part 11 electronic signatures ([[Features/Electronic Signatures]])
- Immutable audit trail with CSV export ([[Features/Audit Trail]])
- Password policy enforcement
- Signature workflow configuration
- Multi-step approval workflows
- Dedicated support (24-hour SLA, named account manager)
- Validation documentation package (IQ/OQ templates)

**This is the critical gate.** E-signatures and audit trail separate "a quality tool" from "a regulated manufacturing platform." InfinityQS charges $50K-$200K for this tier. Cassini offers it at $25K with a modern tech stack they can't match.

### Tier 3 -- Enterprise Plus (Custom, $50K-$150K/year)

**Target**: Large manufacturers, Fortune 500, multi-site regulated industries

**Adds**:
- On-premise deployment with commercial license (escape AGPL)
- Custom ERP/MES integration engineering
- Validation support services (IQ/OQ/PQ)
- Training packages (operator, engineer, admin)
- Uptime SLA (99.9%+)
- Dedicated Slack/Teams channel
- Roadmap influence

**Pricing logic**: Still 30-70% cheaper than InfinityQS ProFicient ($50K-$200K software + $50K-$250K implementation).

---

## Price Anchoring

| | Community | Pro | Enterprise | WinSPC | IQS Enact | IQS ProFicient | Minitab RT |
|---|---|---|---|---|---|---|---|
| Annual cost | $0 | $5K | $25K | $8K-$30K | $6K-$12K/user | $50K-$200K | $50K-$300K |
| 5yr TCO (10 users) | $0 + hosting | $25K | $125K | $55K-$200K | $80K-$350K | $420K-$1.5M | $400K-$2M |
| Docker | Yes | Yes | Yes | No | No | No | No |
| REST API | Yes | Yes | Yes | No (COM) | No | No | No |
| MQTT/OPC-UA | Yes | Yes | Yes | OPC-DA | OPC-UA via DMS | OPC-UA via DMS | No |
| 21 CFR Part 11 | No | No | **Yes** | Yes | Yes | Yes | No |
| AI/ML anomaly | Yes | Yes | Yes | No | No | No | No |

---

## Go-to-Market Phasing

### Phase 1 -- Build Distribution (Now to 6 months)
- Ship free Community Edition (AGPL, GitHub + Docker Hub)
- Target: 500-1,000 downloads, 50+ production deployments, 100+ GitHub stars
- Revenue: $0 (investment)

### Phase 2 -- Hosted Cloud + Professional (6-12 months)
- Managed hosting, gate multi-plant/SSO/notifications behind Pro
- Target: 20-50 paying customers, $10K-$25K MRR

### Phase 3 -- Enterprise Sales (12-18 months)
- Community deployments generate enterprise inquiries ("we need e-signatures for our FDA audit")
- Validation documentation packages ($5K-$15K standalone)
- Target: 5-15 enterprise customers, $125K-$500K ARR

### Phase 4 -- Scale (18-24 months)
- Production references ("We passed our FDA audit on Cassini")
- Target: $1M+ ARR

---

## Manufacturing Buyer Context

### What Manufacturing Buyers Value (Ranked)
1. **Compliance and audit support** -- non-negotiable in regulated industries
2. **Integration with existing systems** -- OPC-UA, SCADA, MES, ERP
3. **Support and training** -- phone number, not Discord
4. **Total cost of ownership** -- implementation, training, validation, integration
5. **Price** -- 4th or 5th priority after the above

### Switching Costs Are Extremely High
- Historical data migration (years of samples, charts, capability studies)
- Re-validation under 21 CFR Part 11 or ISO 13485 costs $50K-$500K
- Operator training investment
- Integration re-work (SCADA, MES, ERP)
- Certification risk during FDA inspection windows

---

## Why "Race to Zero" Is Wrong for Vertical SPC

1. **Domain expertise is the only moat** -- SPC rules, FDA validation, manufacturing workflows cannot be replicated by a generalist LLM
2. **Value migrates up the stack, not to zero** -- domain-specific applications with unique distribution
3. **Workflow lock-in is the new moat** -- live OPC-UA streams, historical data, trained operators, FDA audit trails
4. **Regulated software requires validation** -- LLM-generated ad-hoc tools cannot be validated under GMP/GDP
5. **Competitors build faster too, but legacy burdens them** -- WinSPC/InfinityQS codebases are 15-25 years old (COM/OLE/DDE)

---

## Open-Core Benchmarks

| Company | Model | Revenue/Valuation | Gate |
|---------|-------|-------------------|------|
| GitLab | Buyer-Based Open Core | $759M revenue | Security/compliance in Ultimate |
| Grafana Labs | Open-core + cloud | $400M+ ARR | Cloud + enterprise features |
| HashiCorp | Open-core (BSL) | Acquired by IBM $6.4B | Infrastructure at scale |
| Supabase | Open-source + cloud | $70M ARR, $5B valuation | Pro features + scale limits |
| PostHog | Open-source + usage | $1.4B valuation | Usage tiers |
| Cal.com | Open-source (AGPL) | Growing | AGPL forces commercial license |

**Key pattern**: Gate compliance/enterprise/convenience behind paid tiers while keeping core genuinely free. Free tier drives adoption; compliance requirements drive revenue.

See also: [[Strategy/Competitive Analysis 2026]]
