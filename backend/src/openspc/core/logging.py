"""Structured logging configuration using structlog.

Call configure_logging() once at application startup (before any log calls).
Supports two output formats controlled by OPENSPC_LOG_FORMAT:
  - "console" (default): colored, human-readable development output
  - "json": machine-parseable JSON lines for production log aggregation
"""

import logging
import sys

import structlog


def configure_logging(log_format: str = "console", log_level: str = "INFO") -> None:
    """Configure structlog and stdlib logging integration.

    Args:
        log_format: "console" for dev-friendly output, "json" for production.
        log_level: Minimum log level (DEBUG, INFO, WARNING, ERROR).
    """
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if log_format == "json":
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Configure stdlib logging to use structlog's ProcessorFormatter
    # so uvicorn, sqlalchemy, alembic logs also get structured output
    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Reduce noise from noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("asyncua").setLevel(logging.WARNING)
    logging.getLogger("asyncua.client.ua_client.UASocketProtocol").setLevel(logging.ERROR)
