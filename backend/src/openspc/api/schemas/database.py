"""Pydantic schemas for database administration endpoints."""

import re
from typing import Optional

from pydantic import BaseModel, field_validator

from openspc.db.dialects import DatabaseDialect


class DatabaseConfigRequest(BaseModel):
    """Request schema for updating database configuration."""

    dialect: DatabaseDialect
    host: str = ""
    port: int = 0
    database: str = ""
    username: str = ""
    password: str = ""  # Plaintext — encrypted before storage, never logged
    options: dict[str, str | int | bool] = {}

    @field_validator("host")
    @classmethod
    def validate_host(cls, v: str) -> str:
        if v and not re.match(r"^[a-zA-Z0-9._-]+$", v):
            raise ValueError("Invalid hostname")
        return v

    @field_validator("database")
    @classmethod
    def validate_database(cls, v: str) -> str:
        if v and not re.match(r"^[a-zA-Z0-9_./-]+$", v):
            raise ValueError("Invalid database name")
        return v

    @field_validator("port")
    @classmethod
    def validate_port(cls, v: int, info) -> int:
        # Port validation is skipped for SQLite (handled at endpoint level)
        return v


class DatabaseConfigResponse(BaseModel):
    """Response schema for database configuration (password excluded)."""

    dialect: DatabaseDialect
    host: str
    port: int
    database: str
    username: str
    has_password: bool
    options: dict[str, str | int | bool]


class DatabaseStatusResponse(BaseModel):
    """Response schema for database status information."""

    dialect: str
    is_connected: bool
    version: str
    table_count: int
    database_size_mb: Optional[float] = None
    migration_current: Optional[str] = None
    migration_head: Optional[str] = None
    is_up_to_date: bool = True


class ConnectionTestRequest(BaseModel):
    """Request schema for testing a database connection."""

    dialect: DatabaseDialect
    host: str = ""
    port: int = 0
    database: str = ""
    username: str = ""
    password: str = ""
    options: dict[str, str | int | bool] = {}

    @field_validator("host")
    @classmethod
    def validate_host(cls, v: str) -> str:
        if v and not re.match(r"^[a-zA-Z0-9._-]+$", v):
            raise ValueError("Invalid hostname")
        return v

    @field_validator("database")
    @classmethod
    def validate_database(cls, v: str) -> str:
        if v and not re.match(r"^[a-zA-Z0-9_./-]+$", v):
            raise ValueError("Invalid database name")
        return v


class ConnectionTestResult(BaseModel):
    """Response schema for connection test results."""

    success: bool
    message: str  # Generic message — never raw exception text
    latency_ms: Optional[float] = None
    server_version: Optional[str] = None


class MigrationStatusResponse(BaseModel):
    """Response schema for migration status."""

    current_revision: Optional[str] = None
    head_revision: Optional[str] = None
    pending_count: int = 0
    is_up_to_date: bool = True
