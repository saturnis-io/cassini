# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Cassini system tray companion.

Lightweight windowed app that monitors the Cassini server status via
its health endpoint and provides quick-access service controls. Does
NOT embed the server — just the tray icon and its dependencies.

Build:
    cd apps/cassini/backend
    pyinstaller cassini-tray.spec
"""

import os
from PyInstaller.utils.hooks import collect_submodules

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SPEC_DIR = os.path.abspath(SPECPATH)
SRC_DIR = os.path.join(SPEC_DIR, "src")
ICON_FILE = os.path.join(SPEC_DIR, "assets", "cassini.ico")

# ---------------------------------------------------------------------------
# Hidden imports
# ---------------------------------------------------------------------------
hiddenimports = [
    # pystray backend (Windows)
    "pystray._win32",
    # Pillow — used by tray icons.py for runtime image generation
    "PIL",
    "PIL.Image",
    "PIL.ImageDraw",
    # Windows service utilities (tray can start/stop the service)
    "win32serviceutil",
    "win32service",
    "win32event",
    "servicemanager",
]

# Collect the tray subpackage and service helpers
hiddenimports += collect_submodules("cassini.tray")
hiddenimports += collect_submodules("cassini.service")

# ---------------------------------------------------------------------------
# Excludes — strip everything the tray does not need
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
    # Heavy backend deps the tray never touches
    "numpy",
    "scipy",
    "sqlalchemy",
    "alembic",
    "uvicorn",
    "fastapi",
    "starlette",
    "pydantic",
    "httpx",
    "cryptography",
    "bcrypt",
    "argon2",
]

# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------
a = Analysis(
    [os.path.join(SRC_DIR, "cassini", "tray", "__main__.py")],
    pathex=[SRC_DIR],
    binaries=[],
    datas=[],
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
    name="cassini-tray",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # No console window — windowed tray app
    icon=ICON_FILE if os.path.isfile(ICON_FILE) else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="cassini-tray",
)
