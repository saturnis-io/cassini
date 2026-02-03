# OpenSPC Technology Stack Specification

## Document Information
- **Project:** OpenSPC - Event-Driven Statistical Process Control System
- **Author:** CTO, Virtual Engineering Co.
- **Date:** 2026-02-02
- **Status:** Approved for Implementation

---

## 1. Backend Stack

### Python Runtime
- **Version:** Python 3.11+
- **Rationale:**
  - Native `asyncio` improvements for high-performance async operations
  - Enhanced type hints with `Self` type and variadic generics
  - Performance improvements in interpreter (10-60% faster than 3.10)
  - LTS-like stability with security updates through 2027

### Web Framework
- **Primary:** FastAPI 0.109+
- **Rationale:**
  - Native async/await support for MQTT message handling
  - Built-in OpenAPI/Swagger documentation
  - Pydantic integration for request/response validation
  - WebSocket support for real-time UI updates
  - Dependency injection system for clean service architecture

### Data Validation & Serialization
- **Primary:** Pydantic 2.x
- **Rationale:**
  - 5-50x faster than Pydantic v1 (Rust-based core)
  - Native JSON Schema generation
  - Strict mode for critical SPC calculations
  - Field validators for control limit constraints

### Database ORM & Migration
- **ORM:** SQLAlchemy 2.0+
- **Migration:** Alembic 1.13+
- **Rationale:**
  - SQLAlchemy 2.0 provides modern async support via `asyncio`
  - Native SQLite compatibility with connection pooling
  - Type-annotated models align with Pydantic integration
  - Alembic handles schema evolution as control parameters change

### Database
- **Primary:** SQLite 3.40+
- **Connection:** aiosqlite 0.19+ (async wrapper)
- **Rationale:**
  - Zero configuration deployment
  - ACID compliance for measurement integrity
  - Single-file portability for edge/factory deployments
  - WAL mode for concurrent read/write operations
  - JSON1 extension for flexible metadata storage

### MQTT Client
- **Primary:** aiomqtt 2.0+ (formerly asyncio-mqtt)
- **Alternative:** paho-mqtt 2.0 (for synchronous contexts)
- **Rationale:**
  - `aiomqtt` provides native asyncio integration with FastAPI
  - Clean context manager API for connection lifecycle
  - Automatic reconnection handling for factory environments
  - Full MQTT 5.0 support (if broker supports it)

### Sparkplug B Protocol
- **Library:** sparkplug-b 1.0+ (protobuf-based)
- **Protobuf:** protobuf 4.25+
- **Rationale:**
  - Official Sparkplug B specification compliance
  - Protocol buffer serialization for efficient payloads
  - Supports NBIRTH/NDATA/NCMD message types

### Statistical Computing
- **Primary:** NumPy 1.26+
- **Optional:** SciPy 1.12+ (for advanced statistical functions)
- **Rationale:**
  - Vectorized operations for rolling window calculations
  - Pre-computed statistical constants (d2, c4 tables)
  - Memory-efficient array operations for sample buffers

### Caching (Optional)
- **In-Memory:** Python `lru_cache` / `cachetools`
- **Distributed (Future):** Redis 7.x via `redis-py`
- **Rationale:**
  - Rolling window buffer lives in memory for low latency
  - Redis optional for multi-instance horizontal scaling

---

## 2. Frontend Stack

### Framework Decision: React

**Selected:** React 18+

**Rationale for React over Vue:**
1. **Ecosystem Maturity:** Larger library ecosystem for charting and real-time data
2. **TypeScript Integration:** Superior type inference with React hooks
3. **Concurrent Features:** React 18's concurrent rendering for smooth chart updates
4. **Team Availability:** Broader developer pool familiar with React patterns
5. **State Management:** Zustand/Jotai provide lightweight alternatives to Redux

**Note:** Vue 3 is also acceptable if team expertise favors it. Both frameworks meet project requirements.

### Build Tooling
- **Bundler:** Vite 5.x
- **Rationale:**
  - Instant HMR for development productivity
  - ES modules-based for modern browser support
  - Optimized production builds with Rollup
  - Native TypeScript support

### Language
- **Primary:** TypeScript 5.3+
- **Rationale:**
  - Type safety for complex SPC data structures
  - Enhanced IDE support for large codebases
  - Refactoring confidence during iterative development

### Charting Library
- **Primary:** Recharts 2.12+
- **Alternative:** Chart.js 4.x (for simpler use cases)
- **Rationale for Recharts:**
  - React-native component model
  - Declarative API for control chart zones
  - SVG-based for high-quality rendering
  - Built-in animation support for real-time updates
  - Custom reference lines/areas for UCL/LCL/zones

### State Management
- **Primary:** Zustand 4.x
- **Rationale:**
  - Minimal boilerplate compared to Redux
  - Built-in subscription model for real-time updates
  - DevTools integration for debugging
  - Middleware support for persistence

### Real-Time Communication
- **Primary:** Native WebSocket API
- **Alternative:** Socket.IO client (if server uses Socket.IO)
- **Rationale:**
  - FastAPI native WebSocket support
  - Lower overhead than polling
  - Bi-directional for acknowledgment workflows

### HTTP Client
- **Primary:** TanStack Query (React Query) 5.x + fetch API
- **Rationale:**
  - Automatic caching and revalidation
  - Optimistic updates for acknowledgment workflow
  - Built-in loading/error states
  - Server state synchronization

### UI Component Library
- **Primary:** shadcn/ui (Radix + Tailwind)
- **Alternative:** Ant Design 5.x
- **Rationale for shadcn/ui:**
  - Copy-paste components (no version lock-in)
  - Accessible by default (Radix primitives)
  - Tailwind CSS for rapid styling
  - Industrial/professional aesthetic

### Styling
- **Primary:** Tailwind CSS 3.4+
- **Rationale:**
  - Utility-first for consistent design system
  - PurgeCSS for minimal production bundle
  - Dark mode support for factory environments
  - Easy theming for control chart zones

---

## 3. Testing Stack

### Backend Testing
- **Test Runner:** pytest 8.x
- **Async Testing:** pytest-asyncio 0.23+
- **Coverage:** pytest-cov 4.x
- **Fixtures:** Factory Boy 3.x (for test data)
- **Mocking:** unittest.mock (stdlib) + pytest-mock

### Frontend Testing
- **Unit Tests:** Vitest 1.x
- **Component Tests:** React Testing Library 14.x
- **E2E Tests:** Playwright 1.41+
- **Rationale:**
  - Vitest integrates with Vite for fast execution
  - Playwright for cross-browser control chart rendering

### SPC-Specific Testing
- **Statistical Validation:** Hypothesis 6.x (property-based testing)
- **Rationale:**
  - Generate edge cases for Nelson Rules
  - Verify statistical invariants across random inputs
  - Catch floating-point edge cases

### API Testing
- **Contract Testing:** Schemathesis 3.x
- **Rationale:**
  - Auto-generate tests from OpenAPI schema
  - Catch edge cases in API validation

---

## 4. Development Tools

### Code Quality
- **Linter:** Ruff 0.2+ (replaces Flake8, isort, pyupgrade)
- **Type Checker:** mypy 1.8+ (strict mode)
- **Formatter:** Ruff format (replaces Black)
- **Pre-commit:** pre-commit 3.x

### Frontend Code Quality
- **Linter:** ESLint 8.x + typescript-eslint
- **Formatter:** Prettier 3.x
- **Type Checking:** tsc --noEmit

### Documentation
- **API Docs:** FastAPI auto-generated (Swagger/ReDoc)
- **Code Docs:** mkdocs-material 9.x
- **Rationale:**
  - Live API documentation for frontend developers
  - Material theme for professional documentation site

### Development Environment
- **Package Management:** uv 0.1+ (fast Python package installer)
- **Alternative:** Poetry 1.7+ or pip-tools
- **Virtual Environments:** venv (stdlib) or uv-managed
- **Rationale:**
  - `uv` is 10-100x faster than pip
  - Lockfile support for reproducible builds

### Containerization
- **Runtime:** Docker 24.x
- **Compose:** Docker Compose 2.24+
- **Rationale:**
  - Consistent development environment
  - Easy MQTT broker setup (Eclipse Mosquitto)
  - Production-ready container images

### Version Control
- **SCM:** Git 2.43+
- **Workflow:** GitFlow (feature branches, develop, main)
- **Hooks:** pre-commit for automated checks

---

## 5. Infrastructure Components

### MQTT Broker (Development/Testing)
- **Primary:** Eclipse Mosquitto 2.x
- **Rationale:**
  - Lightweight, easy Docker deployment
  - Full MQTT 5.0 support
  - WebSocket bridge for browser clients

### Reverse Proxy (Production)
- **Primary:** Caddy 2.x or nginx 1.25+
- **Rationale:**
  - Automatic HTTPS with Caddy
  - WebSocket proxying
  - Static file serving for frontend

---

## 6. Package Version Summary

### Backend (Python)
```
python = "^3.11"
fastapi = "^0.109.0"
uvicorn = "^0.27.0"
pydantic = "^2.6.0"
sqlalchemy = "^2.0.25"
alembic = "^1.13.0"
aiosqlite = "^0.19.0"
aiomqtt = "^2.0.0"
sparkplug-b = "^1.0.0"
protobuf = "^4.25.0"
numpy = "^1.26.0"
```

### Frontend (Node.js)
```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "typescript": "^5.3.0",
  "vite": "^5.0.0",
  "recharts": "^2.12.0",
  "zustand": "^4.5.0",
  "@tanstack/react-query": "^5.17.0",
  "tailwindcss": "^3.4.0"
}
```

### Testing
```
pytest = "^8.0.0"
pytest-asyncio = "^0.23.0"
pytest-cov = "^4.1.0"
hypothesis = "^6.97.0"
playwright = "^1.41.0"
```

---

## 7. Compatibility Matrix

| Component | Min Version | Recommended | Notes |
|-----------|-------------|-------------|-------|
| Python | 3.11 | 3.12 | 3.12 has better error messages |
| Node.js | 18 LTS | 20 LTS | For frontend build tooling |
| SQLite | 3.35 | 3.45 | JSON and math functions |
| MQTT | 3.1.1 | 5.0 | 5.0 for response topics |

---

## 8. Decision Log

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| MQTT Client | aiomqtt | paho-mqtt, gmqtt | Native asyncio, clean API |
| Frontend Framework | React | Vue 3, Svelte | Ecosystem, team availability |
| Charting | Recharts | Chart.js, ECharts | React-native, zone support |
| State Management | Zustand | Redux, Jotai | Simplicity, real-time patterns |
| ORM | SQLAlchemy 2.0 | Tortoise, SQLModel | Maturity, async support |
| Python Tooling | Ruff + uv | Black + Flake8 + pip | Speed, unified tooling |

---

*Document approved for implementation. Technical decisions align with OpenSPC specification requirements.*
