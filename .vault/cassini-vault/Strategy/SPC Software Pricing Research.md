---
title: SPC Software Pricing Research
type: strategy
status: complete
date: 2026-03-07
tags:
  - pricing
  - competitive-analysis
  - market-research
  - strategy
---

# SPC Software Pricing Research

Research conducted March 2026 to inform Cassini commercial pricing strategy.

Related: [[Competitive Analysis]], [[Pricing Strategy]]

---

## 1. Competitor Pricing Table

| Vendor | Product | Model | Price Range | Free Tier | Notes |
|--------|---------|-------|-------------|-----------|-------|
| **Minitab** | Statistical Software | Annual subscription, per named user | **$2,394/yr** (~$200/mo) single user | No (free trial only) | Solution Center bundles range $2,394-$2,793/yr. Add-on modules $528/yr each. CDW reseller confirms ~$2,394. |
| **Minitab** | Real-Time SPC | Custom quote | Estimated **$3,000-5,000+/yr** per user | No | Separate product from Statistical Software; quote-based. Includes shop floor data collection. |
| **InfinityQS** | Enact (cloud) | Subscription, per user/mo | **$50-65/user/mo** ($600-780/yr) | No | Cloud SPC platform. Custom quotes for larger deployments. |
| **InfinityQS** | ProFicient (on-prem) | Perpetual + maintenance | Estimated **$15,000-50,000+** enterprise | No | On-prem enterprise SPC. Perpetual license + annual maintenance. Custom quote only. |
| **PQ Systems** | SQCpack | Subscription, per user | **$50/mo** (1 user) to **$500/mo** (100 users); Annual: **$500/yr** (1) to **$5,000/yr** (100) | No | Implementation $500-2,000 extra. Training $200-500/user. Now under Advantive. |
| **WinSPC** | WinSPC | Perpetual per seat | **$1,600/seat** one-time | No | 18% annual maintenance ($288/yr). Volume discounts at 6+, 20+, 50+, 75+ seats. Cloud/SaaS available on request. |
| **Hertzler/Prime Tech** | ProCalV5 | Subscription or perpetual | Subscription: **$179/mo**; Perpetual: **$3,000-5,000** one-time; Enterprise: **$5,000-15,000/yr** | No (free trial) | Calibration management, not pure SPC. Cloud (ProCalX) and on-prem options. |
| **QI Macros** | QI Macros (Excel add-in) | Perpetual, per license | **$379** (1 license), **$295-339** at volume | No (60-day refund) | No subscription. Volume: 2-9 @ $339, 10-24 @ $319, 25-49 @ $305, 50-99 @ $295, 100+ custom. Price match offered. |
| **BPI Consulting** | SPC for Excel | Perpetual, per user or site | **$269/user** one-time; **$5,900 site license** | Free version available | No subscription fees. No maintenance fees. Free technical support included. |
| **Predator Software** | Predator SPC | Perpetual or subscription | Perpetual: est. **$800-2,000**; Subscription: est. **$400-1,000/yr** | No | Pricing extrapolated from DNC/CNC tools ($575-$5,750 perpetual range). SPC-specific pricing not public. |
| **1Factory** | Manufacturing Quality (cloud) | Subscription, per user/mo | **$75/user/mo** (5 user min = $375/mo floor) | No (free trial) | QMS tier at $30/user/mo. Supplier Quality at $50/supplier/mo. Enterprise add-ons (eSig, SSO, API) priced separately. |
| **Zontec** | Synergy 100 (subscription) | Subscription, per user/mo | **$55/user/mo** ($605/yr) | No | Entry-level tier. No contracts. Max 3 users on this tier. |
| **Zontec** | Synergy 1000/2000/3000 | Custom quote | Estimated **$5,000-25,000+/yr** | No | Synergy 1000 for SMB, 2000 for enterprise, 3000 for global. Pricing on request. |
| **Prolink** | QC-CALC SPC | Perpetual per license | Estimated **$1,000-3,000** per license | Free Lite version | QC-CALC Real-Time LITE is free. Full pricing requires quote. Multi-copy discounts available. |

---

## 2. Common Pricing Patterns in the SPC Market

### Dominant Models

1. **Per-named-user subscription** (most common for cloud/modern tools)
   - Range: $30-200/user/month depending on feature depth
   - InfinityQS Enact, 1Factory, Zontec Synergy 100, PQ Systems all use this
   - Typically billed annually for discount

2. **Perpetual per-seat license + annual maintenance**  (legacy/on-prem)
   - One-time: $379 (QI Macros) to $1,600 (WinSPC)
   - Annual maintenance: 15-20% of license cost
   - WinSPC, QI Macros, SPC for Excel, Prolink QC-CALC

3. **Enterprise/site license** (large deployments)
   - $5,000-50,000+ depending on scope
   - InfinityQS ProFicient, Zontec Synergy 2000/3000
   - Usually includes implementation, training, custom integrations

4. **Tiered cloud pricing with minimums**
   - 1Factory requires 5-user minimum ($375/mo floor)
   - Zontec Synergy 100 caps at 3 users
   - Forces upsell to enterprise tiers for growth

### Pricing Dimensions

| Dimension | Who Uses It |
|-----------|-------------|
| Per named user | Most cloud vendors |
| Per concurrent seat | WinSPC, some on-prem |
| Per site/plant | SPC for Excel site license, enterprise deals |
| Per device/data source | Rare in SPC (more common in IoT platforms) |
| Per feature module | Minitab (add-on modules at $528/yr each) |

### Key Observations

- **Opacity is the norm.** Most enterprise SPC vendors hide pricing behind "contact sales." This is a competitive opportunity for transparent pricing.
- **No credible open-source competitor exists.** The closest are Excel add-ins and academic tools. No open-core SPC platform targets manufacturing.
- **Excel add-ins are the budget floor.** QI Macros ($379) and SPC for Excel ($269) are the cheapest options but lack real-time data collection, multi-user, and connectivity.
- **Cloud SPC starts at ~$50/user/month.** This is the market-established floor for "real" SPC software with data collection and charting.
- **Enterprise deals are $15K-50K+/year.** Multi-plant, regulated industry deployments with compliance features command premium pricing.

---

## 3. Price Anchors

### Floor (Budget Tier)
- **$269-379 one-time** for Excel add-ins (QI Macros, SPC for Excel)
- These are single-user, no real-time, no connectivity, no compliance
- Not true competitors to Cassini but set a psychological floor

### Mid-Market (SMB Manufacturing)
- **$50-75/user/month** for cloud SPC (InfinityQS Enact, 1Factory, Zontec)
- **$500-1,600 perpetual** per seat for on-prem (SQCpack, WinSPC)
- 10-user shop: ~$500-750/month or ~$6,000-9,000/year
- This is where most small-to-mid manufacturers land

### Ceiling (Enterprise)
- **$2,400/user/year** for Minitab Statistical Software
- **$15,000-50,000+/year** for InfinityQS ProFicient enterprise
- **$25,000+/year** for Zontec Synergy 3000 (global manufacturers)
- Large aerospace/auto companies pay $100K+ annually across tools

### Sweet Spot for Disruption
- **$25-49/user/month** for cloud with compliance features
- This undercuts InfinityQS/1Factory by 30-50% while delivering more value than Excel add-ins
- At $35/user/month, a 10-user deployment = $4,200/year -- significantly under the $6,000-9,000 mid-market range

---

## 4. Cassini Positioning Recommendations

### Community Edition (Free, AGPL)

**Price: $0** -- This is Cassini's primary differentiation.

No other SPC vendor offers a free, self-hostable product with:
- Full SPC engine (control charts, capability, Nelson rules, short-run)
- Dashboard with violations and annotations
- Audit trail
- Show Your Work (computation transparency)
- REST API
- MQTT connectivity (1 source)

**Strategic purpose:**
- Eliminate the "try before you buy" barrier entirely
- Capture hobbyist shops, startups, and quality engineers who evaluate at home
- Create a migration path: users hit Community limits, upgrade to Commercial
- Build community and ecosystem (AGPL ensures contributions flow back)

### Commercial License -- Recommended Pricing

#### Option A: Per-User Subscription (Recommended)

| Tier | Price | Includes |
|------|-------|----------|
| **Starter** | **$29/user/month** (billed annually = $348/yr) | Multi-plant (up to 3), unlimited data sources, MSA/Gage R&R, enterprise DB, email support |
| **Professional** | **$49/user/month** (billed annually = $588/yr) | Everything in Starter + FAI (AS9102), electronic signatures (21 CFR Part 11), anomaly detection, scheduled reporting, SSO/OIDC, priority support |
| **Enterprise** | **Custom pricing** (est. $69-99/user/mo or site license) | Everything in Pro + unlimited plants, data retention policies, dedicated support with SLA, custom integrations, on-prem deployment assistance |

**Minimum:** 3 users on Starter, 5 users on Professional

**Rationale:**
- **$29/mo Starter** undercuts InfinityQS Enact ($50-65) by 44-55% and 1Factory ($75) by 61%. It is low enough to be an impulse purchase for a quality manager with budget authority.
- **$49/mo Professional** with compliance features (eSig, FAI) still undercuts every competitor offering 21 CFR Part 11 compliance. InfinityQS and 1Factory charge extra for eSig as enterprise add-ons.
- **Enterprise custom** allows value-based pricing for large regulated manufacturers (aerospace, pharma, medical device) where compliance features justify premium pricing.

#### Option B: Per-Site/Plant License (Alternative)

| Tier | Price | Includes |
|------|-------|----------|
| **Single Plant** | **$299/month** (up to 25 users) | All commercial features for one plant |
| **Multi-Plant** | **$499/month per plant** (unlimited users) | All features, all plants, priority support |
| **Enterprise** | Custom | Global deployment, SLA, dedicated CSM |

**Rationale:** Per-site is simpler for manufacturers to budget. A $299/mo single-plant price is dramatically lower than any competitor's site license ($5,900 for SPC for Excel, $15K+ for enterprise tools).

#### Revenue Projections (Option A)

| Scenario | Users | Tier | Monthly | Annual |
|----------|-------|------|---------|--------|
| Small shop | 5 | Starter | $145 | $1,740 |
| Mid manufacturer | 15 | Professional | $735 | $8,820 |
| Enterprise plant | 50 | Professional | $2,450 | $29,400 |
| Multi-plant enterprise | 200 | Enterprise @$79 | $15,800 | $189,600 |

### Pricing Psychology

1. **Anchor against Minitab.** At $2,394/yr per user, Minitab is the most recognizable brand. Position Cassini Professional ($588/yr) as "75% less than Minitab with real-time SPC included."

2. **Free tier eliminates risk.** No other SPC vendor offers a genuinely useful free product. This removes the biggest barrier: "What if it doesn't work for us?"

3. **Transparent pricing on the website.** Most competitors hide pricing. Publishing clear prices builds trust and signals confidence. It also saves prospects from a sales gauntlet.

4. **Annual billing discount.** Offer monthly at a premium (e.g., $35/mo Starter monthly vs $29/mo billed annually) to incentivize annual commitments and reduce churn.

---

## 5. Differentiation Angles

### What Cassini Offers That No Competitor Does

| Differentiator | Cassini | Closest Competitor |
|---------------|---------|-------------------|
| **Free open-source core** | Full SPC engine, AGPL | Prolink QC-CALC Lite (very limited free version) |
| **Show Your Work** (computation transparency) | Every statistical value is click-to-explain with formula, steps, AIAG citation | No competitor offers this |
| **Modern tech stack** | React 19, FastAPI, async Python, REST API, MQTT native | Most competitors are legacy .NET/Java or proprietary |
| **Self-hostable** | SQLite to PostgreSQL/MSSQL, runs anywhere | 1Factory and Enact are cloud-only; on-prem tools are Windows-only |
| **API-first** | Full REST API included in free tier | Most competitors charge extra for API access or don't offer it |
| **Transparent pricing** | Published on website | InfinityQS, WinSPC, Zontec, Minitab Real-Time all require "contact sales" |

### Messaging by Audience

**Quality Engineers (individual evaluators):**
> "The only SPC platform you can install today for free. No sales calls. No credit card. Full control charts, capability analysis, and Nelson rules -- just download and go."

**Quality Managers (budget holders, 5-25 users):**
> "Enterprise SPC features at 50-75% less than InfinityQS or Minitab. Transparent pricing. No vendor lock-in -- your data stays in your database."

**Regulated Industries (aerospace, pharma, medical device):**
> "21 CFR Part 11 electronic signatures and AS9102 FAI built in, not bolted on. Every computation is auditable with Show Your Work. Start free, scale when ready."

**IT/Engineering Leadership:**
> "Open-source core means you can audit every line of code. REST API, MQTT, OPC-UA. Deploys on your infrastructure or ours. No proprietary black boxes."

---

## 6. Market Context

- **SPC software market size (2025):** ~$1-2.5 billion globally
- **Growth rate:** 8-12% CAGR through 2033
- **Manufacturing segment:** ~$1 billion (largest application segment)
- **Key drivers:** Industry 4.0, IoT integration, regulatory compliance, AI/ML adoption
- **Trend:** Migration from perpetual on-prem to cloud subscription -- but many manufacturers still want on-prem control

Cassini's open-core model uniquely straddles both worlds: free self-hosted for control-oriented shops, commercial cloud/managed for convenience-oriented buyers.

---

## Sources

- [Minitab Pricing Page](https://www.minitab.com/en-us/try-buy/)
- [Minitab on CDW ($2,394/yr)](https://www.cdw.com/product/minitab-statistical-software-subscription-license-1-year-1-user/7004719)
- [InfinityQS on SelectHub](https://www.selecthub.com/p/spc-software/infinityqs/)
- [InfinityQS Enact on G2](https://www.g2.com/products/infinityqs-enact/reviews)
- [SQCpack on ITQlick](https://www.itqlick.com/sqcpack/pricing)
- [SQCpack on Capterra](https://www.capterra.com/p/133531/SQCpack/pricing/)
- [WinSPC Pricing (DataNet)](https://www.winspc.com/tag/spc-software-cost/)
- [QI Macros Purchasing](https://www.qimacros.com/support/purchasing/)
- [SPC for Excel Ordering](https://www.spcforexcel.com/ordering-information/)
- [1Factory Pricing Page](https://www.1factory.com/pricing.html)
- [Zontec Synergy 100](https://zontec-spc.com/spc-software/synergy-100-subscription/)
- [ProCalV5 on GetApp](https://www.getapp.com/operations-management-software/a/procalv5/pricing/)
- [Predator Software Licensing](https://www.predator-software.com/predator_software_licensing.htm)
- [Prolink QC-CALC](https://www.prolinksoftware.com/specific.aspx?type=spc)
- [SPC Market Size (DataInsightsMarket)](https://www.datainsightsmarket.com/reports/spc-software-1962681)
- [SPC Market (Verified Market Reports)](https://www.verifiedmarketreports.com/product/statistical-process-control-software-market/)
