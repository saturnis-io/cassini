"""Dev Tools API endpoints for sandbox mode.

Only registered when OPENSPC_SANDBOX=true. Provides database reset
and re-seed functionality for development and testing.
"""

import importlib.util
import io
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from openspc.api.deps import get_current_admin
from openspc.db.database import get_database, reset_singleton

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/devtools", tags=["devtools"])

# backend/ directory (parent of src/openspc/api/v1/)
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent

AVAILABLE_SCRIPTS = {
    "pharma": {
        "name": "Pharmaceutical Demo",
        "description": "3 sites with realistic ISA-95 hierarchy, ~26 characteristics, ~6 months of sample data with process shifts, trends, and outliers.",
        "estimated_samples": "~37,000",
        "script_file": "scripts/seed_pharma.py",
    },
    "nelson_test": {
        "name": "Nelson Rules Test",
        "description": "2 plants with 10 characteristics designed to trigger all 8 Nelson rules. Deterministic patterns for UI/stats verification.",
        "estimated_samples": "~1,200",
        "script_file": "scripts/seed_test_nelson.py",
    },
    "chart_showcase": {
        "name": "Chart Showcase",
        "description": "Single plant with 4 characteristics showcasing I-MR, X-bar R (variable n), and X-bar S chart types with realistic process behaviors.",
        "estimated_samples": "~360",
        "script_file": "scripts/seed_chart_showcase.py",
    },
}


def _load_seed_module(script_key: str):
    """Load a seed script module by file path using importlib."""
    info = AVAILABLE_SCRIPTS[script_key]
    script_path = BACKEND_DIR / info["script_file"]

    if not script_path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Script not found: {script_path}",
        )

    module_name = f"_seed_{script_key}"
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SeedRequest(BaseModel):
    script: str


class SeedResponse(BaseModel):
    status: str
    output: str


@router.get("/status")
async def devtools_status(user=Depends(get_current_admin)):
    """Return sandbox status and available seed scripts."""
    return {
        "sandbox": True,
        "scripts": [
            {"key": key, "name": info["name"], "description": info["description"], "estimated_samples": info["estimated_samples"]}
            for key, info in AVAILABLE_SCRIPTS.items()
        ],
    }


@router.post("/reset-and-seed", response_model=SeedResponse)
async def reset_and_seed(body: SeedRequest, user=Depends(get_current_admin)):
    """Wipe the database and re-seed with the specified script.

    This is a destructive operation that drops all tables and recreates them.
    Only available in sandbox mode (OPENSPC_SANDBOX=true).
    """
    if body.script not in AVAILABLE_SCRIPTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown script '{body.script}'. Available: {list(AVAILABLE_SCRIPTS.keys())}",
        )

    # Dispose the current DB connection pool so the seed script gets exclusive access.
    # dispose() is async and handles draining active connections.
    db = get_database()
    await db.dispose()

    # Brief pause to allow in-flight requests to complete
    import asyncio
    await asyncio.sleep(0.1)

    # Reset the singleton so the next request creates a fresh connection
    reset_singleton()

    logger.info(f"Running seed: {body.script}")

    # Load the seed module by file path and call its seed() function directly.
    # This avoids Windows asyncio subprocess limitations.
    # Capture log output via a dedicated logging handler (async-safe).
    log_capture = io.StringIO()
    capture_handler = logging.StreamHandler(log_capture)
    capture_handler.setLevel(logging.DEBUG)
    capture_handler.setFormatter(logging.Formatter("%(message)s"))

    # Attach handler to root logger to capture seed script output
    root_logger = logging.getLogger()
    root_logger.addHandler(capture_handler)

    try:
        module = _load_seed_module(body.script)

        if body.script == "pharma":
            await module.seed(keep_existing=False)
        else:
            await module.seed()

    except HTTPException:
        raise
    except Exception:
        logger.exception("Seed script '%s' failed", body.script)
        raise HTTPException(
            status_code=500,
            detail="Seed script failed. Check server logs for details.",
        )
    finally:
        root_logger.removeHandler(capture_handler)

    output = log_capture.getvalue()
    logger.info("Seed script completed successfully")

    return SeedResponse(status="complete", output=output[-4000:])
