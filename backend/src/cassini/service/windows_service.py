"""Cassini Windows Service implementation.

Enables Cassini to run as a Windows Service that starts on boot,
restarts on failure, and is managed via the Services panel.

All pywin32 imports are guarded behind ``sys.platform == "win32"``
so this module can be safely imported on any platform for testing
the helper functions.
"""

from __future__ import annotations

import logging
import os
import sys

logger = logging.getLogger("cassini.service")


def get_service_data_dir() -> str:
    """Return the service data directory.

    Uses ``%PROGRAMDATA%\\Cassini`` on Windows, falling back to
    ``C:\\ProgramData\\Cassini`` if the environment variable is unset.
    """
    program_data = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
    return os.path.join(program_data, "Cassini")


def get_service_log_path() -> str:
    """Return the path to the service log file.

    Creates the log directory if it does not exist.

    Returns:
        Absolute path to ``{data_dir}\\logs\\cassini.log``.
    """
    log_dir = os.path.join(get_service_data_dir(), "logs")
    os.makedirs(log_dir, exist_ok=True)
    return os.path.join(log_dir, "cassini.log")


if sys.platform == "win32":
    import servicemanager  # type: ignore[import-untyped]
    import win32event  # type: ignore[import-untyped]
    import win32service  # type: ignore[import-untyped]
    import win32serviceutil  # type: ignore[import-untyped]

    class CassiniService(win32serviceutil.ServiceFramework):  # type: ignore[misc]
        """Windows Service that runs the Cassini SPC server.

        Lifecycle:
            1. ``SvcDoRun``: configure logging, change to data dir,
               run Alembic migrations, start uvicorn.
            2. ``SvcStop``: signal uvicorn to exit gracefully.
        """

        _svc_name_ = "CassiniSPC"
        _svc_display_name_ = "Cassini SPC"
        _svc_description_ = "Statistical Process Control server"

        def __init__(self, args: list[str]) -> None:
            super().__init__(args)
            self._stop_event = win32event.CreateEvent(None, 0, 0, None)
            self._server: object | None = None

        # -- Service lifecycle ------------------------------------------------

        def SvcStop(self) -> None:
            """Signal the service to stop gracefully."""
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            win32event.SetEvent(self._stop_event)

            # Ask uvicorn to shut down
            if self._server is not None:
                self._server.should_exit = True  # type: ignore[union-attr]

        def SvcDoRun(self) -> None:
            """Main service entry point."""
            servicemanager.LogMsg(
                servicemanager.EVENTLOG_INFORMATION_TYPE,
                servicemanager.PYS_SERVICE_STARTED,
                (self._svc_name_, ""),
            )

            try:
                self._run_server()
            except Exception:
                logger.exception("Cassini service encountered a fatal error")
            finally:
                servicemanager.LogMsg(
                    servicemanager.EVENTLOG_INFORMATION_TYPE,
                    servicemanager.PYS_SERVICE_STOPPED,
                    (self._svc_name_, ""),
                )

        # -- Internal ---------------------------------------------------------

        def _run_server(self) -> None:
            """Configure logging, run migrations, and start uvicorn."""
            import uvicorn

            # Set up file logging for the service
            log_path = get_service_log_path()
            logging.basicConfig(
                filename=log_path,
                level=logging.INFO,
                format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            )

            logger.info("Cassini service starting")

            # Change to the data directory so SQLite DBs and alembic
            # use a predictable location
            data_dir = get_service_data_dir()
            os.makedirs(data_dir, exist_ok=True)
            os.chdir(data_dir)
            logger.info("Working directory: %s", data_dir)

            # Run database migrations
            try:
                from cassini.cli.main import _run_migrations

                _run_migrations()
                logger.info("Database migrations complete")
            except Exception:
                logger.exception("Migration failed — cannot start server safely")
                self.ReportServiceStatus(win32service.SERVICE_STOPPED)
                return

            # Start uvicorn with a programmatic server so we can stop it
            config = uvicorn.Config(
                "cassini.main:app",
                host="127.0.0.1",
                port=8000,
                log_level="info",
            )
            server = uvicorn.Server(config)
            self._server = server
            server.run()

else:
    # Non-Windows stub so imports work for testing and type checking
    class CassiniService:  # type: ignore[no-redef]
        """Stub for non-Windows platforms.

        Provides class attributes so tests can validate metadata
        without requiring pywin32.
        """

        _svc_name_ = "CassiniSPC"
        _svc_display_name_ = "Cassini SPC"
        _svc_description_ = "Statistical Process Control server"
