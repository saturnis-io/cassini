# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Cassini SPC server.

Bundles the FastAPI backend, pre-built frontend SPA, Alembic
migrations, and the license public key into a single --onedir
distribution.

Build:
    cd apps/cassini/backend
    pyinstaller cassini-server.spec
"""

import os
from PyInstaller.utils.hooks import collect_submodules

# ---------------------------------------------------------------------------
# Paths — all relative to SPECPATH (the directory containing this .spec file)
# ---------------------------------------------------------------------------
SPEC_DIR = os.path.abspath(SPECPATH)
SRC_DIR = os.path.join(SPEC_DIR, "src")
FRONTEND_DIST = os.path.normpath(os.path.join(SPEC_DIR, "..", "..", "frontend", "dist"))
ALEMBIC_DIR = os.path.join(SPEC_DIR, "alembic")
ALEMBIC_INI = os.path.join(SPEC_DIR, "alembic.ini")
LICENSE_KEY = os.path.join(SRC_DIR, "cassini", "license_public_key.pem")
ICON_FILE = os.path.join(SPEC_DIR, "assets", "cassini.ico")

# ---------------------------------------------------------------------------
# Data files to bundle
# ---------------------------------------------------------------------------
datas = [
    (ALEMBIC_DIR, "alembic"),
    (ALEMBIC_INI, "."),
]

# Frontend dist — only include if already built
if os.path.isdir(FRONTEND_DIST):
    datas.append((FRONTEND_DIST, os.path.join("frontend", "dist")))

# License public key
if os.path.isfile(LICENSE_KEY):
    datas.append((LICENSE_KEY, "cassini"))

# ---------------------------------------------------------------------------
# Hidden imports — modules that PyInstaller cannot detect statically
# ---------------------------------------------------------------------------
hiddenimports = [
    # Uvicorn internals (string-based imports)
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.http.httptools_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.wsproto_impl",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    # Async SQLite driver
    "aiosqlite",
    # SQLAlchemy dialects (loaded by URL scheme at runtime)
    "sqlalchemy.dialects.sqlite",
    "sqlalchemy.dialects.sqlite.aiosqlite",
    "sqlalchemy.dialects.postgresql",
    "sqlalchemy.dialects.mysql",
    "sqlalchemy.dialects.mssql",
    # WebSocket / Socket.IO async driver
    "engineio.async_drivers.aiohttp",
    # Click (CLI framework — imports plugins dynamically)
    "click",
    # Starlette internals used by FastAPI
    "starlette.responses",
    "starlette.staticfiles",
    "starlette.middleware",
    "starlette.middleware.cors",
    # Alembic runtime (used by migration command)
    "alembic",
    "alembic.config",
    "alembic.command",
    "alembic.runtime.migration",
    "alembic.script",
    # Pydantic v2 core
    "pydantic",
    "pydantic_core",
    "pydantic_settings",
    # structlog (lazy imports)
    "structlog",
    "structlog.dev",
    "structlog.processors",
    # slowapi / limits
    "slowapi",
    "limits",
    "limits.storage",
    # Cryptography (cffi backend)
    "cryptography",
    "cryptography.hazmat",
    "cryptography.hazmat.primitives",
    "cryptography.hazmat.primitives.asymmetric",
    "cryptography.hazmat.primitives.asymmetric.ed25519",
    # bcrypt / argon2
    "bcrypt",
    "argon2",
    "argon2.low_level",
    # python-multipart (used by FastAPI for form uploads)
    "multipart",
    # httpx (used internally)
    "httpx",
    # Legacy openspc shim (old Alembic migrations import from openspc.*)
    "openspc",
    # Windows service (optional — only present on Windows)
    "win32serviceutil",
    "win32service",
    "win32event",
    "servicemanager",
    # numpy / scipy (SPC engine)
    "numpy",
    "scipy",
    "scipy.stats",
    "scipy.special",
]

# Collect ALL cassini submodules (FastAPI routers are imported dynamically
# by main.py and commercial activation; PyInstaller cannot trace them)
hiddenimports += collect_submodules("cassini")
hiddenimports += collect_submodules("openspc")

# ---------------------------------------------------------------------------
# Excludes — large packages not needed at runtime
# ---------------------------------------------------------------------------
excludes = [
    "tkinter",
    "matplotlib",
    "IPython",
    "notebook",
    "sphinx",
    "pytest",
    "hypothesis",
    "mypy",
    "ruff",
    "_pytest",
]

# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------
a = Analysis(
    [os.path.join(SRC_DIR, "cassini", "cli", "main.py")],
    pathex=[SRC_DIR],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="cassini-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    icon=ICON_FILE if os.path.isfile(ICON_FILE) else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="cassini-server",
)
