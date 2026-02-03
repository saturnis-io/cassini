#!/usr/bin/env python3
"""Example FastAPI application with Hierarchy endpoints.

This demonstrates how to integrate the BE-009 Hierarchy REST API
into a FastAPI application.

Usage:
    python example_hierarchy_app.py

Then visit:
    - http://localhost:8000/docs - Interactive API documentation
    - http://localhost:8000/api/v1/hierarchy/ - Hierarchy tree endpoint
"""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from fastapi import FastAPI
from fastapi.responses import RedirectResponse

from openspc.api.v1.hierarchy import router as hierarchy_router

# Create FastAPI application
app = FastAPI(
    title="OpenSPC Hierarchy API",
    description="ISA-95 Equipment Hierarchy Management",
    version="0.1.0",
)

# Include hierarchy router with prefix
app.include_router(hierarchy_router, prefix="/api/v1/hierarchy")


@app.get("/", include_in_schema=False)
async def root():
    """Redirect root to API docs."""
    return RedirectResponse(url="/docs")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "openspc-hierarchy"}


if __name__ == "__main__":
    import uvicorn

    print("=" * 60)
    print("OpenSPC Hierarchy API Example")
    print("=" * 60)
    print("\nStarting server...")
    print("\nAvailable endpoints:")
    print("  - http://localhost:8000/docs - Interactive API docs")
    print("  - http://localhost:8000/health - Health check")
    print("  - http://localhost:8000/api/v1/hierarchy/ - Hierarchy endpoints")
    print("\nPress CTRL+C to stop")
    print("=" * 60)

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
