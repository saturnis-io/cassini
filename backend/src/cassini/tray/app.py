"""Cassini system tray companion app.

Provides a pystray-based system tray icon that monitors the Cassini
server health and offers quick actions (open browser, control service,
view logs). Independent from the Windows Service — closing the tray
app does NOT stop the Cassini server.

All network I/O uses ``urllib.request`` to avoid adding dependencies.
pywin32 imports for service control are lazy (Windows-only).
"""

from __future__ import annotations

import logging
import os
import socket
import subprocess
import sys
import threading
import urllib.request
import webbrowser

import pystray

from cassini.tray.icons import create_status_icon

try:
    from importlib.metadata import version as _pkg_version

    __version__ = _pkg_version("cassini")
except Exception:
    __version__ = "0.0.9"

logger = logging.getLogger("cassini.tray")

# Health check timeout in seconds
_HEALTH_TIMEOUT = 3

# Polling interval in seconds
_POLL_INTERVAL = 5


class CassiniTray:
    """System tray companion for the Cassini SPC server.

    Polls the health endpoint at ``http://{host}:{port}/api/v1/health``
    and updates the tray icon color accordingly. Provides a context
    menu for common operations.

    Args:
        host: The hostname where Cassini is running.
        port: The port where Cassini is listening.
    """

    def __init__(self, host: str = "localhost", port: int = 8000) -> None:
        self.host = host
        self.port = port
        self.base_url = f"http://{host}:{port}"
        self.status = "unknown"
        self.icon: pystray.Icon | None = None
        self._stop_polling = threading.Event()
        self._port_conflict_notified = False

    # -- Health check -----------------------------------------------------

    def check_health(self) -> str:
        """Poll GET /api/v1/health and return the status string.

        Returns:
            "running" if the endpoint responds with HTTP 200,
            "stopped" otherwise.
        """
        url = f"{self.base_url}/api/v1/health"
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=_HEALTH_TIMEOUT) as resp:
                if resp.status == 200:
                    return "running"
                return "stopped"
        except Exception:
            return "stopped"

    # -- Browser ----------------------------------------------------------

    def open_browser(self) -> None:
        """Open the default browser to the Cassini web UI."""
        webbrowser.open(self.base_url)

    # -- Service control --------------------------------------------------

    def _start_service(self) -> None:
        """Start the Cassini Windows Service."""
        try:
            import win32serviceutil  # type: ignore[import-untyped]

            from cassini.service.windows_service import CassiniService

            win32serviceutil.StartService(CassiniService._svc_name_)
            self.status = "starting"
            self._update_icon()
        except Exception:
            logger.exception("Failed to start service")

    def _stop_service(self) -> None:
        """Stop the Cassini Windows Service."""
        try:
            import win32serviceutil  # type: ignore[import-untyped]

            from cassini.service.windows_service import CassiniService

            win32serviceutil.StopService(CassiniService._svc_name_)
        except Exception:
            logger.exception("Failed to stop service")

    def _restart_service(self) -> None:
        """Restart the Cassini Windows Service."""
        try:
            import win32serviceutil  # type: ignore[import-untyped]

            from cassini.service.windows_service import CassiniService

            win32serviceutil.RestartService(CassiniService._svc_name_)
            self.status = "starting"
            self._update_icon()
        except Exception:
            logger.exception("Failed to restart service")

    # -- Utilities --------------------------------------------------------

    def _open_logs(self) -> None:
        """Open the Cassini log file in the default text editor."""
        try:
            from cassini.service.windows_service import get_service_log_path

            log_path = get_service_log_path()
            if os.path.exists(log_path):
                if sys.platform == "win32":
                    os.startfile(log_path)  # type: ignore[attr-defined]
                else:
                    subprocess.Popen(["xdg-open", log_path])
            else:
                logger.warning("Log file not found: %s", log_path)
        except Exception:
            logger.exception("Failed to open logs")

    def _open_data_folder(self) -> None:
        """Open the Cassini data folder in the file explorer."""
        try:
            from cassini.service.windows_service import get_service_data_dir

            data_dir = get_service_data_dir()
            os.makedirs(data_dir, exist_ok=True)
            if sys.platform == "win32":
                os.startfile(data_dir)  # type: ignore[attr-defined]
            else:
                subprocess.Popen(["xdg-open", data_dir])
        except Exception:
            logger.exception("Failed to open data folder")

    def _open_settings(self) -> None:
        """Open cassini.toml in the default text editor.

        If no config file exists yet, creates a minimal default at the
        ProgramData location before opening it.
        """
        try:
            from cassini.core.toml_config import find_config_file
            from cassini.service.windows_service import get_service_data_dir

            config_path = find_config_file()
            if config_path is None:
                # Create default config at ProgramData location
                data_dir = get_service_data_dir()
                config_path = os.path.join(data_dir, "cassini.toml")
                os.makedirs(data_dir, exist_ok=True)
                with open(config_path, "w") as f:
                    f.write("# Cassini SPC Configuration\n")
                    f.write("# See https://saturnis.io/docs/configuration\n\n")
                    f.write("[server]\n")
                    f.write('host = "0.0.0.0"\n')
                    f.write("port = 8000\n")

            subprocess.Popen(["notepad.exe", config_path])
        except Exception:
            logger.exception("Failed to open settings")

    def _check_port_conflict(self) -> bool:
        """Check if the configured port is in use by something other than Cassini.

        Attempts to connect to the port. If the connection succeeds but the
        Cassini health check has failed, another application is occupying
        the port.

        Returns:
            True if the port is occupied by a non-Cassini process.
        """
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(1)
                s.connect((self.host, self.port))
                # Port is in use but Cassini health check failed
                return True
        except OSError:
            # Port is not in use at all
            return False

    def _check_updates(self) -> None:
        """Check for updates by pinging saturnis.io/api/version.

        Runs in a background thread and fails silently on error.
        """

        def _check() -> None:
            try:
                url = "https://saturnis.io/api/version"
                req = urllib.request.Request(url, method="GET")
                with urllib.request.urlopen(req, timeout=5) as resp:
                    if resp.status == 200:
                        import json

                        data = json.loads(resp.read().decode())
                        latest = data.get("version", "unknown")
                        if latest != __version__:
                            logger.info(
                                "Update available: %s (current: %s)",
                                latest,
                                __version__,
                            )
                            # Open the download page in browser
                            webbrowser.open("https://saturnis.io/cassini/download")
                        else:
                            logger.info("Cassini is up to date (%s)", __version__)
            except Exception:
                # Fail silently — update checks are best-effort
                logger.debug("Update check failed", exc_info=True)

        thread = threading.Thread(target=_check, daemon=True)
        thread.start()

    # -- Tray lifecycle ---------------------------------------------------

    def on_quit(self) -> None:
        """Stop polling and remove the tray icon. Does NOT stop the service."""
        self._stop_polling.set()
        if self.icon is not None:
            self.icon.stop()

    def _update_icon(self) -> None:
        """Update the tray icon image and tooltip to reflect current status."""
        if self.icon is not None:
            self.icon.icon = create_status_icon(self.status)
            self.icon.title = f"Cassini SPC — {self.status.title()}"

    def _poll_loop(self) -> None:
        """Background thread that polls health every few seconds."""
        while not self._stop_polling.is_set():
            new_status = self.check_health()
            if new_status != self.status:
                old_status = self.status
                self.status = new_status
                self._update_icon()

                # Detect port conflict when transitioning to stopped
                if new_status == "stopped" and old_status != "stopped":
                    if self._check_port_conflict() and not self._port_conflict_notified:
                        self._port_conflict_notified = True
                        if self.icon:
                            self.icon.notify(
                                f"Port {self.port} is in use by another application.\n"
                                "Right-click tray icon > Settings to change the port.",
                                "Cassini Cannot Start",
                            )

            # Reset conflict flag when server is running again
            if new_status == "running":
                self._port_conflict_notified = False

            self._stop_polling.wait(_POLL_INTERVAL)

    def _build_menu(self) -> pystray.Menu:
        """Build the tray context menu.

        Returns:
            A pystray.Menu with the standard set of operations.
        """
        return pystray.Menu(
            pystray.MenuItem(
                f"Cassini SPC v{__version__}",
                action=None,
                enabled=False,
            ),
            pystray.MenuItem(
                lambda _item: f"Status: {self.status.title()}",
                action=None,
                enabled=False,
            ),
            pystray.MenuItem(
                "Open Cassini",
                lambda: self.open_browser(),
                default=True,
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Start Service", lambda: self._start_service()),
            pystray.MenuItem("Stop Service", lambda: self._stop_service()),
            pystray.MenuItem("Restart Service", lambda: self._restart_service()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("View Logs", lambda: self._open_logs()),
            pystray.MenuItem("Open Data Folder", lambda: self._open_data_folder()),
            pystray.MenuItem("Settings", lambda: self._open_settings()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Check for Updates", lambda: self._check_updates()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Quit", lambda: self.on_quit()),
        )

    def run(self) -> None:
        """Start the tray app. Blocks until quit.

        Creates the tray icon, starts the health polling thread,
        and enters the pystray event loop.
        """
        self.icon = pystray.Icon(
            name="cassini-spc",
            icon=create_status_icon(self.status),
            title=f"Cassini SPC — {self.status.title()}",
            menu=self._build_menu(),
        )

        # Start background health polling
        poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        poll_thread.start()

        # Blocks until icon.stop() is called
        self.icon.run()
