# OpenSPC Sequence Diagrams

## Document Information
- **Project:** OpenSPC - Event-Driven Statistical Process Control System
- **Author:** Solutions Architect, Virtual Engineering Co.
- **Date:** 2026-02-02
- **Status:** Design Complete

---

## 1. Manual Sample Submission Flow

This sequence shows the complete flow when an operator submits a manual sample through the UI.

```
┌─────────┐     ┌──────────┐     ┌───────────┐     ┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│   UI    │     │  REST    │     │  Manual   │     │   SPC   │     │   Rolling    │     │   Nelson    │     │    Alert     │
│(React)  │     │   API    │     │ Provider  │     │ Engine  │     │   Window     │     │   Rules     │     │   Manager    │
└────┬────┘     └────┬─────┘     └─────┬─────┘     └────┬────┘     └──────┬───────┘     └──────┬──────┘     └──────┬───────┘
     │               │                 │                │                  │                   │                   │
     │ POST /api/v1/samples            │                │                  │                   │                   │
     │ {char_id, measurements, ctx}    │                │                  │                   │                   │
     │──────────────>│                 │                │                  │                   │                   │
     │               │                 │                │                  │                   │                   │
     │               │ validate request│                │                  │                   │                   │
     │               │────────┐        │                │                  │                   │                   │
     │               │        │        │                │                  │                   │                   │
     │               │<───────┘        │                │                  │                   │                   │
     │               │                 │                │                  │                   │                   │
     │               │ submit_sample() │                │                  │                   │                   │
     │               │────────────────>│                │                  │                   │                   │
     │               │                 │                │                  │                   │                   │
     │               │                 │ create SampleEvent               │                   │                   │
     │               │                 │────────┐       │                  │                   │                   │
     │               │                 │        │       │                  │                   │                   │
     │               │                 │<───────┘       │                  │                   │                   │
     │               │                 │                │                  │                   │                   │
     │               │                 │ process_sample(event)            │                   │                   │
     │               │                 │───────────────>│                  │                   │                   │
     │               │                 │                │                  │                   │                   │
     │               │                 │                │ get characteristic config           │                   │
     │               │                 │                │──────┐           │                   │                   │
     │               │                 │                │      │           │                   │                   │
     │               │                 │                │<─────┘           │                   │                   │
     │               │                 │                │                  │                   │                   │
     │               │                 │                │ persist sample to DB                │                   │
     │               │                 │                │──────┐           │                   │                   │
     │               │                 │                │      │           │                   │                   │
     │               │                 │                │<─────┘           │                   │                   │
     │               │                 │                │                  │                   │                   │
     │               │                 │                │ get_window(char_id)                 │                   │
     │               │                 │                │─────────────────>│                   │                   │
     │               │                 │                │                  │                   │                   │
     │               │                 │                │                  │ check cache       │                   │
     │               │                 │                │                  │───────┐           │                   │
     │               │                 │                │                  │       │ (hit)     │                   │
     │               │                 │                │                  │<──────┘           │                   │
     │               │                 │                │                  │                   │                   │
     │               │                 │                │     RollingWindow│                   │                   │
     │               │                 │                │<─────────────────│                   │                   │
     │               │                 │                │                  │                   │                   │
     │               │                 │                │ append_sample(window, sample)       │                   │
     │               │                 │                │─────────────────>│                   │                   │
     │               │                 │                │                  │                   │                   │
     │               │                 │                │                  │ update window     │                   │
     │               │                 │                │                  │───────┐           │                   │
     │               │                 │                │                  │       │           │                   │
     │               │                 │                │                  │<──────┘           │                   │
     │               │                 │                │                  │                   │                   │
     │               │                 │                │ evaluate(window, enabled_rules)     │                   │
     │               │                 │                │──────────────────────────────────────>│                   │
     │               │                 │                │                  │                   │                   │
     │               │                 │                │                  │                   │ check Rule 1      │
     │               │                 │                │                  │                   │───────┐           │
     │               │                 │                │                  │                   │       │           │
     │               │                 │                │                  │                   │<──────┘           │
     │               │                 │                │                  │                   │                   │
     │               │                 │                │                  │                   │ check Rule 2...8  │
     │               │                 │                │                  │                   │───────┐           │
     │               │                 │                │                  │                   │       │           │
     │               │                 │                │                  │                   │<──────┘           │
     │               │                 │                │                  │                   │                   │
     │               │                 │                │     [Violations] │                   │                   │
     │               │                 │                │<──────────────────────────────────────│                   │
     │               │                 │                │                  │                   │                   │
     │               │                 │                │                  │                   │                   │
     │               │                 │                │    ╔════════════════════════════════════════════╗        │
     │               │                 │                │    ║ alt [violations.length > 0]                ║        │
     │               │                 │                │    ╠════════════════════════════════════════════╣        │
     │               │                 │                │    ║                               │            ║        │
     │               │                 │                │ create_violations(sample_id, violations)       ║        │
     │               │                 │                │───────────────────────────────────────────────────────────>│
     │               │                 │                │                  │                   │            ║      │
     │               │                 │                │                  │                   │            ║      │ persist violations
     │               │                 │                │                  │                   │            ║      │───────┐
     │               │                 │                │                  │                   │            ║      │       │
     │               │                 │                │                  │                   │            ║      │<──────┘
     │               │                 │                │                  │                   │            ║      │
     │               │                 │                │                  │                   │            ║      │ broadcast via WebSocket
     │               │                 │                │                  │                   │            ║      │───────┐
     │               │                 │                │                  │                   │            ║      │       │
     │               │                 │                │                  │                   │            ║      │<──────┘
     │               │                 │                │                  │                   │            ║      │
     │               │                 │                │     [Created Violations]             │            ║      │
     │               │                 │                │<──────────────────────────────────────────────────────────│
     │               │                 │                │    ╚════════════════════════════════════════════╝        │
     │               │                 │                │                  │                   │                   │
     │               │                 │                │ update sample.in_control            │                   │
     │               │                 │                │──────┐           │                   │                   │
     │               │                 │                │      │           │                   │                   │
     │               │                 │                │<─────┘           │                   │                   │
     │               │                 │                │                  │                   │                   │
     │               │                 │  ProcessingResult                 │                   │                   │
     │               │                 │<───────────────│                  │                   │                   │
     │               │                 │                │                  │                   │                   │
     │               │  SampleResponse │                │                  │                   │                   │
     │               │<────────────────│                │                  │                   │                   │
     │               │                 │                │                  │                   │                   │
     │ 201 Created   │                 │                │                  │                   │                   │
     │ {sample, violations}            │                │                  │                   │                   │
     │<──────────────│                 │                │                  │                   │                   │
     │               │                 │                │                  │                   │                   │
     │               │                 │                │                  │                   │                   │
┌────┴────┐     ┌────┴─────┐     ┌─────┴─────┐     ┌────┴────┐     ┌──────┴───────┐     ┌──────┴──────┐     ┌──────┴───────┐
│   UI    │     │  REST    │     │  Manual   │     │   SPC   │     │   Rolling    │     │   Nelson    │     │    Alert     │
│(React)  │     │   API    │     │ Provider  │     │ Engine  │     │   Window     │     │   Rules     │     │   Manager    │
└─────────┘     └──────────┘     └───────────┘     └─────────┘     └──────────────┘     └─────────────┘     └──────────────┘
```

---

## 2. MQTT Tag Arrival Flow

This sequence shows processing of automated tag data from MQTT through to sample creation.

```
┌──────────┐     ┌──────────┐     ┌───────────┐     ┌──────────┐     ┌─────────┐     ┌──────────────┐
│   MQTT   │     │  MQTT    │     │    Tag    │     │ Subgroup │     │   SPC   │     │    Alert     │
│  Broker  │     │  Client  │     │ Provider  │     │  Buffer  │     │ Engine  │     │   Manager    │
└────┬─────┘     └────┬─────┘     └─────┬─────┘     └────┬─────┘     └────┬────┘     └──────┬───────┘
     │                │                 │                │                │                  │
     │ PUBLISH        │                 │                │                │                  │
     │ topic: spc/Raleigh/BottlingA/Filler/Vol          │                │                  │
     │ payload: {value: 354.8}         │                │                │                  │
     │───────────────>│                 │                │                │                  │
     │                │                 │                │                │                  │
     │                │ on_message()    │                │                │                  │
     │                │────────────────>│                │                │                  │
     │                │                 │                │                │                  │
     │                │                 │ decode Sparkplug B payload      │                  │
     │                │                 │───────┐        │                │                  │
     │                │                 │       │        │                │                  │
     │                │                 │<──────┘        │                │                  │
     │                │                 │                │                │                  │
     │                │                 │ lookup char by topic            │                  │
     │                │                 │───────┐        │                │                  │
     │                │                 │       │        │                │                  │
     │                │                 │<──────┘        │                │                  │
     │                │                 │ char_id=2, subgroup_size=5     │                  │
     │                │                 │                │                │                  │
     │                │                 │ add_value(354.8)               │                  │
     │                │                 │───────────────>│                │                  │
     │                │                 │                │                │                  │
     │                │                 │                │ buffer.append()│                  │
     │                │                 │                │───────┐        │                  │
     │                │                 │                │       │        │                  │
     │                │                 │                │<──────┘        │                  │
     │                │                 │                │                │                  │
     │                │                 │                │ is_complete()? │                  │
     │                │                 │                │───────┐        │                  │
     │                │                 │                │       │ NO (4/5 values)          │
     │                │                 │                │<──────┘        │                  │
     │                │                 │                │                │                  │
     │                │                 │     false      │                │                  │
     │                │                 │<───────────────│                │                  │
     │                │                 │                │                │                  │
     │                │     (wait)      │                │                │                  │
     │                │<────────────────│                │                │                  │
     │                │                 │                │                │                  │
     │                │                 │                │                │                  │
     │ ... 4 more PUBLISH messages ...  │                │                │                  │
     │                │                 │                │                │                  │
     │ PUBLISH        │                 │                │                │                  │
     │ topic: spc/Raleigh/BottlingA/Filler/Vol          │                │                  │
     │ payload: {value: 355.3}         │                │                │                  │
     │───────────────>│                 │                │                │                  │
     │                │                 │                │                │                  │
     │                │ on_message()    │                │                │                  │
     │                │────────────────>│                │                │                  │
     │                │                 │                │                │                  │
     │                │                 │ add_value(355.3)               │                  │
     │                │                 │───────────────>│                │                  │
     │                │                 │                │                │                  │
     │                │                 │                │ buffer.append()│                  │
     │                │                 │                │───────┐        │                  │
     │                │                 │                │       │        │                  │
     │                │                 │                │<──────┘        │                  │
     │                │                 │                │                │                  │
     │                │                 │                │ is_complete()? │                  │
     │                │                 │                │───────┐        │                  │
     │                │                 │                │       │ YES (5/5 values)         │
     │                │                 │                │<──────┘        │                  │
     │                │                 │                │                │                  │
     │                │                 │     true       │                │                  │
     │                │                 │<───────────────│                │                  │
     │                │                 │                │                │                  │
     │                │                 │ flush()        │                │                  │
     │                │                 │───────────────>│                │                  │
     │                │                 │                │                │                  │
     │                │                 │   [354.8, 355.1, 354.9, 355.0, 355.3]             │
     │                │                 │<───────────────│                │                  │
     │                │                 │                │                │                  │
     │                │                 │ create SampleEvent              │                  │
     │                │                 │───────┐        │                │                  │
     │                │                 │       │ measurements=[354.8, ...]                 │
     │                │                 │<──────┘        │                │                  │
     │                │                 │                │                │                  │
     │                │                 │ invoke callback (process_sample)│                  │
     │                │                 │────────────────────────────────>│                  │
     │                │                 │                │                │                  │
     │                │                 │                │                │ [same as manual flow]
     │                │                 │                │                │──────────────────>│
     │                │                 │                │                │                  │
     │                │                 │                │                │  ProcessingResult│
     │                │                 │<────────────────────────────────│                  │
     │                │                 │                │                │                  │
     │                │                 │                │                │                  │
     │                │                 │   ╔═══════════════════════════════════════════╗   │
     │                │                 │   ║ alt [violations detected]                 ║   │
     │                │                 │   ╠═══════════════════════════════════════════╣   │
     │                │                 │   ║                                           ║   │
     │                │                 │   ║ publish SPC event to MQTT                 ║   │
     │                │                 │   ║───────────────────────────────────────────>║   │
     │                │                 │   ║                                           ║   │
     │                │                 │   ║                             PUBLISH       ║   │
     │                │                 │   ║                             spc/violations/...
     │                │                 │   ║                                           ║   │
     │<────────────────────────────────────────────────────────────────────────────────────│
     │                │                 │   ║                                           ║   │
     │                │                 │   ╚═══════════════════════════════════════════╝   │
     │                │                 │                │                │                  │
     │                │     ack         │                │                │                  │
     │                │<────────────────│                │                │                  │
     │                │                 │                │                │                  │
┌────┴─────┐     ┌────┴─────┐     ┌─────┴─────┐     ┌────┴─────┐     ┌────┴────┐     ┌──────┴───────┐
│   MQTT   │     │  MQTT    │     │    Tag    │     │ Subgroup │     │   SPC   │     │    Alert     │
│  Broker  │     │  Client  │     │ Provider  │     │  Buffer  │     │ Engine  │     │   Manager    │
└──────────┘     └──────────┘     └───────────┘     └──────────┘     └─────────┘     └──────────────┘
```

---

## 3. Violation Acknowledgment Workflow

This sequence shows the complete acknowledgment workflow with real-time UI updates.

```
┌─────────┐     ┌──────────┐     ┌─────────────┐     ┌───────────┐     ┌──────────────┐     ┌─────────┐
│   UI    │     │  REST    │     │    Alert    │     │ Violation │     │  WebSocket   │     │ Other   │
│(Operator)│    │   API    │     │   Manager   │     │   Repo    │     │  Broadcast   │     │ Clients │
└────┬────┘     └────┬─────┘     └──────┬──────┘     └─────┬─────┘     └──────┬───────┘     └────┬────┘
     │               │                  │                  │                  │                  │
     │ Click violation on chart         │                  │                  │                  │
     │───────┐       │                  │                  │                  │                  │
     │       │       │                  │                  │                  │                  │
     │<──────┘       │                  │                  │                  │                  │
     │               │                  │                  │                  │                  │
     │ Open Ack Modal│                  │                  │                  │                  │
     │───────┐       │                  │                  │                  │                  │
     │       │       │                  │                  │                  │                  │
     │<──────┘       │                  │                  │                  │                  │
     │               │                  │                  │                  │                  │
     │ GET /api/v1/violations/{id}     │                  │                  │                  │
     │──────────────>│                  │                  │                  │                  │
     │               │                  │                  │                  │                  │
     │               │ get_by_id()      │                  │                  │                  │
     │               │─────────────────────────────────────>│                  │                  │
     │               │                  │                  │                  │                  │
     │               │                  │  ViolationResponse                  │                  │
     │               │<─────────────────────────────────────│                  │                  │
     │               │                  │                  │                  │                  │
     │ 200 OK        │                  │                  │                  │                  │
     │ {violation details}              │                  │                  │                  │
     │<──────────────│                  │                  │                  │                  │
     │               │                  │                  │                  │                  │
     │ Display violation details        │                  │                  │                  │
     │───────┐       │                  │                  │                  │                  │
     │       │       │                  │                  │                  │                  │
     │<──────┘       │                  │                  │                  │                  │
     │               │                  │                  │                  │                  │
     │ Select reason: "RAW_MATERIAL"   │                  │                  │                  │
     │ Enter user: "J.Smith"           │                  │                  │                  │
     │ Click "Acknowledge"             │                  │                  │                  │
     │               │                  │                  │                  │                  │
     │ POST /api/v1/violations/{id}/acknowledge           │                  │                  │
     │ {user: "J.Smith", reason: "RAW_MATERIAL"}          │                  │                  │
     │──────────────>│                  │                  │                  │                  │
     │               │                  │                  │                  │                  │
     │               │ acknowledge(id, user, reason)      │                  │                  │
     │               │─────────────────>│                  │                  │                  │
     │               │                  │                  │                  │                  │
     │               │                  │ validate violation exists         │                  │
     │               │                  │─────────────────>│                  │                  │
     │               │                  │                  │                  │                  │
     │               │                  │    violation     │                  │                  │
     │               │                  │<─────────────────│                  │                  │
     │               │                  │                  │                  │                  │
     │               │                  │                  │                  │                  │
     │               │                  │    ╔═════════════════════════════════════════════╗    │
     │               │                  │    ║ alt [already acknowledged]                  ║    │
     │               │                  │    ╠═════════════════════════════════════════════╣    │
     │               │                  │    ║                                             ║    │
     │               │ 409 Conflict     │    ║                                             ║    │
     │               │ "Already ack'd"  │    ║                                             ║    │
     │               │<─────────────────│    ║                                             ║    │
     │               │                  │    ╚═════════════════════════════════════════════╝    │
     │               │                  │                  │                  │                  │
     │               │                  │ update violation │                  │                  │
     │               │                  │ set acknowledged=true              │                  │
     │               │                  │ set ack_user, ack_reason           │                  │
     │               │                  │ set ack_timestamp                  │                  │
     │               │                  │─────────────────>│                  │                  │
     │               │                  │                  │                  │                  │
     │               │                  │                  │ UPDATE violation │                  │
     │               │                  │                  │───────┐          │                  │
     │               │                  │                  │       │          │                  │
     │               │                  │                  │<──────┘          │                  │
     │               │                  │                  │                  │                  │
     │               │                  │  updated violation                 │                  │
     │               │                  │<─────────────────│                  │                  │
     │               │                  │                  │                  │                  │
     │               │                  │ write audit log  │                  │                  │
     │               │                  │─────────────────>│                  │                  │
     │               │                  │                  │                  │                  │
     │               │                  │ broadcast ack_update              │                  │
     │               │                  │─────────────────────────────────────>│                  │
     │               │                  │                  │                  │                  │
     │               │                  │                  │                  │ {type: "ack_update",
     │               │                  │                  │                  │  violation_id: 50,
     │               │                  │                  │                  │  acknowledged: true,
     │               │                  │                  │                  │  ack_user: "J.Smith"}
     │               │                  │                  │                  │─────────────────>│
     │               │                  │                  │                  │                  │
     │               │                  │                  │                  │                  │ Update UI
     │               │                  │                  │                  │                  │───────┐
     │               │                  │                  │                  │                  │       │
     │               │                  │                  │                  │                  │<──────┘
     │               │                  │                  │                  │                  │
     │               │  ViolationResponse                 │                  │                  │
     │               │<─────────────────│                  │                  │                  │
     │               │                  │                  │                  │                  │
     │ 200 OK        │                  │                  │                  │                  │
     │ {id, acknowledged: true, ...}   │                  │                  │                  │
     │<──────────────│                  │                  │                  │                  │
     │               │                  │                  │                  │                  │
     │ Close modal   │                  │                  │                  │                  │
     │ Update chart (remove pulse)     │                  │                  │                  │
     │───────┐       │                  │                  │                  │                  │
     │       │       │                  │                  │                  │                  │
     │<──────┘       │                  │                  │                  │                  │
     │               │                  │                  │                  │                  │
┌────┴────┐     ┌────┴─────┐     ┌──────┴──────┐     ┌─────┴─────┐     ┌──────┴───────┐     ┌────┴────┐
│   UI    │     │  REST    │     │    Alert    │     │ Violation │     │  WebSocket   │     │ Other   │
│(Operator)│    │   API    │     │   Manager   │     │   Repo    │     │  Broadcast   │     │ Clients │
└─────────┘     └──────────┘     └─────────────┘     └───────────┘     └──────────────┘     └─────────┘
```

---

## 4. Control Limit Recalculation Flow

This sequence shows the recalculation of control limits from historical data.

```
┌─────────┐     ┌──────────┐     ┌───────────────┐     ┌───────────┐     ┌──────────────┐     ┌──────────┐
│   UI    │     │  REST    │     │ Characteristic│     │  Sample   │     │  Statistics  │     │  Rolling │
│(Engineer)│    │   API    │     │    Service    │     │   Repo    │     │   Module     │     │  Window  │
└────┬────┘     └────┬─────┘     └───────┬───────┘     └─────┬─────┘     └──────┬───────┘     └────┬─────┘
     │               │                   │                   │                  │                  │
     │ Open Characteristic Config        │                   │                  │                  │
     │ View current UCL/LCL             │                   │                  │                  │
     │               │                   │                   │                  │                  │
     │ Click "Recalculate Limits"       │                   │                  │                  │
     │               │                   │                   │                  │                  │
     │ POST /api/v1/characteristics/{id}/recalculate-limits│                  │                  │
     │ {sample_count: 25, exclude_out_of_control: true}    │                  │                  │
     │──────────────>│                   │                   │                  │                  │
     │               │                   │                   │                  │                  │
     │               │ recalculate_limits(id, options)      │                  │                  │
     │               │──────────────────>│                   │                  │                  │
     │               │                   │                   │                  │                  │
     │               │                   │ get characteristic│                  │                  │
     │               │                   │──────┐            │                  │                  │
     │               │                   │      │            │                  │                  │
     │               │                   │<─────┘            │                  │                  │
     │               │                   │ subgroup_size=1   │                  │                  │
     │               │                   │                   │                  │                  │
     │               │                   │ get_samples_for_calculation        │                  │
     │               │                   │ (exclude violations if requested)  │                  │
     │               │                   │──────────────────>│                  │                  │
     │               │                   │                   │                  │                  │
     │               │                   │                   │ SELECT samples  │                  │
     │               │                   │                   │ WHERE in_control=1                 │
     │               │                   │                   │ ORDER BY timestamp DESC            │
     │               │                   │                   │ LIMIT 25         │                  │
     │               │                   │                   │───────┐          │                  │
     │               │                   │                   │       │          │                  │
     │               │                   │                   │<──────┘          │                  │
     │               │                   │                   │                  │                  │
     │               │                   │    [25 samples]   │                  │                  │
     │               │                   │<──────────────────│                  │                  │
     │               │                   │                   │                  │                  │
     │               │                   │                   │                  │                  │
     │               │                   │    ╔═══════════════════════════════════════════════╗   │
     │               │                   │    ║ alt [subgroup_size == 1]                      ║   │
     │               │                   │    ╠═══════════════════════════════════════════════╣   │
     │               │                   │    ║                                               ║   │
     │               │                   │ calculate_imr_limits(samples)                     ║   │
     │               │                   │────────────────────────────────────────────────────>║   │
     │               │                   │    ║                                               ║   │
     │               │                   │    ║ extract values [7.3, 7.2, 7.4, ...]          ║   │
     │               │                   │    ║───────┐                                       ║   │
     │               │                   │    ║       │                                       ║   │
     │               │                   │    ║<──────┘                                       ║   │
     │               │                   │    ║                                               ║   │
     │               │                   │    ║ calculate moving ranges                       ║   │
     │               │                   │    ║ MR_i = |x_i - x_{i-1}|                        ║   │
     │               │                   │    ║───────┐                                       ║   │
     │               │                   │    ║       │                                       ║   │
     │               │                   │    ║<──────┘                                       ║   │
     │               │                   │    ║                                               ║   │
     │               │                   │    ║ X-bar = mean(values) = 7.30                  ║   │
     │               │                   │    ║ MR-bar = mean(MR) = 0.094                    ║   │
     │               │                   │    ║ sigma = MR-bar / d2 = 0.094 / 1.128 = 0.083  ║   │
     │               │                   │    ║                                               ║   │
     │               │                   │    ║ UCL = X-bar + 3*sigma = 7.55                 ║   │
     │               │                   │    ║ LCL = X-bar - 3*sigma = 7.05                 ║   │
     │               │                   │    ║───────┐                                       ║   │
     │               │                   │    ║       │                                       ║   │
     │               │                   │    ║<──────┘                                       ║   │
     │               │                   │    ╚═══════════════════════════════════════════════╝   │
     │               │                   │    ╔═══════════════════════════════════════════════╗   │
     │               │                   │    ║ alt [subgroup_size > 1 && <= 10]              ║   │
     │               │                   │    ╠═══════════════════════════════════════════════╣   │
     │               │                   │    ║ calculate_xbar_r_limits(samples)              ║   │
     │               │                   │    ║ Use R-bar / d2 method                         ║   │
     │               │                   │    ╚═══════════════════════════════════════════════╝   │
     │               │                   │    ╔═══════════════════════════════════════════════╗   │
     │               │                   │    ║ alt [subgroup_size > 10]                      ║   │
     │               │                   │    ╠═══════════════════════════════════════════════╣   │
     │               │                   │    ║ calculate_xbar_s_limits(samples)              ║   │
     │               │                   │    ║ Use S-bar / c4 method                         ║   │
     │               │                   │    ╚═══════════════════════════════════════════════╝   │
     │               │                   │                   │                  │                  │
     │               │                   │    {ucl, lcl, center_line, sigma, method}             │
     │               │                   │<──────────────────────────────────────│                  │
     │               │                   │                   │                  │                  │
     │               │                   │ update characteristic                │                  │
     │               │                   │ set ucl, lcl, center_line, sigma    │                  │
     │               │                   │ set limit_calc_method, limit_calc_at│                  │
     │               │                   │──────┐            │                  │                  │
     │               │                   │      │            │                  │                  │
     │               │                   │<─────┘            │                  │                  │
     │               │                   │                   │                  │                  │
     │               │                   │ invalidate rolling window cache     │                  │
     │               │                   │─────────────────────────────────────────────────────────>│
     │               │                   │                   │                  │                  │
     │               │                   │                   │                  │                  │ recalculate
     │               │                   │                   │                  │                  │ zone boundaries
     │               │                   │                   │                  │                  │───────┐
     │               │                   │                   │                  │                  │       │
     │               │                   │                   │                  │                  │<──────┘
     │               │                   │                   │                  │                  │
     │               │                   │ broadcast control_limits update     │                  │
     │               │                   │──────┐            │                  │                  │
     │               │                   │      │ (via WebSocket)              │                  │
     │               │                   │<─────┘            │                  │                  │
     │               │                   │                   │                  │                  │
     │               │  RecalculateResponse                 │                  │                  │
     │               │  {prev_ucl, prev_lcl, new_ucl, new_lcl, ...}            │                  │
     │               │<──────────────────│                   │                  │                  │
     │               │                   │                   │                  │                  │
     │ 200 OK        │                   │                   │                  │                  │
     │ {previous/new limits, method}    │                   │                  │                  │
     │<──────────────│                   │                   │                  │                  │
     │               │                   │                   │                  │                  │
     │ Update chart with new limits     │                   │                  │                  │
     │ Show success toast               │                   │                  │                  │
     │───────┐       │                   │                   │                  │                  │
     │       │       │                   │                   │                  │                  │
     │<──────┘       │                   │                   │                  │                  │
     │               │                   │                   │                  │                  │
┌────┴────┐     ┌────┴─────┐     ┌───────┴───────┐     ┌─────┴─────┐     ┌──────┴───────┐     ┌────┴─────┐
│   UI    │     │  REST    │     │ Characteristic│     │  Sample   │     │  Statistics  │     │  Rolling │
│(Engineer)│    │   API    │     │    Service    │     │   Repo    │     │   Module     │     │  Window  │
└─────────┘     └──────────┘     └───────────────┘     └───────────┘     └──────────────┘     └──────────┘
```

---

## 5. WebSocket Connection Lifecycle

```
┌─────────┐                           ┌──────────────┐                    ┌───────────────┐
│   UI    │                           │   FastAPI    │                    │  Subscription │
│(React)  │                           │  WebSocket   │                    │    Manager    │
└────┬────┘                           └──────┬───────┘                    └───────┬───────┘
     │                                       │                                    │
     │ connect ws://localhost:8000/ws/samples?token=jwt                          │
     │──────────────────────────────────────>│                                    │
     │                                       │                                    │
     │                                       │ validate JWT token                 │
     │                                       │───────┐                            │
     │                                       │       │                            │
     │                                       │<──────┘                            │
     │                                       │                                    │
     │ connection established                │                                    │
     │<──────────────────────────────────────│                                    │
     │                                       │                                    │
     │                                       │ register_connection(conn_id)       │
     │                                       │───────────────────────────────────>│
     │                                       │                                    │
     │                                       │                 ok                 │
     │                                       │<───────────────────────────────────│
     │                                       │                                    │
     │ {type: "subscribe", characteristic_ids: [1, 2]}                           │
     │──────────────────────────────────────>│                                    │
     │                                       │                                    │
     │                                       │ add_subscription(conn_id, [1, 2]) │
     │                                       │───────────────────────────────────>│
     │                                       │                                    │
     │                                       │                 ok                 │
     │                                       │<───────────────────────────────────│
     │                                       │                                    │
     │ {type: "subscribed", characteristic_ids: [1, 2]}                          │
     │<──────────────────────────────────────│                                    │
     │                                       │                                    │
     │                                       │                                    │
     │            ... application running ...                                     │
     │                                       │                                    │
     │                                       │                                    │
     │                                       │ [new sample for char_id=1]         │
     │                                       │<───────────────────────────────────│
     │                                       │                                    │
     │ {type: "sample", payload: {...}}      │                                    │
     │<──────────────────────────────────────│                                    │
     │                                       │                                    │
     │                                       │                                    │
     │ {type: "ping"}                        │                                    │
     │──────────────────────────────────────>│                                    │
     │                                       │                                    │
     │ {type: "pong", server_time: "..."}    │                                    │
     │<──────────────────────────────────────│                                    │
     │                                       │                                    │
     │                                       │                                    │
     │    ╔════════════════════════════════════════════════════════════════╗     │
     │    ║ alt [network disconnect]                                        ║     │
     │    ╠════════════════════════════════════════════════════════════════╣     │
     │    ║                                       │                         ║     │
     │    ║ connection lost                       │                         ║     │
     │    ║───────┐                               │                         ║     │
     │    ║       │                               │                         ║     │
     │    ║<──────┘                               │                         ║     │
     │    ║                                       │                         ║     │
     │    ║                                       │ cleanup_connection()    ║     │
     │    ║                                       │────────────────────────>║     │
     │    ║                                       │                         ║     │
     │    ║ exponential backoff (1s, 2s, 4s...)  │                         ║     │
     │    ║───────┐                               │                         ║     │
     │    ║       │                               │                         ║     │
     │    ║<──────┘                               │                         ║     │
     │    ║                                       │                         ║     │
     │    ║ reconnect                             │                         ║     │
     │    ║──────────────────────────────────────>│                         ║     │
     │    ║                                       │                         ║     │
     │    ║ GET /api/v1/samples?since=last_ts    │                         ║     │
     │    ║ (fetch missed samples via REST)      │                         ║     │
     │    ║──────────────────────────────────────>│                         ║     │
     │    ║                                       │                         ║     │
     │    ╚════════════════════════════════════════════════════════════════╝     │
     │                                       │                                    │
     │                                       │                                    │
     │ {type: "unsubscribe", characteristic_ids: [2]}                            │
     │──────────────────────────────────────>│                                    │
     │                                       │                                    │
     │                                       │ remove_subscription(conn_id, [2]) │
     │                                       │───────────────────────────────────>│
     │                                       │                                    │
     │                                       │                 ok                 │
     │                                       │<───────────────────────────────────│
     │                                       │                                    │
     │ {type: "unsubscribed", characteristic_ids: [2]}                           │
     │<──────────────────────────────────────│                                    │
     │                                       │                                    │
     │                                       │                                    │
     │ close connection (user navigates away)│                                    │
     │──────────────────────────────────────>│                                    │
     │                                       │                                    │
     │                                       │ cleanup_connection(conn_id)        │
     │                                       │───────────────────────────────────>│
     │                                       │                                    │
     │                                       │ remove all subscriptions           │
     │                                       │<───────────────────────────────────│
     │                                       │                                    │
     │ connection closed                     │                                    │
     │<──────────────────────────────────────│                                    │
     │                                       │                                    │
┌────┴────┐                           ┌──────┴───────┐                    ┌───────┴───────┐
│   UI    │                           │   FastAPI    │                    │  Subscription │
│(React)  │                           │  WebSocket   │                    │    Manager    │
└─────────┘                           └──────────────┘                    └───────────────┘
```

---

## 6. Application Startup Sequence

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌───────────┐     ┌─────────────┐     ┌───────────┐
│  Main    │     │ Database │     │   MQTT   │     │    Tag    │     │   Rolling   │     │  FastAPI  │
│  Entry   │     │          │     │  Client  │     │  Provider │     │   Window    │     │    App    │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └─────┬─────┘     └──────┬──────┘     └─────┬─────┘
     │                │                │                 │                  │                  │
     │ start          │                │                 │                  │                  │
     │───────┐        │                │                 │                  │                  │
     │       │        │                │                 │                  │                  │
     │<──────┘        │                │                 │                  │                  │
     │                │                │                 │                  │                  │
     │ init_db()      │                │                 │                  │                  │
     │───────────────>│                │                 │                  │                  │
     │                │                │                 │                  │                  │
     │                │ create engine  │                 │                  │                  │
     │                │ configure pool │                 │                  │                  │
     │                │ run migrations │                 │                  │                  │
     │                │───────┐        │                 │                  │                  │
     │                │       │        │                 │                  │                  │
     │                │<──────┘        │                 │                  │                  │
     │                │                │                 │                  │                  │
     │      ok        │                │                 │                  │                  │
     │<───────────────│                │                 │                  │                  │
     │                │                │                 │                  │                  │
     │ connect_mqtt() │                │                 │                  │                  │
     │────────────────────────────────>│                 │                  │                  │
     │                │                │                 │                  │                  │
     │                │                │ connect to broker                 │                  │
     │                │                │───────┐         │                  │                  │
     │                │                │       │         │                  │                  │
     │                │                │<──────┘         │                  │                  │
     │                │                │                 │                  │                  │
     │     connected  │                │                 │                  │                  │
     │<────────────────────────────────│                 │                  │                  │
     │                │                │                 │                  │                  │
     │ init_tag_provider()             │                 │                  │                  │
     │────────────────────────────────────────────────────>│                  │                  │
     │                │                │                 │                  │                  │
     │                │                │                 │ load active TAG characteristics     │
     │                │                │                 │──────┐           │                  │
     │                │                │                 │      │           │                  │
     │                │                │                 │<─────┘           │                  │
     │                │                │                 │                  │                  │
     │                │                │ subscribe topics│                  │                  │
     │                │                │<────────────────│                  │                  │
     │                │                │                 │                  │                  │
     │                │                │     ok          │                  │                  │
     │                │                │────────────────>│                  │                  │
     │                │                │                 │                  │                  │
     │       started  │                │                 │                  │                  │
     │<────────────────────────────────────────────────────│                  │                  │
     │                │                │                 │                  │                  │
     │ warm_up_windows()               │                 │                  │                  │
     │─────────────────────────────────────────────────────────────────────>│                  │
     │                │                │                 │                  │                  │
     │                │                │                 │                  │ load recent samples
     │                │                │                 │                  │ for active chars │
     │                │                │                 │                  │───────┐          │
     │                │                │                 │                  │       │          │
     │                │                │                 │                  │<──────┘          │
     │                │                │                 │                  │                  │
     │                │                │                 │                  │ populate caches  │
     │                │                │                 │                  │───────┐          │
     │                │                │                 │                  │       │          │
     │                │                │                 │                  │<──────┘          │
     │                │                │                 │                  │                  │
     │     warmed up  │                │                 │                  │                  │
     │<─────────────────────────────────────────────────────────────────────│                  │
     │                │                │                 │                  │                  │
     │ start FastAPI server            │                 │                  │                  │
     │────────────────────────────────────────────────────────────────────────────────────────>│
     │                │                │                 │                  │                  │
     │                │                │                 │                  │                  │ bind to port
     │                │                │                 │                  │                  │ register routes
     │                │                │                 │                  │                  │ start accepting
     │                │                │                 │                  │                  │───────┐
     │                │                │                 │                  │                  │       │
     │                │                │                 │                  │                  │<──────┘
     │                │                │                 │                  │                  │
     │     ready      │                │                 │                  │                  │
     │<────────────────────────────────────────────────────────────────────────────────────────│
     │                │                │                 │                  │                  │
     │ log: "OpenSPC ready on port 8000"                │                  │                  │
     │───────┐        │                │                 │                  │                  │
     │       │        │                │                 │                  │                  │
     │<──────┘        │                │                 │                  │                  │
     │                │                │                 │                  │                  │
┌────┴─────┐     ┌────┴─────┐     ┌────┴─────┐     ┌─────┴─────┐     ┌──────┴──────┐     ┌─────┴─────┐
│  Main    │     │ Database │     │   MQTT   │     │    Tag    │     │   Rolling   │     │  FastAPI  │
│  Entry   │     │          │     │  Client  │     │  Provider │     │   Window    │     │    App    │
└──────────┘     └──────────┘     └──────────┘     └───────────┘     └─────────────┘     └───────────┘
```

---

*Sequence diagrams complete. Ready for implementation reference.*
