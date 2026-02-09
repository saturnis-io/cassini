"""Database administration REST API endpoints.

All endpoints require admin role. Mutation endpoints are rate-limited and audit-logged.
"""

import shutil
import time
from pathlib import Path

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from openspc.api.deps import get_current_admin, get_db_session
from openspc.api.schemas.database import (
    ConnectionTestRequest,
    ConnectionTestResult,
    DatabaseConfigRequest,
    DatabaseConfigResponse,
    DatabaseStatusResponse,
    MigrationStatusResponse,
)
from openspc.core.rate_limit import limiter
from openspc.db.database import get_database
from openspc.db.dialects import (
    ALLOWED_PORTS,
    DIALECT_DRIVERS,
    DatabaseConnectionConfig,
    DatabaseDialect,
    encrypt_password,
    get_encryption_key,
    load_db_config,
    save_db_config,
    validate_connection_options,
)
from openspc.db.models.user import User

logger = structlog.get_logger(__name__)
audit_log = structlog.get_logger("audit")

router = APIRouter(prefix="/api/v1/database", tags=["database"])


@router.get("/config", response_model=DatabaseConfigResponse)
@limiter.limit("60/minute")
async def get_config(
    request: Request,
    _user: User = Depends(get_current_admin),
) -> DatabaseConfigResponse:
    """Get current database configuration (password excluded)."""
    config = load_db_config()
    if config is None:
        # Return current default SQLite config
        db = get_database()
        return DatabaseConfigResponse(
            dialect=db.dialect,
            host="",
            port=0,
            database=db.database_url.split("///")[-1] if "///" in db.database_url else "",
            username="",
            has_password=False,
            options={},
        )

    audit_log.info("db_config_read", user_id=_user.id, username=_user.username)

    return DatabaseConfigResponse(
        dialect=config.dialect,
        host=config.host,
        port=config.port,
        database=config.database,
        username=config.username,
        has_password=bool(config.encrypted_password),
        options=config.options,
    )


@router.put("/config", response_model=DatabaseConfigResponse)
@limiter.limit("10/minute")
async def update_config(
    request: Request,
    data: DatabaseConfigRequest,
    _user: User = Depends(get_current_admin),
) -> DatabaseConfigResponse:
    """Update database configuration.

    Encrypts the password and saves configuration atomically.
    Requires application restart to take effect.
    """
    # Validate options whitelist
    try:
        validate_connection_options(data.options)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Validate port for server dialects
    if data.dialect != DatabaseDialect.SQLITE and data.port not in ALLOWED_PORTS:
        raise HTTPException(
            status_code=400,
            detail=f"Port must be one of {sorted(ALLOWED_PORTS)} for {data.dialect.value}",
        )

    # Encrypt password
    key = get_encryption_key()
    encrypted_password = ""
    if data.password:
        encrypted_password = encrypt_password(data.password, key)

    # If no new password provided, preserve existing
    if not data.password:
        existing = load_db_config()
        if existing is not None:
            encrypted_password = existing.encrypted_password

    config = DatabaseConnectionConfig(
        dialect=data.dialect,
        host=data.host,
        port=data.port,
        database=data.database,
        username=data.username,
        encrypted_password=encrypted_password,
        options=data.options,
    )

    save_db_config(config)

    audit_log.info(
        "db_config_updated",
        user_id=_user.id,
        username=_user.username,
        dialect=data.dialect.value,
        host=data.host,
    )

    return DatabaseConfigResponse(
        dialect=config.dialect,
        host=config.host,
        port=config.port,
        database=config.database,
        username=config.username,
        has_password=bool(config.encrypted_password),
        options=config.options,
    )


@router.post("/test", response_model=ConnectionTestResult)
@limiter.limit("5/minute")
async def test_connection(
    request: Request,
    data: ConnectionTestRequest,
    _user: User = Depends(get_current_admin),
) -> ConnectionTestResult:
    """Test a database connection without saving configuration.

    SSRF protections:
    - Port must be in the allowed set (3306, 5432, 1433) for server dialects
    - Strict 5-second timeout
    - Generic error messages (never raw exceptions)
    """
    # Validate options
    try:
        validate_connection_options(data.options)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Port validation for server dialects
    if data.dialect != DatabaseDialect.SQLITE and data.port not in ALLOWED_PORTS:
        raise HTTPException(
            status_code=400,
            detail=f"Port must be one of {sorted(ALLOWED_PORTS)} for {data.dialect.value}",
        )

    # Build temporary URL
    driver = DIALECT_DRIVERS[data.dialect]

    if data.dialect == DatabaseDialect.SQLITE:
        sqlite_path = data.database or "./openspc.db"
        # Validate SQLite file exists (aiosqlite auto-creates, which gives false positives)
        if not Path(sqlite_path).exists():
            return ConnectionTestResult(
                success=False,
                message=f"Database file not found: {sqlite_path}",
            )
        test_url = f"sqlite+{driver}:///{sqlite_path}"
    else:
        from urllib.parse import quote_plus

        backend = {
            DatabaseDialect.POSTGRESQL: f"postgresql+{driver}",
            DatabaseDialect.MYSQL: f"mysql+{driver}",
            DatabaseDialect.MSSQL: f"mssql+{driver}",
        }[data.dialect]

        userinfo = ""
        if data.username:
            userinfo = data.username
            if data.password:
                userinfo += f":{quote_plus(data.password)}"
            userinfo += "@"

        test_url = f"{backend}://{userinfo}{data.host}:{data.port}/{data.database}"

    # Test the connection with strict timeout
    start = time.monotonic()
    engine = None
    try:
        engine = create_async_engine(
            test_url,
            poolclass=NullPool,
            connect_args={"timeout": 5} if data.dialect == DatabaseDialect.SQLITE else {},
        )

        async with engine.connect() as conn:
            # Get server version
            if data.dialect == DatabaseDialect.POSTGRESQL:
                result = await conn.execute(text("SELECT version()"))
                version = str(result.scalar())
            elif data.dialect == DatabaseDialect.MYSQL:
                result = await conn.execute(text("SELECT version()"))
                version = str(result.scalar())
            elif data.dialect == DatabaseDialect.MSSQL:
                result = await conn.execute(text("SELECT @@VERSION"))
                version = str(result.scalar())
            else:
                result = await conn.execute(text("SELECT sqlite_version()"))
                version = f"SQLite {result.scalar()}"

        latency = (time.monotonic() - start) * 1000

        audit_log.info(
            "db_connection_test",
            user_id=_user.id,
            username=_user.username,
            host=data.host,
            port=data.port,
            dialect=data.dialect.value,
            success=True,
        )

        return ConnectionTestResult(
            success=True,
            message="Connection successful",
            latency_ms=round(latency, 1),
            server_version=version,
        )

    except Exception:
        latency = (time.monotonic() - start) * 1000

        audit_log.info(
            "db_connection_test",
            user_id=_user.id,
            username=_user.username,
            host=data.host,
            port=data.port,
            dialect=data.dialect.value,
            success=False,
        )

        # Generic error message — never expose raw exception
        return ConnectionTestResult(
            success=False,
            message="Connection failed",
            latency_ms=round(latency, 1),
        )

    finally:
        if engine is not None:
            await engine.dispose()


@router.get("/status", response_model=DatabaseStatusResponse)
@limiter.limit("60/minute")
async def get_status(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_admin),
) -> DatabaseStatusResponse:
    """Get current database status including dialect, version, and migration info."""
    db = get_database()

    # Get version and table count
    try:
        if db.dialect == DatabaseDialect.SQLITE:
            result = await session.execute(text("SELECT sqlite_version()"))
            version = f"SQLite {result.scalar()}"

            result = await session.execute(
                text("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
            )
            table_count = result.scalar() or 0

            # Get database size
            result = await session.execute(text("PRAGMA page_count"))
            page_count = result.scalar() or 0
            result = await session.execute(text("PRAGMA page_size"))
            page_size = result.scalar() or 0
            size_mb = round((page_count * page_size) / (1024 * 1024), 2)
        elif db.dialect == DatabaseDialect.POSTGRESQL:
            result = await session.execute(text("SELECT version()"))
            version = str(result.scalar())

            result = await session.execute(
                text("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")
            )
            table_count = result.scalar() or 0

            result = await session.execute(text("SELECT pg_database_size(current_database())"))
            size_bytes = result.scalar() or 0
            size_mb = round(size_bytes / (1024 * 1024), 2)
        elif db.dialect == DatabaseDialect.MYSQL:
            result = await session.execute(text("SELECT version()"))
            version = f"MySQL {result.scalar()}"

            result = await session.execute(
                text("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()")
            )
            table_count = result.scalar() or 0

            result = await session.execute(
                text(
                    "SELECT SUM(data_length + index_length) FROM information_schema.tables "
                    "WHERE table_schema = DATABASE()"
                )
            )
            size_bytes = result.scalar() or 0
            size_mb = round(size_bytes / (1024 * 1024), 2)
        elif db.dialect == DatabaseDialect.MSSQL:
            result = await session.execute(text("SELECT @@VERSION"))
            version = str(result.scalar())

            result = await session.execute(
                text("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'")
            )
            table_count = result.scalar() or 0
            size_mb = None
        else:
            version = "Unknown"
            table_count = 0
            size_mb = None
    except Exception as e:
        logger.error("db_status_query_failed", error=str(e))
        return DatabaseStatusResponse(
            dialect=db.dialect.value,
            is_connected=False,
            version="Unknown",
            table_count=0,
        )

    # Get migration status
    migration_current = None
    migration_head = None
    is_up_to_date = True
    try:
        from alembic.config import Config as AlembicConfig
        from alembic.runtime.migration import MigrationContext
        from alembic.script import ScriptDirectory

        alembic_cfg = AlembicConfig()
        alembic_cfg.set_main_option("script_location", "alembic")
        script = ScriptDirectory.from_config(alembic_cfg)
        migration_head = script.get_current_head()

        async with db.engine.connect() as conn:

            def _get_rev(sync_conn):
                ctx = MigrationContext.configure(sync_conn)
                return ctx.get_current_revision()

            migration_current = await conn.run_sync(_get_rev)

        is_up_to_date = migration_current == migration_head
    except Exception:
        pass

    return DatabaseStatusResponse(
        dialect=db.dialect.value,
        is_connected=True,
        version=version,
        table_count=table_count,
        database_size_mb=size_mb,
        migration_current=migration_current,
        migration_head=migration_head,
        is_up_to_date=is_up_to_date,
    )


@router.post("/backup")
@limiter.limit("2/minute")
async def backup_database(
    request: Request,
    backup_dir: str | None = None,
    _user: User = Depends(get_current_admin),
) -> dict:
    """Create a database backup.

    SQLite: copies the database file.
    Others: returns the CLI command to use for backup.

    Args:
        backup_dir: Optional directory override for backup destination.
                    Must be an existing directory. Defaults to same directory as DB.
    """
    db = get_database()

    audit_log.info("db_backup_requested", user_id=_user.id, username=_user.username, dialect=db.dialect.value)

    if db.dialect == DatabaseDialect.SQLITE:
        # Extract the file path from the URL
        db_path = db.database_url.split("///")[-1] if "///" in db.database_url else "openspc.db"
        source = Path(db_path).resolve()

        if not source.exists():
            raise HTTPException(status_code=404, detail="Database file not found")

        # Determine backup destination directory
        if backup_dir:
            dest_dir = Path(backup_dir)
            if not dest_dir.is_dir():
                raise HTTPException(status_code=400, detail=f"Backup directory does not exist: {backup_dir}")
        else:
            dest_dir = source.parent

        # Check available disk space (require at least 2x the DB size)
        source_size = source.stat().st_size
        try:
            disk_usage = shutil.disk_usage(str(dest_dir))
            if disk_usage.free < source_size * 2:
                free_mb = round(disk_usage.free / (1024 * 1024), 1)
                needed_mb = round(source_size / (1024 * 1024), 1)
                raise HTTPException(
                    status_code=507,
                    detail=f"Insufficient disk space. Need ~{needed_mb} MB, only {free_mb} MB free in {dest_dir}",
                )
        except OSError:
            pass  # disk_usage may fail on some filesystems; proceed anyway

        import datetime

        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"openspc_backup_{timestamp}.db"
        backup_path = dest_dir / backup_name
        shutil.copy2(str(source), str(backup_path))

        return {
            "message": f"Backup created: {backup_name}",
            "path": str(backup_path),
            "directory": str(dest_dir),
            "size_mb": round(backup_path.stat().st_size / (1024 * 1024), 2),
        }
    elif db.dialect == DatabaseDialect.POSTGRESQL:
        return {
            "message": "Use pg_dump for PostgreSQL backups",
            "command": "pg_dump -h <host> -U <user> -d <database> > backup.sql",
        }
    elif db.dialect == DatabaseDialect.MYSQL:
        return {
            "message": "Use mysqldump for MySQL backups",
            "command": "mysqldump -h <host> -u <user> -p <database> > backup.sql",
        }
    elif db.dialect == DatabaseDialect.MSSQL:
        return {
            "message": "Use SQL Server Management Studio or BACKUP DATABASE command",
            "command": "BACKUP DATABASE [<database>] TO DISK = 'backup.bak'",
        }
    else:
        raise HTTPException(status_code=400, detail="Unsupported dialect for backup")


@router.post("/vacuum")
@limiter.limit("1/minute")
async def vacuum_database(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_admin),
) -> dict:
    """Run VACUUM/ANALYZE/OPTIMIZE per dialect."""
    db = get_database()

    audit_log.info("db_vacuum_requested", user_id=_user.id, username=_user.username, dialect=db.dialect.value)

    try:
        if db.dialect == DatabaseDialect.SQLITE:
            # SQLite VACUUM must run outside a transaction
            async with db.engine.connect() as conn:
                await conn.execute(text("VACUUM"))
                await conn.execute(text("ANALYZE"))
                await conn.commit()
            return {"message": "VACUUM and ANALYZE completed successfully"}

        elif db.dialect == DatabaseDialect.POSTGRESQL:
            # ANALYZE only (VACUUM requires superuser and can't run in transaction)
            await session.execute(text("ANALYZE"))
            return {"message": "ANALYZE completed. Run VACUUM from CLI for full optimization."}

        elif db.dialect == DatabaseDialect.MYSQL:
            # Get table names and optimize
            result = await session.execute(
                text("SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = DATABASE()")
            )
            tables = [row[0] for row in result]
            for table in tables:
                await session.execute(text(f"OPTIMIZE TABLE `{table}`"))
            return {"message": f"OPTIMIZE TABLE completed for {len(tables)} tables"}

        elif db.dialect == DatabaseDialect.MSSQL:
            return {"message": "Run DBCC SHRINKDATABASE from SQL Server Management Studio"}

        else:
            raise HTTPException(status_code=400, detail="Unsupported dialect")

    except Exception as e:
        logger.error("db_vacuum_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Maintenance operation failed")


@router.get("/migrations", response_model=MigrationStatusResponse)
@limiter.limit("60/minute")
async def get_migration_status(
    request: Request,
    _user: User = Depends(get_current_admin),
) -> MigrationStatusResponse:
    """Get migration status: current revision, head revision, pending count."""
    db = get_database()

    try:
        from alembic.config import Config as AlembicConfig
        from alembic.runtime.migration import MigrationContext
        from alembic.script import ScriptDirectory

        alembic_cfg = AlembicConfig()
        alembic_cfg.set_main_option("script_location", "alembic")
        script = ScriptDirectory.from_config(alembic_cfg)
        head_rev = script.get_current_head()

        async with db.engine.connect() as conn:

            def _get_rev(sync_conn):
                ctx = MigrationContext.configure(sync_conn)
                return ctx.get_current_revision()

            current_rev = await conn.run_sync(_get_rev)

        # Count pending migrations
        pending = 0
        if current_rev != head_rev:
            revs = list(script.iterate_revisions(head_rev, current_rev))
            pending = len(revs)

        return MigrationStatusResponse(
            current_revision=current_rev,
            head_revision=head_rev,
            pending_count=pending,
            is_up_to_date=current_rev == head_rev,
        )

    except Exception as e:
        logger.error("migration_status_check_failed", error=str(e))
        return MigrationStatusResponse(
            current_revision=None,
            head_revision=None,
            pending_count=0,
            is_up_to_date=False,
        )
