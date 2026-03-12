"""Entry point for the frozen tray executable.

This module is used as the PyInstaller entry point for cassini-tray.
It avoids importing the full CLI (which pulls in uvicorn, FastAPI,
SQLAlchemy, etc.) and instead launches the tray app directly.

Usage (frozen):
    cassini-tray.exe            # defaults: localhost:8000
    cassini-tray.exe 9000       # custom port
"""

from __future__ import annotations

import sys

from cassini.tray.app import CassiniTray


def main() -> None:
    """Launch the Cassini tray app with optional port argument."""
    host = "localhost"
    port = 8000

    # Minimal arg parsing — no click dependency needed
    args = sys.argv[1:]
    if args:
        try:
            port = int(args[0])
        except ValueError:
            host = args[0]
        if len(args) > 1:
            try:
                port = int(args[1])
            except ValueError:
                pass

    app = CassiniTray(host=host, port=port)
    app.run()


if __name__ == "__main__":
    main()
