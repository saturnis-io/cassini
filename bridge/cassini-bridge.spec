# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Cassini Bridge agent.

Standalone CLI that bridges RS-232/USB serial gages to MQTT topics
for ingestion by the Cassini SPC server.

Build:
    cd apps/cassini/bridge
    pyinstaller cassini-bridge.spec
"""

import os
from PyInstaller.utils.hooks import collect_submodules

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SPEC_DIR = os.path.abspath(SPECPATH)
SRC_DIR = os.path.join(SPEC_DIR, "src")
# Reuse the server icon if available (bridge ships inside the same installer)
ICON_FILE = os.path.normpath(os.path.join(SPEC_DIR, "..", "backend", "assets", "cassini.ico"))

# ---------------------------------------------------------------------------
# Hidden imports
# ---------------------------------------------------------------------------
hiddenimports = [
    # pyserial internals
    "serial",
    "serial.tools",
    "serial.tools.list_ports",
    "serial.tools.list_ports_common",
    "serial.tools.list_ports_windows",
    "serial.urlhandler",
    "serial.urlhandler.protocol_hwgrep",
    "serial.urlhandler.protocol_socket",
    # paho-mqtt v2
    "paho",
    "paho.mqtt",
    "paho.mqtt.client",
    "paho.mqtt.publish",
    # httpx (used for API key validation / config fetch)
    "httpx",
    # PyYAML (local config file parsing)
    "yaml",
]

# Collect all cassini_bridge submodules
hiddenimports += collect_submodules("cassini_bridge")

# ---------------------------------------------------------------------------
# Excludes
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
    "numpy",
    "scipy",
]

# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------
a = Analysis(
    [os.path.join(SRC_DIR, "cassini_bridge", "cli.py")],
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
    name="cassini-bridge",
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
    name="cassini-bridge",
)
