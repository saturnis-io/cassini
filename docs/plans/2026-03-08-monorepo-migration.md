# Saturnis Monorepo Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate three independent repos (SPC-client, saturnis.io, ephemeris) into a single private `saturnis` monorepo with public mirrors for the open-source projects.

**Architecture:** Private monorepo at `~/Projects/saturnis/` using pnpm workspaces for JS packages and a self-contained Cargo workspace for Rust. Each product lives under `apps/`. Shared JS packages under `packages/`. Public GitHub repos maintained via `git subtree push`. License generation lives in the website's Next.js API routes; apps validate offline with signed JWTs.

**Tech Stack:** pnpm workspaces (JS), Cargo workspace (Rust), pip/pyproject.toml (Python), git subtree (public mirrors)

---

## Source Repos

| Repo | Local Path | Remote | Branch |
|------|-----------|--------|--------|
| SPC-client (Cassini) | `~/Projects/SPC-client` | `https://github.com/djbrandl/Cassini.git` | `main` |
| saturnis.io | `~/Projects/saturnis.io` | `https://github.com/djbrandl/saturnis.io.git` | `main` |
| ephemeris | `~/Projects/ephemeris` | `https://github.com/saturnis-io/ephemeris` | `main` |

## Target Structure

```
saturnis/
├── apps/
│   ├── cassini/                    # From SPC-client (AGPL-3.0)
│   │   ├── backend/               #   FastAPI, SQLAlchemy, Alembic
│   │   ├── frontend/              #   React 19, Vite 7, TanStack Query
│   │   ├── bridge/                #   cassini-bridge, serial→MQTT
│   │   ├── LICENSE                #   AGPL-3.0
│   │   ├── LICENSE-COMMERCIAL.md
│   │   ├── Dockerfile
│   │   ├── Caddyfile
│   │   ├── docker-compose.yml
│   │   ├── docker-compose.prod.yml
│   │   ├── docker-compose.test-dbs.yml
│   │   ├── README.md
│   │   ├── CONTRIBUTING.md
│   │   ├── CODE_OF_CONDUCT.md
│   │   └── SECURITY.md
│   ├── ephemeris/                  # From ephemeris (Apache-2.0)
│   │   ├── crates/                #   7 Rust crates
│   │   ├── Cargo.toml             #   Workspace root
│   │   ├── Cargo.lock
│   │   ├── deny.toml
│   │   ├── rust-toolchain.toml
│   │   ├── ephemeris.toml
│   │   ├── docker-compose.dev.yml
│   │   ├── docker-compose.test.yml
│   │   ├── LICENSE                #   Apache-2.0
│   │   ├── README.md
│   │   └── .github/               #   CI (copied, adapted later)
│   └── website/                    # From saturnis.io (proprietary)
│       ├── src/
│       ├── public/
│       ├── package.json
│       ├── next.config.ts
│       ├── tsconfig.json
│       └── ...
├── packages/                       # Shared JS/TS packages (future)
│   └── (empty initially — license-sdk, brand, shared-types added later)
├── commercial/                     # Cassini proprietary extensions (future)
│   └── (empty initially)
├── .claude/
│   └── CLAUDE.md                   # Unified project instructions
├── .vault/
│   └── cassini-vault/              # Obsidian vault (from SPC-client)
├── .knowledge/                     # GitNexus graph (regenerate after migration)
├── docs/                           # Staging area for plans
├── tasks/
│   ├── todo.md
│   └── lessons.md
├── pnpm-workspace.yaml
├── .gitignore
├── .dockerignore
└── README.md
```

### What does NOT move into `apps/cassini/`

These are monorepo-wide concerns that live at the saturnis root:

| Item | Current Location (SPC-client) | New Location (saturnis) |
|------|-------------------------------|-------------------------|
| Claude config | `.claude/` | `.claude/` (rewritten) |
| Obsidian vault | `.vault/cassini-vault/` | `.vault/cassini-vault/` |
| Knowledge graph | `.knowledge/` | `.knowledge/` (regenerate) |
| Task tracking | `tasks/` | `tasks/` |
| Plan staging | `docs/plans/` | `docs/plans/` |
| Legacy planning | `.planning/` | `.planning/` (carry over, still read-only) |
| Screenshot PNGs | root `*.png` | Delete or move to `docs/assets/` |
| `.company/`, `.swarm/`, etc. | root | Evaluate — carry over if needed |

---

## Git Strategy: History Preservation & Ongoing Sync

### The Problem

Three repos with independent histories need to become one, while two of them (Cassini, Ephemeris) continue to exist as public GitHub repos. We need:

1. **Full commit history** preserved in the monorepo (not squashed)
2. **Ongoing outbound sync**: monorepo changes → public GitHub repos
3. **Occasional inbound sync**: external contributions from public repos → monorepo
4. **No proprietary leakage**: `commercial/`, `packages/`, `apps/website/` never appear in public repos

### Approach: `git subtree` (not submodules)

| Method | History | Bidirectional | Complexity | Verdict |
|--------|---------|--------------|------------|---------|
| `git subtree add` (no --squash) | Full history preserved | Yes (push/pull) | Low | **Winner** |
| `git subtree add --squash` | Collapsed to 1 commit | Yes but conflicts | Low | Backup option |
| `git submodule` | Separate repos, pointer only | Manual | High | Avoid |
| Copy files + fresh commit | Lost | N/A | Lowest | Last resort |

We use **`git subtree add` without `--squash`** to bring full commit history into the monorepo. This means `git log apps/cassini/` shows every original Cassini commit.

### Import Flow (One-Time, Phase 2)

```
djbrandl/Cassini.git (GitHub)
    │
    ▼  git subtree add --prefix=apps/cassini
saturnis/ (local monorepo)
    │
    ▼  git remote add origin saturnis-io/saturnis (private)
    │  git push
    ▼
saturnis-io/saturnis (GitHub, private)
```

Repeat for saturnis.io → `apps/website` and ephemeris → `apps/ephemeris`.

### Ongoing Outbound Sync (Monorepo → Public Repos)

After making changes in the monorepo, push the relevant subtree to the public repo:

```bash
# Push Cassini changes to public repo
git subtree push --prefix=apps/cassini public-cassini main

# Push Ephemeris changes to public repo
git subtree push --prefix=apps/ephemeris public-ephemeris main
```

This extracts only the commits that touch `apps/cassini/` (or `apps/ephemeris/`), rewrites their paths to be root-relative, and pushes them. The public repo sees clean commits with paths like `backend/src/...` — no `apps/cassini/` prefix.

**When to push:** After each release, after merging a significant PR, or on a regular cadence. Not necessarily after every commit.

### Occasional Inbound Sync (Public Contributions → Monorepo)

If someone submits a PR to the public `saturnis-io/cassini` repo:

```bash
# Pull their changes into the monorepo
git subtree pull --prefix=apps/cassini public-cassini main --squash
```

> Use `--squash` on inbound pulls to keep the monorepo log clean. The public repo retains the full granular history.

### What Happens to Existing GitHub Repos

| Repo | Current URL | Post-Migration Role |
|------|-------------|-------------------|
| `djbrandl/Cassini` | `https://github.com/djbrandl/Cassini.git` | **Option A:** Rename to `saturnis-io/cassini`, becomes the public mirror. **Option B:** Archive, create fresh `saturnis-io/cassini` from first subtree push. |
| `djbrandl/saturnis.io` | `https://github.com/djbrandl/saturnis.io.git` | Archive (website is proprietary, no public mirror needed). |
| `saturnis-io/ephemeris` | `https://github.com/saturnis-io/ephemeris` | Becomes the public mirror. Already under the org. |
| *(new)* `saturnis-io/saturnis` | — | Private monorepo. Created in Phase 6. |

**Recommended for Cassini:** Transfer `djbrandl/Cassini` to `saturnis-io/cassini` via GitHub settings (Settings → Transfer). This preserves stars, issues, and existing links. Then use it as the public mirror target.

### GitHub Remotes Summary (Post-Migration)

```bash
# In ~/Projects/saturnis/
git remote -v
# origin          https://github.com/saturnis-io/saturnis.git       (private monorepo)
# public-cassini  https://github.com/saturnis-io/cassini.git        (public AGPL mirror)
# public-ephemeris https://github.com/saturnis-io/ephemeris.git     (public Apache mirror)
# website-origin  https://github.com/djbrandl/saturnis.io.git       (archived, read-only)
# cassini-origin  https://github.com/djbrandl/Cassini.git           (archived or transferred)
# ephemeris-origin https://github.com/saturnis-io/ephemeris.git     (same as public-ephemeris)
```

After migration is stable, clean up the import remotes:

```bash
git remote remove website-origin
git remote remove cassini-origin
git remote remove ephemeris-origin
```

### Safety: Preventing Proprietary Leakage

The subtree push command only includes files under the specified prefix (`apps/cassini/` or `apps/ephemeris/`). Files at the monorepo root (`commercial/`, `packages/`, `apps/website/`, `.claude/`) are **never** included in the push.

However, if someone accidentally moves proprietary code into `apps/cassini/`, it would be pushed. Mitigation:

1. **CLAUDE.md rule** (already in plan): "Never commit proprietary code into `apps/cassini/` or `apps/ephemeris/`"
2. **Pre-push hook** (add in CI/CD phase): Script that scans the subtree diff for files that shouldn't be public
3. **CI check** (add in CI/CD phase): GitHub Action on the public repos that validates no proprietary markers are present

---

## Phase 0: Pre-Flight Checks

### Task 0.1: Ensure all repos are clean

**Step 1: Check SPC-client status**

```bash
cd ~/Projects/SPC-client
git status
git stash list
```

Expected: Working tree clean on `main` (or stash any in-progress work).

**Step 2: Check saturnis.io status**

```bash
cd ~/Projects/saturnis.io
git status
git stash list
```

Expected: Working tree clean on `main` (finish current website work first).

**Step 3: Check ephemeris status**

```bash
cd ~/Projects/ephemeris
git status
git stash list
```

Expected: Working tree clean on `main`.

**Step 4: Commit**

No commit needed — this is read-only verification.

---

## Phase 1: Create Monorepo Scaffold

### Task 1.1: Initialize the saturnis repo

**Files:**
- Create: `~/Projects/saturnis/.gitignore`
- Create: `~/Projects/saturnis/pnpm-workspace.yaml`
- Create: `~/Projects/saturnis/README.md`
- Create: `~/Projects/saturnis/.dockerignore`
- Create: `~/Projects/saturnis/apps/.gitkeep`
- Create: `~/Projects/saturnis/packages/.gitkeep`
- Create: `~/Projects/saturnis/commercial/.gitkeep`

**Step 1: Create directory and init git**

```bash
mkdir -p ~/Projects/saturnis
cd ~/Projects/saturnis
git init
```

**Step 2: Create root .gitignore**

Merged from all three projects — covers Python, Node, Rust, and internal tooling:

```gitignore
# Python
__pycache__/
*.py[cod]
*$py.class
*.egg-info/
*.egg
dist/
build/
.venv/
venv/
.pytest_cache/
.ruff_cache/
htmlcov/
.coverage
*.cover

# Node
node_modules/
*.log
npm-debug.log*
.pnpm-debug.log*

# Rust
target/

# Next.js
.next/
out/

# Vite
.vite/

# IDE
.idea/
.vscode/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db
nul

# Environment / secrets
.env
.env.*
!.env.example
.jwt_secret
.db_encryption_key
db_config.json

# Database (dev)
*.db
*.sqlite
*.sqlite3

# Internal tooling (not committed)
.internal/
.company/
.gemini/
.swarm/
.testing/
.worktrees/
.gitnexus/
.playwright-cli/

# Claude (project-specific, not committed)
.claude/

# Knowledge graph (regenerated)
.knowledge/
```

**Step 3: Create pnpm-workspace.yaml**

```yaml
packages:
  - 'apps/cassini/frontend'
  - 'apps/website'
  - 'packages/*'
```

**Step 4: Create root README.md**

```markdown
# Saturnis

Monorepo for Saturnis products.

| Product | Path | License | Description |
|---------|------|---------|-------------|
| [Cassini](apps/cassini/) | `apps/cassini/` | AGPL-3.0 | Statistical Process Control platform |
| [Ephemeris](apps/ephemeris/) | `apps/ephemeris/` | Apache-2.0 | Track & trace / serialization engine |
| [Website](apps/website/) | `apps/website/` | Proprietary | saturnis.io marketing site |

## Development

```bash
pnpm install          # Install JS dependencies (website + cassini frontend)
```

See each app's README for app-specific setup.
```

**Step 5: Create .dockerignore**

```dockerignore
node_modules
.next
target
.git
.vault
.knowledge
.planning
docs
tasks
*.md
!README.md
```

**Step 6: Create placeholder directories**

```bash
mkdir -p apps packages commercial docs tasks
touch apps/.gitkeep packages/.gitkeep commercial/.gitkeep
```

**Step 7: Initial commit**

```bash
git add -A
git commit -m "chore: initialize saturnis monorepo scaffold"
```

---

## Phase 2: Import Repositories (Preserving History)

### Task 2.1: Import saturnis.io as apps/website

Uses `git subtree add` to preserve full commit history.

**Step 1: Add remote and import**

```bash
cd ~/Projects/saturnis
git remote add website-origin https://github.com/djbrandl/saturnis.io.git
git fetch website-origin
git subtree add --prefix=apps/website website-origin main
```

> **Note:** No `--squash` — this preserves full commit history so `git log apps/website/` and `git blame` work as expected. The log will be noisier but history is intact.

**Step 2: Verify structure**

```bash
ls apps/website/src/app/
# Expected: page.tsx  cassini/  ephemeris/  pricing/  layout.tsx
```

**Step 3: Verify build**

```bash
cd apps/website && npm install && npm run build
```

Expected: Next.js production build succeeds.

**Step 4: Return to root and commit verification**

```bash
cd ~/Projects/saturnis
# Subtree add already created the commit. Verify:
git log --oneline -3
```

---

### Task 2.2: Import SPC-client as apps/cassini (+ root extractions)

This is the most complex import because some SPC-client contents go to the monorepo root, not into `apps/cassini/`.

**Step 1: Import full SPC-client into apps/cassini**

```bash
cd ~/Projects/saturnis
git remote add cassini-origin https://github.com/djbrandl/Cassini.git
git fetch cassini-origin
git subtree add --prefix=apps/cassini cassini-origin main
```

**Step 2: Move monorepo-wide files from apps/cassini/ to root**

These files are project-wide, not Cassini-specific:

```bash
# Vault (documentation for all products)
git mv apps/cassini/.vault .vault

# Task tracking
git mv apps/cassini/tasks tasks

# Plan staging area
git mv apps/cassini/docs docs

# Legacy planning (read-only, carry forward)
git mv apps/cassini/.planning .planning
```

**Step 3: Remove files that don't belong in the monorepo**

```bash
# Root-level screenshots (development artifacts)
rm -f apps/cassini/*.png

# Dashboard (legacy, deprecated per project notes)
rm -rf apps/cassini/dashboard/

# Old CLAUDE.md (will be rewritten at root)
rm -f apps/cassini/CLAUDE.md
rm -f apps/cassini/AGENTS.md

# Internal tooling dirs (recreated per-session, gitignored)
rm -rf apps/cassini/.claude/
rm -rf apps/cassini/.knowledge/
rm -rf apps/cassini/.company/
rm -rf apps/cassini/.gemini/
rm -rf apps/cassini/.swarm/
rm -rf apps/cassini/.internal/
rm -rf apps/cassini/.planning/   # Already moved to root
rm -rf apps/cassini/.testing/
rm -rf apps/cassini/.worktrees/
rm -rf apps/cassini/.playwright-cli/

# bat files (Windows dev scripts, recreate if needed)
rm -f apps/cassini/start-backend.bat
rm -f apps/cassini/start-frontend.bat

# Dev database
rm -f apps/cassini/openspc.db
rm -f apps/cassini/.jwt_secret
```

**Step 4: Verify Cassini backend**

```bash
cd apps/cassini/backend
pip install -e . 2>&1 | tail -5
python -m pytest tests/ -x --co -q 2>&1 | tail -5   # Collect only, verify discovery
```

**Step 5: Verify Cassini frontend**

```bash
cd ~/Projects/saturnis/apps/cassini/frontend
npm install
npx tsc --noEmit
```

**Step 6: Commit extractions**

```bash
cd ~/Projects/saturnis
git add -A
git commit -m "chore: extract monorepo-wide files from cassini, clean up artifacts"
```

---

### Task 2.3: Import ephemeris as apps/ephemeris

**Step 1: Import**

```bash
cd ~/Projects/saturnis
git remote add ephemeris-origin https://github.com/saturnis-io/ephemeris.git
# If no remote exists yet, use local path:
# git subtree add --prefix=apps/ephemeris ~/Projects/ephemeris main --squash
git fetch ephemeris-origin
git subtree add --prefix=apps/ephemeris ephemeris-origin main
```

> **Note:** If the ephemeris repo has no remote configured, use the local path variant above. Full history is preserved (no `--squash`).

**Step 2: Verify Cargo workspace**

```bash
cd apps/ephemeris
cargo check 2>&1 | tail -10
```

Expected: Compiles without errors.

**Step 3: Verify tests (requires Docker for PostgreSQL)**

```bash
cd ~/Projects/saturnis/apps/ephemeris
docker compose -f docker-compose.dev.yml up -d postgres mosquitto
cargo test --workspace --lib 2>&1 | tail -10
docker compose -f docker-compose.dev.yml down
```

**Step 4: Commit is already done by subtree add**

```bash
cd ~/Projects/saturnis
git log --oneline -3
```

---

## Phase 3: Monorepo Tooling

### Task 3.1: Set up pnpm workspace

**Step 1: Initialize pnpm at root**

```bash
cd ~/Projects/saturnis
pnpm init
```

Then edit the generated `package.json`:

```json
{
  "name": "saturnis",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev:website": "pnpm --filter website dev",
    "dev:cassini": "pnpm --filter frontend dev",
    "build:website": "pnpm --filter website build",
    "build:cassini": "pnpm --filter frontend build",
    "typecheck": "pnpm -r run typecheck"
  }
}
```

**Step 2: Update apps/website/package.json name**

Change the `name` field from `"saturnis.io"` to `"website"` so pnpm filter works:

```json
{
  "name": "website",
  ...
}
```

**Step 3: Install dependencies**

```bash
cd ~/Projects/saturnis
pnpm install
```

Expected: Creates root `pnpm-lock.yaml`, installs deps for both `apps/website` and `apps/cassini/frontend`.

**Step 4: Verify workspace**

```bash
pnpm ls --depth 0 -r
```

Expected: Lists `website` and `frontend` as workspace packages.

**Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml apps/website/package.json
git commit -m "chore: set up pnpm workspace for JS packages"
```

---

### Task 3.2: Write the unified CLAUDE.md

**Files:**
- Create: `~/Projects/saturnis/CLAUDE.md`

This is a rewrite of the existing Cassini CLAUDE.md expanded to cover all three products. The full content is large — here is the structural outline. The actual content should be adapted from the existing `SPC-client/CLAUDE.md`:

```markdown
# Saturnis — CLAUDE.md

## Project Overview
Saturnis product monorepo. Three products, shared tooling.

| Product | Path | Stack | License |
|---------|------|-------|---------|
| Cassini | `apps/cassini/` | FastAPI + React 19 + Python bridge | AGPL-3.0 |
| Ephemeris | `apps/ephemeris/` | Rust (Axum + Tokio + MQTT) | Apache-2.0 |
| Website | `apps/website/` | Next.js 16, Three.js | Proprietary |

## Commands

### Cassini
[Copy from existing CLAUDE.md, prefix paths with apps/cassini/]

### Ephemeris
```bash
cd apps/ephemeris && cargo build                    # Open-core build
cd apps/ephemeris && cargo build --features enterprise  # Enterprise build
cd apps/ephemeris && cargo test --workspace --lib    # Unit tests
cd apps/ephemeris && cargo test --workspace -- --test-threads=1  # Integration tests
cd apps/ephemeris && cargo fmt --check               # Format check
cd apps/ephemeris && cargo clippy -- -D warnings     # Lint
```

### Website
```bash
cd apps/website && pnpm dev     # Dev server (Next.js)
cd apps/website && pnpm build   # Production build
```

### Workspace
```bash
pnpm install                    # Install all JS deps
pnpm dev:website                # Dev website
pnpm dev:cassini                # Dev Cassini frontend
pnpm typecheck                  # Type-check all JS packages
```

## Cross-Cutting Requirements
[Carry over from existing CLAUDE.md — audit, signatures, API contract, vault checklists]

## Pitfalls
[Carry over all existing pitfalls, add Ephemeris-specific ones]

### Ephemeris
> **RULE**: Never add database client libraries to `ephemeris-core`. DB deps only in connector crates.
> **RULE**: Enterprise features MUST be behind Cargo feature flags. Default build = permissive-licensed only.
> **RULE**: `cargo deny check licenses` must pass. No AGPL/SSPL/BSL in default features.

## Style & Convention
[Carry over existing, add Ephemeris Rust conventions]

## Architecture
[Expand existing with Ephemeris and Website sections]

## Public Mirrors
- **Cassini**: `git subtree push --prefix=apps/cassini public-cassini main`
- **Ephemeris**: `git subtree push --prefix=apps/ephemeris public-ephemeris main`

> **RULE**: Never commit proprietary code (commercial/, packages/license-sdk/, apps/website/) into apps/cassini/ or apps/ephemeris/. These directories are mirrored publicly.
```

> **Important:** The full CLAUDE.md should be written by carefully merging the existing Cassini CLAUDE.md with ephemeris-specific rules. This outline shows the structure — the executing session should read the originals and produce the complete file.

**Step 1: Write the full CLAUDE.md**

Read `apps/cassini/CLAUDE.md` (the copy we removed from apps/cassini in Task 2.2 — retrieve from git history if needed, or from `~/Projects/SPC-client/CLAUDE.md`) and the ephemeris repo's docs to produce the complete unified file.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: write unified CLAUDE.md for monorepo"
```

---

### Task 3.3: Update .claude/ project config

**Files:**
- Create: `~/Projects/saturnis/.claude/settings.json` (or adapt from SPC-client)

**Step 1: Copy Claude config from SPC-client**

```bash
cp -r ~/Projects/SPC-client/.claude ~/Projects/saturnis/.claude
```

**Step 2: Update any paths in settings/skills that reference the old structure**

Review `.claude/` contents and update paths from `backend/`, `frontend/` to `apps/cassini/backend/`, `apps/cassini/frontend/`, etc.

**Step 3: Commit**

```bash
git add .claude/
git commit -m "chore: configure Claude for monorepo paths"
```

---

## Phase 4: Public Mirror Setup

### Task 4.1: Configure subtree remotes

**Step 1: Add public remotes**

```bash
cd ~/Projects/saturnis
git remote add public-cassini https://github.com/saturnis-io/cassini.git
git remote add public-ephemeris https://github.com/saturnis-io/ephemeris.git
```

> **Decision needed:** The current Cassini remote is `djbrandl/Cassini`. You may want to create `saturnis-io/cassini` as the public-facing repo. Same for ephemeris if it should be under the org.

**Step 2: Test subtree push (dry run)**

```bash
# This extracts apps/cassini/ history and pushes to the public repo
git subtree push --prefix=apps/cassini public-cassini main

# Same for ephemeris
git subtree push --prefix=apps/ephemeris public-ephemeris main
```

> **Warning:** First subtree push can be slow — it replays the full history. Subsequent pushes are incremental.

**Step 3: Verify public repos**

Check that `public-cassini` and `public-ephemeris` have the expected file structure (no `commercial/`, `packages/`, or `apps/website/` leakage).

**Step 4: Document the mirror workflow**

Add to root README or a `CONTRIBUTING.md`:

```markdown
## Public Mirrors

Cassini and Ephemeris are open-source. Their public repos are maintained via git subtree:

```bash
# Push Cassini changes to public repo
git subtree push --prefix=apps/cassini public-cassini main

# Push Ephemeris changes to public repo
git subtree push --prefix=apps/ephemeris public-ephemeris main

# Pull upstream contributions from public repo
git subtree pull --prefix=apps/cassini public-cassini main --squash
git subtree pull --prefix=apps/ephemeris public-ephemeris main --squash
```
```

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add public mirror workflow to README"
```

---

## Phase 5: Verify Everything Builds

### Task 5.1: Full build verification

**Step 1: Website**

```bash
cd ~/Projects/saturnis
pnpm --filter website build
```

Expected: Next.js production build succeeds.

**Step 2: Cassini frontend**

```bash
pnpm --filter frontend build
```

Expected: `tsc -b && vite build` succeeds.

**Step 3: Cassini backend**

```bash
cd apps/cassini/backend
python -m pytest tests/ -x -q 2>&1 | tail -20
```

Expected: Tests pass (or only pre-existing failures).

**Step 4: Ephemeris**

```bash
cd ~/Projects/saturnis/apps/ephemeris
cargo check
cargo test --workspace --lib
```

Expected: Compiles and unit tests pass.

**Step 5: Commit any fixups needed**

```bash
cd ~/Projects/saturnis
git add -A
git commit -m "fix: resolve build issues from monorepo migration"
```

(Skip if no fixups needed.)

---

## Phase 6: Create Private Remote

### Task 6.1: Push to private GitHub repo

**Step 1: Create the private repo on GitHub**

```bash
gh repo create saturnis-io/saturnis --private --description "Saturnis product monorepo"
```

> Or create manually at github.com if you prefer.

**Step 2: Add remote and push**

```bash
cd ~/Projects/saturnis
git remote add origin https://github.com/saturnis-io/saturnis.git
git push -u origin main
```

**Step 3: Verify**

```bash
gh repo view saturnis-io/saturnis
```

---

## Phase 7: Cleanup Old Repos

> **Do NOT execute this phase until you've verified the monorepo works for at least a few sessions.**

### Task 7.1: Archive original repos

**Step 1: Add deprecation notices**

In each original repo, update README.md to point to the monorepo:

```markdown
> **This repository has moved.** Development continues at [saturnis-io/saturnis](https://github.com/saturnis-io/saturnis). This repo is archived.
```

**Step 2: Archive on GitHub**

```bash
gh repo archive djbrandl/Cassini --yes
gh repo archive djbrandl/saturnis.io --yes
# gh repo archive saturnis-io/ephemeris --yes  # Only if it was separate
```

**Step 3: Update local Projects directory**

```bash
# Rename old directories to avoid confusion
mv ~/Projects/SPC-client ~/Projects/_archived_SPC-client
mv ~/Projects/saturnis.io ~/Projects/_archived_saturnis.io
mv ~/Projects/ephemeris ~/Projects/_archived_ephemeris
```

---

## Future Work (Not In This Migration)

These are tracked for later — do not attempt during migration:

1. **`packages/license-sdk/`** — JWT license generation (website) + validation (Python & Rust). Build when licensing feature work starts.
2. **`packages/brand/`** — Shared design tokens extracted from website's `globals.css` and Cassini's Tailwind config.
3. **`packages/shared-types/`** — TypeScript types for license API contracts between website and Cassini frontend.
4. **`commercial/`** — Cassini proprietary extensions (multi-plant, SSO, advanced reporting). Build when commercial features are implemented.
5. **CI/CD consolidation** — Root GitHub Actions that orchestrate builds for all three products, with path-based triggers (only build what changed).
6. **Vault expansion** — Add Ephemeris and Website notes to the Obsidian vault. Update `Session Start` dashboard for multi-product context.
7. **GitNexus re-index** — Run `/knowledge-graph` after migration to rebuild the knowledge graph with all three codebases.

---

## Risk Checklist

| Risk | Mitigation |
|------|-----------|
| Lost git history | `git subtree add` preserves history. Original repos archived, not deleted. |
| Broken builds after path changes | Phase 5 verifies all four build targets before pushing. |
| Accidental proprietary code in public mirror | CLAUDE.md rule + pre-push hook (add in CI/CD consolidation phase). |
| pnpm workspace conflicts | Website and Cassini frontend have no shared deps today — low risk. |
| Slow subtree push | First push is slow (one-time). Subsequent pushes are incremental. |
| Old bookmarks / muscle memory | Keep `~/Projects/SPC-client` as symlink to `~/Projects/saturnis/apps/cassini` temporarily. |

---

## Quick Reference: Post-Migration Paths

| What | Old Path | New Path |
|------|----------|----------|
| Cassini backend | `~/Projects/SPC-client/backend/` | `~/Projects/saturnis/apps/cassini/backend/` |
| Cassini frontend | `~/Projects/SPC-client/frontend/` | `~/Projects/saturnis/apps/cassini/frontend/` |
| Cassini bridge | `~/Projects/SPC-client/bridge/` | `~/Projects/saturnis/apps/cassini/bridge/` |
| Ephemeris crates | `~/Projects/ephemeris/crates/` | `~/Projects/saturnis/apps/ephemeris/crates/` |
| Website src | `~/Projects/saturnis.io/src/` | `~/Projects/saturnis/apps/website/src/` |
| Obsidian vault | `~/Projects/SPC-client/.vault/` | `~/Projects/saturnis/.vault/` |
| CLAUDE.md | `~/Projects/SPC-client/CLAUDE.md` | `~/Projects/saturnis/CLAUDE.md` |
| Lessons | `~/Projects/SPC-client/tasks/lessons.md` | `~/Projects/saturnis/tasks/lessons.md` |
