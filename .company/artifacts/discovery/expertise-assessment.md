# OpenSPC Project - Expertise Assessment

## Executive Summary

The OpenSPC project requires specialized domain knowledge beyond typical full-stack development. This is an event-driven Statistical Process Control system for hybrid manufacturing environments, with critical dependencies on SPC methodology, industrial protocols, and manufacturing standards. The current roster (git-flow, code-reviewer, test-architect) provides operational excellence but lacks domain-critical expertise.

---

## 1. Critical Domain Knowledge Needed

### A. Statistical Process Control (SPC) & Quality Engineering

**Expertise Required:**
- Nelson Rules implementation and validation (all 8 rules)
- Statistical calculations: sigma estimation using R-bar/d₂ or S/c₄ methods
- Control chart theory: X-Bar/I-MR chart mechanics, zone calculations
- Rolling window analysis and sample subgroup management
- Process capability analysis and control limit calculations

**Why Critical:**
The core engine (lines 195-244 of spec) requires precise mathematical implementation. Incorrect sigma calculation or Nelson Rule logic will produce false alarms or miss real violations, compromising manufacturing process safety and quality control.

**Impact on Project:**
- HIGH: Foundation for entire violation detection system
- Risk: Without this expertise, mathematical errors cascade through all downstream features
- Estimated 30-40% of backend complexity

---

### B. MQTT/Sparkplug B Protocol & Industrial IoT

**Expertise Required:**
- MQTT broker architecture and topic management
- Sparkplug B specification compliance (metrics, types, timestamps)
- UNS (Unified Namespace) architectural patterns
- Edge device communication protocols
- Protocol buffer serialization
- Real-time data ingestion patterns and buffering strategies

**Why Critical:**
The data provider abstraction depends on robust MQTT integration (Tag Provider). Incorrect Sparkplug B payload formatting will break integration with manufacturing equipment. The system must handle high-frequency automated tag data reliably.

**Impact on Project:**
- HIGH: Required for automated data ingestion path
- Risk: Manufacturing downtime if MQTT integration fails
- Estimated 25-30% of backend complexity
- Affects database schema design (buffering, subgroup management)

---

### C. Manufacturing Standards: ISA-95 & Related

**Expertise Required:**
- ISA-95 hierarchy (Site → Area → Line → Cell → Unit)
- Equipment naming conventions and batch tracking
- Manufacturing workflow constraints (batch numbers, operator context)
- Factory floor operational semantics
- Regulatory compliance context (FDA/IATF for automotive/pharma)

**Why Critical:**
The database schema (lines 85-91 of spec) requires proper ISA-95 implementation. The violation acknowledgment workflow (batch_number, operator_id, ack_reason) reflects real manufacturing processes. Misunderstanding factory context leads to schema changes mid-project and poor UX for operators.

**Impact on Project:**
- MEDIUM-HIGH: Required for schema correctness and field validation
- Risk: Poor schema requires refactoring; UX alienates operators unfamiliar with SPC terminology
- Estimated 15-20% of project friction

---

## 2. Skill Gap Analysis

### Current Roster Gaps

| Role | Strength | Gap |
|------|----------|-----|
| **git-flow** | Workflow/branching | No domain knowledge |
| **code-reviewer** | Code quality | Cannot validate statistical math or manufacturing logic |
| **test-architect** | Test strategy | Cannot write meaningful SPC validation tests |

### Why Generic Expertise Isn't Enough

- A code reviewer cannot validate that sigma calculation uses R-bar/d₂ correctly
- A test architect cannot verify Nelson Rule detection thresholds without SPC knowledge
- Git workflows don't help when architecture decisions require manufacturing domain context

---

## 3. Recommended Specialist Roles

### Role 1: SPC/Quality Engineering Domain Expert

**Title:** Statistical Process Control Specialist

**Key Expertise Areas:**
- Manufacturing quality control methodology
- Statistical theory (normality assumptions, distribution analysis)
- Nelson Rules implementation and validation
- Control chart interpretation and troubleshooting
- Process capability studies (Cpk, Pp calculations)
- Historical knowledge of SPC tool implementations

**Responsibilities:**
- Validate Nelson Rules logic and sigma calculation methods
- Define test cases for statistical correctness
- Review violation threshold configurations
- Advise on control limit auto-calculation algorithms
- Guide UX design for operator interpretation of charts

**Estimated Effort:**
- Architecture/design phase: 2-3 weeks (intensive)
- Implementation review: 15-20% of development duration
- Testing and validation: 2-3 weeks

**Why Essential:**
Without this expert, the statistical engine is a black box. Minor bugs in zone calculations or rule detection could cause manufacturing incidents or false alarms that erode operator trust.

---

### Role 2: Industrial IoT & MQTT Protocol Engineer

**Title:** IIoT/MQTT Architecture Specialist

**Key Expertise Areas:**
- MQTT broker setup and scaling
- Sparkplug B payload design and validation
- UNS reference architecture
- Edge computing and buffering strategies
- Real-time data pipeline design
- Industrial networking (latency, reliability, security)

**Responsibilities:**
- Design MQTT topic hierarchy and naming scheme
- Validate Sparkplug B payload compliance
- Implement tag provider with proper buffering for subgroup samples
- Advise on data retention and caching strategies
- Integration testing with simulated/real manufacturing equipment

**Estimated Effort:**
- Architecture/design phase: 2-3 weeks
- Implementation: 25-30% of backend development
- Testing: 2 weeks (load testing, edge cases)

**Why Essential:**
Incorrect MQTT integration means automated data ingestion fails. This is the primary data source for high-frequency manufacturing measurements. Operator data entry alone doesn't provide sufficient insight into process trends.

---

### Role 3: Manufacturing Systems & ISA-95 Architect

**Title:** Manufacturing IT/Operations Technology (OT) Specialist

**Key Expertise Areas:**
- ISA-95 hierarchy and enterprise integration patterns
- Manufacturing execution systems (MES) concepts
- Batch tracking and genealogy
- Operator workflows and factory floor context
- Regulatory requirements (pharma/automotive/food)
- Equipment naming standards and master data

**Responsibilities:**
- Design and validate ISA-95 schema
- Define operator roles and violation acknowledgment workflows
- Establish master data requirements (operator codes, batch formats)
- Advise on audit trail and traceability requirements
- Guide UI/UX for manufacturing operators (not software developers)

**Estimated Effort:**
- Requirements/design: 1-2 weeks
- Schema validation: 10-15% of backend development
- User testing: 2 weeks (factory floor observations)

**Why Essential:**
The system sits between engineers (who understand SPC) and operators (who understand machines). A manufacturing OT specialist bridges this gap. Poor ISA-95 implementation or user experience alienates end users and undermines adoption.

---

## 4. Recommended Onboarding Sequence

### Phase 1: Architecture (Weeks 1-2)
Bring in **SPC Specialist** and **Manufacturing OT Specialist** first:
- Review specification and validate interpretations
- Define test cases and acceptance criteria
- Establish schema validation checkpoints

### Phase 2: Design & Prototyping (Weeks 3-4)
Add **IIoT/MQTT Specialist**:
- MQTT topic design and Sparkplug B validation
- Provider abstraction finalization
- Data pipeline architecture

### Phase 3: Implementation
All three specialists provide concurrent review:
- Statistical engine validation (SPC specialist)
- MQTT integration testing (IIoT specialist)
- Schema correctness and UX validation (Manufacturing specialist)

---

## 5. Risk Mitigation

### Without These Specialists
- **Statistical Errors:** Undetected bugs in Nelson Rules lead to false positives or missed violations
- **Integration Failures:** MQTT misconfiguration causes data loss or latency issues
- **User Rejection:** Misaligned UX and schema design result in low adoption
- **Regulatory Risk:** ISA-95 non-compliance or poor audit trails create compliance issues
- **Rework Costs:** Late-stage discoveries require schema changes and significant refactoring

### With Specialists Onboarded Early
- Clear test acceptance criteria reduce rework
- Early validation prevents architectural blind spots
- Manufacturing context improves UX design decisions
- Regulatory compliance built-in from the start
- Reduced debugging time due to expert-validated implementations

---

## 6. Integration with Existing Roster

### Complementary Roles

**SPC Specialist** + **Code Reviewer:**
- Code reviewer validates code quality; SPC specialist validates statistical correctness
- Together: Ensure both implementation quality and domain accuracy

**IIoT Specialist** + **Test Architect:**
- IIoT specialist defines edge cases and integration scenarios
- Test architect designs comprehensive test coverage
- Together: Build robust MQTT integration tests

**Manufacturing Specialist** + **Tech Lead:**
- Manufacturing specialist defines requirements from factory floor perspective
- Tech lead breaks requirements into technical tasks
- Together: Ensure requirements don't miss operational constraints

---

## 7. Success Criteria for Specialist Contributions

### SPC Specialist
- [ ] All 8 Nelson Rules validated against published specifications
- [ ] Sigma calculation methods documented and tested
- [ ] Control chart zone calculations verified with reference data
- [ ] Statistical test cases achieve 95%+ code coverage for engine module

### IIoT/MQTT Specialist
- [ ] Sparkplug B payloads validated against specification v3.0
- [ ] MQTT topic hierarchy documented and reviewed
- [ ] Tag provider implementation stress-tested with simulated high-frequency data
- [ ] Payload serialization/deserialization verified end-to-end

### Manufacturing Systems Specialist
- [ ] ISA-95 schema reviewed by manufacturing engineer on customer site
- [ ] Operator workflows validated against real factory floor scenarios
- [ ] Batch tracking and traceability requirements implemented
- [ ] UI prototype tested with manufacturing operators (not just developers)

---

## Conclusion

The OpenSPC project requires three critical specialist roles:
1. **SPC/Quality Engineering Expert** - Foundation for statistical correctness
2. **Industrial IoT/MQTT Specialist** - Enable automated data ingestion
3. **Manufacturing Systems Architect** - Ensure operational fit and compliance

These roles are not nice-to-have; they are essential for project success. The domain complexity justifies bringing in specialists early to prevent costly rework and ensure the system meets real manufacturing needs.

**Recommended Action:** Initiate recruitment for all three roles before commencing detailed implementation (Weeks 3-4 of project timeline).
