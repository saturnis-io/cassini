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
    "pharma": {
        "name": "Pharmaceutical Demo",
        "description": "3 sites with realistic ISA-95 hierarchy, ~26 characteristics, ~6 months of sample data with process shifts, trends, and outliers.",
        "estimated_samples": "~37,000",
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
    "discrete": {
        "name": "Discrete Manufacturing",
        "description": "Automotive parts plant with 4 production lines, 10 characteristics (bore diameter, shaft OD, hardness, torque, etc.) showing tool wear drift, material lot shifts, and thermal expansion.",
        "estimated_samples": "~4,000",
        "script_file": "scripts/seed_discrete.py",
        "category": "demo",
    },
    "continuous": {
        "name": "Continuous Process",
        "description": "Oil refinery with 3 process units, 15 characteristics (temperatures, pressures, flow rates, pH, etc.) featuring autocorrelated data, day/night cycles, catalyst degradation, and process upsets.",
        "estimated_samples": "~7,600",
        "script_file": "scripts/seed_continuous.py",
        "category": "demo",
    },
    "batch": {
        "name": "Batch Production",
        "description": "Craft brewery with 3 areas (brewhouse, fermentation, packaging), 11 characteristics featuring between-batch variation, within-batch drift, and raw material step changes.",
        "estimated_samples": "~5,700",
        "script_file": "scripts/seed_batch.py",
        "category": "demo",
    },
    "fda_demo": {
        "name": "FDA 21 CFR Part 11 Demo",
        "description": "PharmaCorp solid dosage plant with 9 characteristics, anomaly detection (drift/shift/variance), electronic signature workflows, pre-signed records, and FDA-strict password policy.",
        "estimated_samples": "~1,800",
        "script_file": "scripts/seed_fda_demo.py",
        "category": "demo",
    },
    "test_sprint5": {
        "name": "Sprint 5: Statistical Credibility",
        "description": "3 plants testing non-normal capability (Box-Cox, Weibull, Gamma), custom Nelson rule presets (4 rulesets), and Laney p'/u' charts (overdispersion/underdispersion).",
        "estimated_samples": "~650",
        "script_file": "scripts/seed_test_sprint5.py",
        "category": "test",
    },
    "test_sprint6": {
        "name": "Sprint 6: Compliance Gate",
        "description": "3 plants with full Gage R&R study (10 parts × 3 operators × 3 trials, ready to calculate), short-run SPC (5 chars with deviation/standardized modes), and 2 FAI reports (draft + submitted with AS9102 items and separation-of-duties test).",
        "estimated_samples": "~180",
        "script_file": "scripts/seed_test_sprint6.py",
        "category": "test",
    },
    "test_sprint7": {
        "name": "Sprint 7: Gage Connectivity",
        "description": "1 plant with 4 characteristics simulating digital gage types (caliper, micrometer, CMM, surface roughness) with realistic resolution and intervals.",
        "estimated_samples": "~330",
        "script_file": "scripts/seed_test_sprint7.py",
        "category": "test",
    },
    "test_sprint8": {
        "name": "Sprint 8: Enterprise Integration",
        "description": "3 plants scaffolding ERP connectors (SAP-style work orders), LIMS lab data (certificates), and mobile entry (small subgroups, short batch IDs).",
        "estimated_samples": "~880",
        "script_file": "scripts/seed_test_sprint8.py",
        "category": "test",
    },
    "test_sprint9": {
        "name": "Sprint 9: Advanced Analytics",
        "description": "4 plants with correlated multivariate data (ρ≈0.85), predictive drift (500+ samples), correlation pairs, and 2³ factorial DOE (8 runs × 5 replicates).",
        "estimated_samples": "~1,400",
        "script_file": "scripts/seed_test_sprint9.py",
        "category": "test",
    },
    "showcase": {
        "name": "Showcase Demo",
        "description": "3 industry-themed plants (automotive, aerospace, pharma) with 8 users, 24 characteristics covering every chart type, distribution, and SPC feature. Includes narrative story arcs, violations, annotations, connectivity, MSA, FAI, and compliance.",
        "estimated_samples": "~12,000",
        "script_file": "scripts/seed_showcase.py",
        "category": "demo",
    },
    "distillery": {
        "name": "Alcohol Distillery",
        "description": "5 plants (Whiskey, Vodka/Gin, Rum, Tequila/Mezcal, QC Lab) with ~50 characteristics covering variable, attribute, CUSUM, EWMA, non-normal distributions, Laney p'/u', short-run, and correlated multivariate data. Exercises Sprints 5-9.",
        "estimated_samples": "~9,500",
        "script_file": "scripts/seed_distillery.py",
        "category": "demo",
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
