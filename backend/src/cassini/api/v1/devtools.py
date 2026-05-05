"""Dev Tools API endpoints for sandbox mode.

Only registered when CASSINI_SANDBOX=true. Provides database reset
and re-seed functionality for development and testing.
"""

import importlib.util
import io
import logging  # stdlib logging needed for seed script log capture
from pathlib import Path

import structlog

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from cassini.api.deps import get_current_admin
from cassini.db.database import get_database, reset_singleton

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/devtools", tags=["devtools"])

# backend/ directory (parent of src/cassini/api/v1/)
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent

AVAILABLE_SCRIPTS = {
    "showcase": {
        "name": "Showcase Demo",
        "description": "3 industry-themed plants (automotive, aerospace, pharma) with 8 users, 24 characteristics covering every chart type, distribution, and SPC feature. Includes narrative story arcs, violations, annotations, connectivity, MSA, FAI, signatures, anomaly detection, and analytics.",
        "estimated_samples": "~12,000",
        "script_file": "scripts/seed_showcase.py",
        "category": "demo",
    },
    "steel_mill": {
        "name": "Steel Mill",
        "description": "Integrated steel mill (melt shop, hot strip mill, cold rolling) with 15 continuous-process characteristics. CUSUM on strip thickness, EWMA on furnace temperature, custom rule presets, autocorrelated data with day/night cycling and campaign drift.",
        "estimated_samples": "~7,500",
        "script_file": "scripts/seed_steel_mill.py",
        "category": "demo",
    },
    "aerospace": {
        "name": "Aerospace Manufacturing",
        "description": "Precision aerospace plant (CNC machining, composite layup, final assembly) with 14 characteristics. Attribute p/np charts, short-run SPC, gage bridge + CMM ports, FAI reports (AS9102), MSA study, and non-normal distributions (Weibull, Beta).",
        "estimated_samples": "~5,000",
        "script_file": "scripts/seed_aerospace.py",
        "category": "demo",
    },
    "semiconductor": {
        "name": "Semiconductor Fab",
        "description": "Wafer fabrication (photolithography, CVD/etch, metrology) with 14 characteristics. Laney p'/u' charts for overdispersed particle counts, CUSUM on critical dimension, non-normal distributions (Lognormal, Gamma, Box-Cox), multivariate group, and retention policy.",
        "estimated_samples": "~6,000",
        "script_file": "scripts/seed_semiconductor.py",
        "category": "demo",
    },
    "data_center": {
        "name": "Data Center",
        "description": "Hyperscale data center (server hall, cooling plant, power distribution) with 13 continuous-monitoring characteristics. EWMA on PUE, CUSUM on chiller approach temperature, anomaly detection (PELT + Isolation Forest), push notifications, custom rule presets, and ERP/DCIM webhook connector.",
        "estimated_samples": "~8,000",
        "script_file": "scripts/seed_data_center.py",
        "category": "demo",
    },
    "distillery": {
        "name": "Alcohol Distillery",
        "description": "5 distillery plants (Whiskey, Vodka/Gin, Rum, Tequila/Mezcal, QC Lab) with ~50 characteristics covering variable, attribute, CUSUM, EWMA, non-normal distributions, Laney p'/u', short-run, gage bridge, ERP connector, and correlated multivariate data.",
        "estimated_samples": "~9,500",
        "script_file": "scripts/seed_distillery.py",
        "category": "demo",
    },
    "pharma": {
        "name": "Pharmaceutical + FDA",
        "description": "Multi-site pharma (Boston API, Research Triangle Solid Dose, SF Biologics) with ~30 characteristics, FDA 21 CFR Part 11 compliance. Electronic signatures, anomaly detection, MSA studies, non-normal distributions, retention policy, LIMS ERP connector, push notifications, and OIDC account linking.",
        "estimated_samples": "~38,000",
        "script_file": "scripts/seed_pharma.py",
        "category": "demo",
    },
    "nelson_test": {
        "name": "Nelson Rules Test",
        "description": "2 plants with 10 characteristics designed to trigger all 8 Nelson rules. Deterministic patterns for UI/stats verification.",
        "estimated_samples": "~1,200",
        "script_file": "scripts/seed_test_nelson.py",
        "category": "demo",
    },
    "chart_showcase": {
        "name": "Chart Showcase",
        "description": "Single plant with 4 characteristics showcasing I-MR, X-bar R (variable n), and X-bar S chart types with realistic process behaviors.",
        "estimated_samples": "~360",
        "script_file": "scripts/seed_chart_showcase.py",
        "category": "demo",
    },
    "nist_reference": {
        "name": "NIST Reference Data",
        "description": "NIST-certified and textbook reference datasets for SPC validation. Michelson, Mavro, Lew (I-MR), Flowrate (I-MR with certified limits), Piston Rings and Hard Bake (X-bar/R with capability), Orange Juice (p-chart), Wafer Defects and Circuit Board (c-chart), Dyed Cloth (u-chart).",
        "estimated_samples": "~600",
        "script_file": "scripts/seed_nist_reference.py",
        "category": "reference",
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
            {"key": key, "name": info["name"], "description": info["description"], "estimated_samples": info["estimated_samples"], "category": info.get("category", "demo")}
            for key, info in AVAILABLE_SCRIPTS.items()
        ],
    }


@router.post("/reset-and-seed", response_model=SeedResponse)
async def reset_and_seed(body: SeedRequest, user=Depends(get_current_admin)):
    """Wipe the database and re-seed with the specified script.

    This is a destructive operation that drops all tables and recreates them.
    Only available in sandbox mode (CASSINI_SANDBOX=true).
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

    logger.info("running_seed", script=body.script)

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
