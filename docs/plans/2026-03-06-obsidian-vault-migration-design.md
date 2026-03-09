# Obsidian Vault Migration Design

**Date:** 2026-03-06
**Status:** Approved
**Goal:** Migrate 230+ project docs from flat `.planning/` `.company/` `.knowledge/` `tasks/` structure into an Obsidian vault at `.vault/cassini-vault/`. Spring clean, deduplicate, leverage Obsidian-native features (backlinks, tags, properties, graph view, CLI).

## Vault Structure

```
cassini-vault/
  Dashboards/         Session Start, Project Status, Roadmap
  Sprints/            One note per sprint (5-9)
  Designs/            Consolidated design docs (recent/relevant)
  Decisions/          Individual ADR notes (D-001, D-002, ...)
  Architecture/       System Overview, Data Model, API Contracts, Design System
  Features/           One note per major feature area (13 features)
  Audits/             Skeptic reviews, compliance checks
  Strategy/           Competitive Analysis, Pricing Strategy
  Lessons/            Lessons Learned, Pitfalls
  Archive/            v0.3.0 Summary, v0.4.0 Summary
  Templates/          Sprint, Decision, Lesson, Daily Note
```

## Conventions

- Every note gets YAML frontmatter: `type`, `status`, `created`, `updated`, `tags`, `aliases`
- `[[wikilinks]]` between related notes
- Tags: `#active`, `#archived`, `#blocker`, `#decision`, `#lesson`, `#sprint`
- Human-readable file names, no date prefixes (dates in properties)

## Properties Schema

**Base (all notes):**
```yaml
type: sprint | decision | design | feature | audit | lesson | dashboard | archive | strategy
status: active | complete | stale | archived
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: []
aliases: []
```

**Sprint additions:** `branch`, `started`, `completed`, `features`, `decisions`, `migration_range`
**Decision additions:** `id`, `sprint`, `alternatives_considered`
**Lesson additions:** `severity`, `source`, `related_feature`

## Templates

4 templates: Sprint, Decision (ADR), Lesson Learned, Daily Note.
Daily Note includes: Session Goals, Work Done, Decisions Made, Lessons Learned, Next Session.

## MEMORY.md Changes

Slim from 227+ lines to ~30 lines:
- Vault path + CLI command
- Quick reference (project structure, current state)
- Key files fallback (if Obsidian unavailable)

All sprint history, codebase stats, pitfalls, and architecture details move to vault notes.

## CLAUDE.md Changes

Add one RULE to Workflow Rules section:
```
> **RULE**: After completing any sprint, design, decision, audit, or lesson — update the Obsidian vault.
```

## CLI Integration

Binary: `/c/Users/djbra/AppData/Local/Programs/Obsidian/Obsidian.com`
Session start: `read file="Session Start"` + `tasks todo`
After work: `daily:append`, `property:set`
Creating: `create name="..." template=... open`

## Migration Map

~35-40 new vault notes from ~50 source files.
150+ archive files consolidated into 2 summary notes.
~20 files skipped (stale/speculative).

### Migrate
- STATE.md → Dashboards/Session Start
- ROADMAP.md → Dashboards/Roadmap
- DECISIONS.md → split into Decisions/D-001, D-002
- SKEPTIC-REVIEW-REPORT.md → Audits/Skeptic Review Report
- COMPETITIVE-ANALYSIS-2026.md → Strategy/Competitive Analysis 2026
- PRICING-STRATEGY-2026.md → Strategy/Pricing Strategy 2026
- Sprint design+plan pairs → Designs/ (consolidated)
- tasks/lessons.md → Lessons/Lessons Learned
- MEMORY.md sprint blocks → Sprints/Sprint 5-9
- MEMORY.md codebase stats → Dashboards/Project Status
- MEMORY.md pitfalls → Lessons/Pitfalls
- .company/architect/data-model.md → Architecture/Data Model
- .company/architect/api-contracts.md → Architecture/API Contracts
- .company/ui-designer/design-system.md → Architecture/Design System
- .knowledge/ARCHITECTURE.md → Architecture/System Overview
- .knowledge/features/*.md → Features/ (13 notes)

### Consolidate (originals stay in git)
- .planning/archive/v0.3.0/ (100+ files) → Archive/v0.3.0 Summary
- .planning/archive/v0.4.0/ (50+ files) → Archive/v0.4.0 Summary

### Skip
- DATA-CENTER-SPC-OPPORTUNITY.md (speculative)
- FUTURE-WORK-ENHANCEMENTS.md (brainstorm, no timeline)
- USER-STORIES.md (1585 lines, partially stale)
- PRD-v0.4.0.md (superseded)
- Most .company/ role artifacts (superseded by implementation)
- Pre-Sprint 5 audit files (superseded)
