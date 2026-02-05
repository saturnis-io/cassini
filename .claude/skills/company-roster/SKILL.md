---
name: company-roster
description: View current specialists and team composition.
disable-model-invocation: true
---

# Company Roster

Display the current team composition and available specialists.

## Context Loading

Read `.company/roster.json` for the current roster. If missing, display: `{"specialists":[],"message":"No roster found. Run /company to initialize."}`

---

## Core Roles

These roles are always available:

| Role | Status | Skill Path |
|------|--------|------------|
| CTO | Active | company-cto |
| Architect | Active | company-architect |
| Tech Lead | Active | company-tech-lead |
| Senior Developer | Active | company-senior-dev |
| Developer | Active | company-developer |
| QA Engineer | Active | company-qa |

---

## Default Specialists

These specialists are included by default:

| Specialist | Type | Expertise |
|------------|------|-----------|
| Git Flow | Default | Git, Branching, PRs, Merge Strategies |
| Code Reviewer | Default | Code Review, Security, Quality |
| Test Architect | Default | Testing Strategy, Unit/Integration/E2E |

---

## Hired Specialists

Specialists created dynamically for projects - filter roster.json for specialists with `type == "hired"`.

---

## Specialist Statistics

Read roster.json and calculate:
- Total Specialists: Count of `.specialists` array
- By Type: Group specialists by `.type` and count each

---

## Available Expertise Domains

The hiring manager can create specialists for these domains:

### Frontend
- `frontend-react` - React, Hooks, Redux, Next.js
- `frontend-vue` - Vue 3, Composition API, Nuxt
- `frontend-angular` - Angular, RxJS, NgRx
- `frontend-svelte` - Svelte, SvelteKit
- `ui-css` - Tailwind, CSS-in-JS, Sass
- `ui-accessibility` - ARIA, WCAG, Screen readers

### Backend
- `backend-node` - Node.js, Express, Fastify, NestJS
- `backend-python` - Python, FastAPI, Django, Flask
- `backend-go` - Go, Gin, Echo
- `backend-rust` - Rust, Actix, Axum
- `backend-java` - Java, Spring Boot
- `backend-dotnet` - .NET, ASP.NET Core

### Data
- `database-postgresql` - PostgreSQL
- `database-mongodb` - MongoDB
- `database-redis` - Redis, Caching

### Infrastructure
- `infra-docker` - Docker, Compose
- `infra-kubernetes` - Kubernetes, Helm
- `cloud-aws` - AWS services
- `cloud-gcp` - GCP services
- `cicd-github` - GitHub Actions

### Quality
- `testing-unit` - Unit testing frameworks
- `testing-e2e` - Playwright, Cypress, Puppeteer
- `security` - Application security, OWASP

---

## Hiring a New Specialist

To manually request a new specialist:

```
/company-hire frontend-react
```

Or let the hiring manager automatically evaluate needs when starting a project with `/company`.

---

## Specialist Usage

### Which specialists are currently active?
Read `.company/state.json` and check the `active_agents` field.

### Recent specialist activity
Check for markdown files in `.company/artifacts/specialist-*/` directories.

---

## Managing the Roster

### View Full Roster Details
```bash
cat .company/roster.json | jq '.'
```

### Remove a Specialist
Edit `.company/roster.json` to remove the specialist entry, then delete the skill folder:
```bash
rm -rf .claude/skills/company-specialists/[domain-id]
```

### Reset Roster to Defaults
```bash
cp /path/to/templates/roster.json .company/roster.json
```
