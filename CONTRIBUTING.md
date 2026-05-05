# Contributing to Cassini

Thank you for your interest in contributing to Cassini! Whether you're fixing a bug, improving documentation, or proposing a new feature, your contributions help make statistical process control accessible to everyone.

Cassini is developed by [Saturnis LLC](https://saturnis.io) and released under the AGPL-3.0 license. We welcome contributions from the community and are committed to making the process straightforward and rewarding.

## Ways to Contribute

- **Bug Reports** -- Found something broken? Open an issue with steps to reproduce.
- **Documentation** -- Improvements to guides, API docs, and inline comments are always appreciated.
- **Feature Requests** -- Have an idea? Open a discussion or issue describing the use case.
- **Code Contributions** -- Bug fixes, performance improvements, and new features for the Community Edition.

> **Note:** Code contributions apply to Community Edition features only. Commercial modules (enterprise connectors, advanced analytics, and premium integrations) are maintained by Saturnis. If you're unsure whether a feature falls under Community or Commercial, feel free to ask in your issue or PR.

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+ (22 LTS recommended)
- Git

### Quick Start

<details open>
<summary><strong>macOS / Linux</strong></summary>

```bash
# Clone your fork
git clone https://github.com/<your-username>/cassini.git
cd cassini

# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
export CASSINI_ADMIN_PASSWORD=dev-password
export CASSINI_COOKIE_SECURE=false
uvicorn cassini.main:app --reload

# Frontend (in a new terminal)
cd frontend
npm install
npm run dev
```

</details>

<details>
<summary><strong>Windows</strong></summary>

```bash
# Clone your fork
git clone https://github.com/<your-username>/cassini.git
cd cassini

# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
alembic upgrade head
set CASSINI_ADMIN_PASSWORD=dev-password
set CASSINI_COOKIE_SECURE=false
uvicorn cassini.main:app --reload

# Frontend (in a new terminal)
cd frontend
npm install
npm run dev
```

</details>

See the [README](README.md#getting-started) for detailed instructions and troubleshooting.

## Project Structure

```text
cassini/
├── backend/              FastAPI application
│   ├── src/cassini/
│   │   ├── api/          Routers, schemas, dependencies
│   │   ├── cli/          CLI entrypoint (cassini serve, migrate, etc.)
│   │   ├── core/         SPC engine, capability, MSA, anomaly, signatures
│   │   ├── db/           Models, repositories, migrations
│   │   ├── service/      Windows Service (CassiniSPC)
│   │   └── tray/         System tray companion (pystray)
│   ├── alembic/          Database migrations
│   └── pyproject.toml    Python dependencies
├── frontend/             React SPA
│   ├── src/
│   │   ├── api/          API client, hooks, namespaces
│   │   ├── components/   200+ components organized by domain
│   │   ├── pages/        22 page components
│   │   ├── stores/       Zustand state stores
│   │   └── hooks/        Custom React hooks
│   └── package.json      Node dependencies
├── bridge/               Serial gage → MQTT translator
├── installer/            Inno Setup Windows installer
├── docs/                 Guides and screenshots
├── docker-compose.yml    Production-ready Docker setup
└── Dockerfile            Multi-stage build
```

## Coding Standards

### TypeScript (Frontend)

- **Strict mode** enabled -- no implicit `any`, no unused locals or parameters
- **Prettier** formatting: no semicolons, single quotes, trailing commas, 100-char line width
- **Import alias**: use `@/` for `src/` paths (e.g., `import { Button } from '@/components/Button'`)
- **Components**: function components with named exports, one component per file
- **Hooks**: custom hooks in `hooks/`, React Query hooks in `api/hooks/`

### Python (Backend)

- Type hints on all function signatures
- Async/await for database operations (SQLAlchemy async)
- Pydantic schemas for all API request/response models

## Testing

Cassini ships with a layered test stack. Pick the level that matches your change.

### Unit + integration (always runs in CI, no Docker required)

```bash
cd backend
pytest tests/ -x -m "not containerized"

cd frontend
npx tsc --noEmit       # type check
npm run build          # production build
```

The default `pytest` invocation runs against SQLite. Integration tests live in `backend/tests/integration/` and exercise the full ASGI app via `httpx`.

### Multi-database integration tests

CI runs every integration test against PostgreSQL and MySQL on every PR; MSSQL is exercised nightly. To run locally against a different dialect:

```bash
docker compose -f docker-compose.test-dbs.yml up -d --wait
cd backend
CASSINI_DATABASE_URL="postgresql+asyncpg://cassini:cassini@localhost:5432/cassini_test" \
  pytest tests/integration/ -x -m "not containerized"
```

Connection strings for the other dialects are in [`docker-compose.test-dbs.yml`](docker-compose.test-dbs.yml).

### Containerized fixtures (real MQTT, OPC-UA, Valkey)

Tests under `backend/tests/containerized/` spin real Docker containers via `testcontainers-python`. They are gated behind the `containerized` pytest marker so the default `pytest` run never touches them.

```bash
cd backend
pip install -e ".[dev,test-containerized]"
pytest tests/containerized -m containerized
```

If Docker isn't reachable, every fixture skips gracefully — no failures, no import errors. Full reference: [`docs/testing-harness.md`](docs/testing-harness.md).

### Full-stack docker harness

For Playwright runs or interactive debugging against the whole platform:

```bash
docker compose -f docker-compose.full.yml up -d --wait
# Backend on :8001, frontend (vite preview) on :5174
```

Pick a database dialect with `CASSINI_DB_DIALECT={sqlite|postgresql|mysql|mssql}`.

### End-to-end (Playwright)

```bash
cd frontend
npx playwright install --with-deps chromium
npx playwright test --project=functional
```

The CI matrix runs Playwright against SQLite on every PR, and against PostgreSQL and MySQL nightly (or on a `multi-db`-labeled PR).

## Pull Request Process

1. **Fork** the repository and create a feature branch from `main`.
2. **Implement** your changes, following the coding standards above.
3. **Test** your changes — at minimum, the unit + integration tier above. For changes touching ingestion, brokers, or auth, run the containerized tier as well.
4. **Type-check** the frontend (`npx tsc --noEmit`) — strict mode means an unused import or missing prop will block the build.
5. **Commit** with clear, descriptive messages.
6. **Submit** a pull request against `main` with a description of what changed and why.

A maintainer will review your PR, provide feedback, and merge once it meets quality standards.

### What Makes a Good PR

- Focused on a single concern (one bug fix or one feature)
- Includes relevant tests or type-check verification
- Updates documentation if behavior changes
- Describes the "why" in addition to the "what"

## Contributor License Agreement

We may require a Contributor License Agreement (CLA) for larger contributions. This helps us maintain the dual-license model that keeps Cassini sustainable as both an open-source project and a commercial product. We will let you know if a CLA is needed when you submit your PR.

## Code of Conduct

All contributors are expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md). We are committed to providing a welcoming and inclusive experience for everyone.

## Questions?

- Open a [GitHub Discussion](https://github.com/saturnis-io/cassini/discussions) for general questions
- Email [community@saturnis.io](mailto:community@saturnis.io) for anything else

Thank you for helping make Cassini better.
