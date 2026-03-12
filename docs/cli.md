# CLI Reference

The `cassini` command is available after installing via pip (`pip install -e .`) or the Windows Installer (if PATH was added). These commands work on Windows, macOS, and Linux unless noted.

## Commands

| Command | Description | Platform |
|---------|-------------|----------|
| `cassini serve` | Start server (runs migrations first) | All |
| `cassini serve --no-migrate` | Start server, skip migrations | All |
| `cassini serve --host 0.0.0.0 --port 9000` | Custom host and port | All |
| `cassini migrate` | Run database migrations only | All |
| `cassini create-admin` | Create admin user (interactive) | All |
| `cassini version` | Print version and build info | All |
| `cassini check` | Validate config, database, license | All |
| `cassini tray` | Launch system tray / menu bar companion | All (desktop) |
| `cassini service install` | Install as Windows Service | Windows |
| `cassini service uninstall` | Remove Windows Service | Windows |
| `cassini service start` | Start the Windows Service | Windows |
| `cassini service stop` | Stop the Windows Service | Windows |

## Behavior

`cassini serve` auto-migrates the database before starting. Use `--no-migrate` if migrations are managed separately (e.g., in a CI/CD pipeline).

Host and port default to values in `cassini.toml` (see [Configuration](configuration.md)), falling back to `127.0.0.1:8000`.

## Background Service

| Platform | Method |
|----------|--------|
| **Windows** | `cassini service install` (built-in) |
| **Linux** | systemd unit file — see [Deployment](deployment.md#linux-systemd) |
| **macOS** | launchd plist — see [Getting Started](getting-started.md#running-in-background) |

> **Linux/macOS tip:** Use `systemd` or `launchd` to run Cassini as a background service. See [Production Deployment](deployment.md) for ready-made service files.
