"""Show Your Work contract tests.

Verify that every explain endpoint returns a value matching the
corresponding display endpoint.  These are endpoint-vs-endpoint
assertions -- no hardcoded golden values.  If both endpoints agree
the contract holds; if they diverge the test fails.

Run standalone:  pytest -m syw -x
"""

from __future__ import annotations

import math
import statistics
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from cassini.api.deps import get_current_engineer, get_current_user, get_db_session
from cassini.api.v1.capability import router as capability_router
from cassini.api.v1.characteristics import router as characteristics_router
from cassini.api.v1.explain import router as explain_router
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.plant import Plant
from cassini.db.models.sample import Measurement, Sample
from cassini.db.models.user import UserRole

TOLERANCE = 1e-6
# Mode 1 tests compare test-recomputed values against the explain endpoint,
# which rounds through calculate_capability (_round_or_none, 4 decimals).
# A wider tolerance accommodates that rounding without masking real bugs.
MODE1_TOLERANCE = 5e-5


# ---------------------------------------------------------------------------
# Deterministic data generators
# ---------------------------------------------------------------------------

def _gen_normal(n: int, mean: float, std: float, seed: int = 42) -> list[float]:
    rng = np.random.default_rng(seed)
    return rng.normal(mean, std, n).tolist()


def _gen_binomial(n: int, trials: int, prob: float, seed: int = 42) -> list[int]:
    rng = np.random.default_rng(seed)
    return rng.binomial(trials, prob, n).tolist()


# ---------------------------------------------------------------------------
# Auth mock (same pattern as test_characteristics_api.py)
# ---------------------------------------------------------------------------

class _MockPlantRole:
    def __init__(self, plant_id: int, role: UserRole):
        self.plant_id = plant_id
        self.role = role


class _MockUser:
    def __init__(self):
        self.id = 1
        self.username = "testuser"
        self.email = "test@example.com"
        self.is_active = True
        self.must_change_password = False
        self.plant_roles = [_MockPlantRole(plant_id=0, role=UserRole.admin)]


# ---------------------------------------------------------------------------
# Core fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def app(async_session):
    """FastAPI app with all three routers needed for SYW tests."""
    app = FastAPI()
    app.include_router(characteristics_router)
    app.include_router(capability_router)
    app.include_router(explain_router)

    async def override_get_session():
        yield async_session

    test_user = _MockUser()
    app.dependency_overrides[get_db_session] = override_get_session
    app.dependency_overrides[get_current_user] = lambda: test_user
    app.dependency_overrides[get_current_engineer] = lambda: test_user

    return app


@pytest_asyncio.fixture
async def client(app):
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


@pytest_asyncio.fixture
async def plant(async_session):
    p = Plant(name="SYW Test Plant", code="SYW1")
    async_session.add(p)
    await async_session.commit()
    await async_session.refresh(p)
    return p


@pytest_asyncio.fixture
async def hierarchy(async_session, plant):
    h = Hierarchy(name="SYW Line", type="Line", parent_id=None, plant_id=plant.id)
    async_session.add(h)
    await async_session.commit()
    await async_session.refresh(h)
    return h


# ---------------------------------------------------------------------------
# Variable characteristic fixture (subgroup_size=5)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def var_char(async_session, hierarchy):
    """Variable characteristic with 30 samples (n=5 each).

    stored_sigma, ucl, lcl, stored_center_line are set directly on the
    model -- matching what the SPC engine would compute from R-bar/d2.
    This avoids coupling the contract tests to the limit-calculation engine.
    """
    # Generate 150 measurements (30 samples x 5)
    all_values = _gen_normal(150, mean=50.0, std=2.0, seed=42)

    # Pre-compute stored parameters the way R-bar/d2 would for n=5
    subgroups = [all_values[i:i + 5] for i in range(0, 150, 5)]
    means = [statistics.mean(sg) for sg in subgroups]
    ranges = [max(sg) - min(sg) for sg in subgroups]
    x_bar = statistics.mean(means)
    r_bar = statistics.mean(ranges)
    d2_n5 = 2.326  # AIAG constant for n=5
    sigma = r_bar / d2_n5

    char = Characteristic(
        hierarchy_id=hierarchy.id,
        name="SYW Variable Test",
        subgroup_size=5,
        target_value=50.0,
        usl=56.0,
        lsl=44.0,
        ucl=x_bar + 3 * sigma / math.sqrt(5),
        lcl=x_bar - 3 * sigma / math.sqrt(5),
        stored_sigma=sigma,
        stored_center_line=x_bar,
        data_type="variable",
        decimal_precision=4,
    )
    async_session.add(char)
    await async_session.flush()

    base_time = datetime.now(timezone.utc) - timedelta(days=30)
    for i in range(30):
        sample_values = all_values[i * 5:(i + 1) * 5]
        sample = Sample(
            char_id=char.id,
            timestamp=base_time + timedelta(hours=i),
            actual_n=5,
            is_excluded=False,
            is_undersized=False,
            is_modified=False,
            spc_status="complete",
        )
        sample.measurements = [Measurement(value=v) for v in sample_values]
        async_session.add(sample)

    await async_session.commit()
    await async_session.refresh(char)
    return char


# ---------------------------------------------------------------------------
# Attribute characteristic fixture (p-chart)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def attr_char(async_session, hierarchy):
    """Attribute p-chart characteristic with 30 samples.

    Each sample has sample_size=100, defect_count drawn from Binomial(100, 0.05).
    stored_center_line = p-bar, ucl/lcl computed from standard p-chart formulas.
    """
    defects = _gen_binomial(30, trials=100, prob=0.05, seed=99)
    n = 100
    p_bar = sum(defects) / (30 * n)

    sigma_p = math.sqrt(p_bar * (1 - p_bar) / n)
    ucl = p_bar + 3 * sigma_p
    lcl = max(0.0, p_bar - 3 * sigma_p)

    char = Characteristic(
        hierarchy_id=hierarchy.id,
        name="SYW Attribute Test",
        subgroup_size=100,
        data_type="attribute",
        attribute_chart_type="p",
        stored_center_line=p_bar,
        ucl=ucl,
        lcl=lcl,
        use_laney_correction=True,
        decimal_precision=4,
    )
    async_session.add(char)
    await async_session.flush()

    base_time = datetime.now(timezone.utc) - timedelta(days=30)
    for i in range(30):
        sample = Sample(
            char_id=char.id,
            timestamp=base_time + timedelta(hours=i),
            actual_n=1,
            defect_count=defects[i],
            sample_size=n,
            is_excluded=False,
            is_undersized=False,
            is_modified=False,
            spc_status="complete",
        )
        async_session.add(sample)

    await async_session.commit()
    await async_session.refresh(char)
    return char


# ===================================================================
# GROUP 2: Control Limits Contracts
# ===================================================================


@pytest.mark.syw
class TestControlLimitsContracts:
    """Chart-data control_limits.X == explain control-limits X."""

    async def test_ucl_match(self, client: AsyncClient, var_char: Characteristic):
        chart_resp = await client.get(
            f"/api/v1/characteristics/{var_char.id}/chart-data",
        )
        assert chart_resp.status_code == 200
        chart_ucl = chart_resp.json()["control_limits"]["ucl"]

        explain_resp = await client.get(
            f"/api/v1/explain/control-limits/ucl/{var_char.id}",
        )
        assert explain_resp.status_code == 200
        explain_ucl = explain_resp.json()["value"]

        assert abs(chart_ucl - explain_ucl) < TOLERANCE, (
            f"UCL mismatch: chart-data={chart_ucl}, explain={explain_ucl}"
        )

    async def test_lcl_match(self, client: AsyncClient, var_char: Characteristic):
        chart_resp = await client.get(
            f"/api/v1/characteristics/{var_char.id}/chart-data",
        )
        assert chart_resp.status_code == 200
        chart_lcl = chart_resp.json()["control_limits"]["lcl"]

        explain_resp = await client.get(
            f"/api/v1/explain/control-limits/lcl/{var_char.id}",
        )
        assert explain_resp.status_code == 200
        explain_lcl = explain_resp.json()["value"]

        assert abs(chart_lcl - explain_lcl) < TOLERANCE, (
            f"LCL mismatch: chart-data={chart_lcl}, explain={explain_lcl}"
        )

    async def test_center_line_match(self, client: AsyncClient, var_char: Characteristic):
        chart_resp = await client.get(
            f"/api/v1/characteristics/{var_char.id}/chart-data",
        )
        assert chart_resp.status_code == 200
        chart_cl = chart_resp.json()["control_limits"]["center_line"]

        explain_resp = await client.get(
            f"/api/v1/explain/control-limits/center_line/{var_char.id}",
        )
        assert explain_resp.status_code == 200
        explain_cl = explain_resp.json()["value"]

        assert abs(chart_cl - explain_cl) < TOLERANCE, (
            f"Center line mismatch: chart-data={chart_cl}, explain={explain_cl}"
        )


# ===================================================================
# GROUP 1: Capability Contracts -- Mode 2 (no chartOptions)
# ===================================================================


@pytest.mark.syw
class TestCapabilityMode2Contracts:
    """capability endpoint .X == explain capability X (no chartOptions).

    Mode 2: explain uses get_rolling_window_data + stored_sigma,
    matching the capability GET endpoint exactly.
    """

    @pytest.fixture
    def _urls(self, var_char):
        cid = var_char.id
        return {
            "capability": f"/api/v1/characteristics/{cid}/capability",
            "explain": lambda metric: f"/api/v1/explain/capability/{metric}/{cid}",
        }

    async def _assert_metric(self, client, _urls, metric: str):
        cap_resp = await client.get(_urls["capability"])
        assert cap_resp.status_code == 200, cap_resp.text
        cap_value = cap_resp.json()[metric]

        exp_resp = await client.get(_urls["explain"](metric))
        assert exp_resp.status_code == 200, exp_resp.text
        exp_value = exp_resp.json()["value"]

        assert cap_value is not None, f"Capability endpoint returned None for {metric}"
        assert abs(cap_value - exp_value) < TOLERANCE, (
            f"Mode 2 {metric} mismatch: capability={cap_value}, explain={exp_value}"
        )

    async def test_cp_match(self, client, _urls):
        await self._assert_metric(client, _urls, "cp")

    async def test_cpk_match(self, client, _urls):
        await self._assert_metric(client, _urls, "cpk")

    async def test_pp_match(self, client, _urls):
        await self._assert_metric(client, _urls, "pp")

    async def test_ppk_match(self, client, _urls):
        await self._assert_metric(client, _urls, "ppk")

    async def test_cpm_match(self, client, _urls):
        await self._assert_metric(client, _urls, "cpm")


# ===================================================================
# GROUP 1: Capability Contracts -- Mode 1 (with chartOptions)
# ===================================================================


@pytest.mark.syw
class TestCapabilityMode1Contracts:
    """chart-data subgroup means -> recomputed Cpk/Ppk == explain with limit.

    Mode 1: explain uses subgroup means + sample_std_dev(means) as sigma.
    The test fetches chart-data, extracts means, recomputes the index,
    and asserts it matches the explain endpoint.
    """

    LIMIT = 25

    async def _get_chart_means(
        self, client: AsyncClient, char: Characteristic,
    ) -> list[float]:
        resp = await client.get(
            f"/api/v1/characteristics/{char.id}/chart-data",
            params={"limit": self.LIMIT},
        )
        assert resp.status_code == 200
        data = resp.json()
        return [
            dp["mean"]
            for dp in data["data_points"]
            if not dp["excluded"]
        ]

    async def test_cpk_match(self, client: AsyncClient, var_char: Characteristic):
        means = await self._get_chart_means(client, var_char)
        assert len(means) >= 2, "Need at least 2 subgroup means"

        x_bar = statistics.mean(means)
        sigma = statistics.stdev(means)
        cpk_from_chart = min(
            (var_char.usl - x_bar) / (3 * sigma),
            (x_bar - var_char.lsl) / (3 * sigma),
        )

        exp_resp = await client.get(
            f"/api/v1/explain/capability/cpk/{var_char.id}",
            params={"limit": self.LIMIT},
        )
        assert exp_resp.status_code == 200
        exp_value = exp_resp.json()["value"]

        assert abs(cpk_from_chart - exp_value) < MODE1_TOLERANCE, (
            f"Mode 1 Cpk mismatch: chart-derived={cpk_from_chart}, explain={exp_value}"
        )

    async def test_ppk_match(self, client: AsyncClient, var_char: Characteristic):
        means = await self._get_chart_means(client, var_char)
        assert len(means) >= 2, "Need at least 2 subgroup means"

        x_bar = statistics.mean(means)
        sigma = statistics.stdev(means)
        ppk_from_chart = min(
            (var_char.usl - x_bar) / (3 * sigma),
            (x_bar - var_char.lsl) / (3 * sigma),
        )

        exp_resp = await client.get(
            f"/api/v1/explain/capability/ppk/{var_char.id}",
            params={"limit": self.LIMIT},
        )
        assert exp_resp.status_code == 200
        exp_value = exp_resp.json()["value"]

        assert abs(ppk_from_chart - exp_value) < MODE1_TOLERANCE, (
            f"Mode 1 Ppk mismatch: chart-derived={ppk_from_chart}, explain={exp_value}"
        )


# ===================================================================
# Mode Divergence -- confirm the two modes produce different values
# ===================================================================


@pytest.mark.syw
class TestModeDivergence:
    """Mode 1 and Mode 2 MUST produce different Cpk values.

    If they produce the same value, either the branching is broken
    or the test data doesn't exercise the divergence.
    """

    async def test_modes_diverge(self, client: AsyncClient, var_char: Characteristic):
        # Mode 2: no chartOptions
        mode2_resp = await client.get(
            f"/api/v1/explain/capability/cpk/{var_char.id}",
        )
        assert mode2_resp.status_code == 200
        mode2_cpk = mode2_resp.json()["value"]

        # Mode 1: with limit
        mode1_resp = await client.get(
            f"/api/v1/explain/capability/cpk/{var_char.id}",
            params={"limit": 25},
        )
        assert mode1_resp.status_code == 200
        mode1_cpk = mode1_resp.json()["value"]

        assert abs(mode1_cpk - mode2_cpk) > TOLERANCE, (
            f"Modes should diverge but both returned Cpk={mode1_cpk}. "
            "Test data may not exercise the two-mode branch correctly."
        )


# ===================================================================
# GROUP 3: Attribute SPC Contracts
# ===================================================================


@pytest.mark.syw
class TestAttributeContracts:
    """chart-data attribute fields == explain attribute endpoint values.

    The attribute explain endpoint fetches ALL non-excluded samples and
    recomputes limits + sigma_z from scratch.  chart-data returns stored
    limits and on-the-fly sigma_z.  Both must agree.
    """

    async def test_attr_ucl_match(self, client: AsyncClient, attr_char: Characteristic):
        chart_resp = await client.get(
            f"/api/v1/characteristics/{attr_char.id}/chart-data",
        )
        assert chart_resp.status_code == 200
        chart_ucl = chart_resp.json()["control_limits"]["ucl"]

        exp_resp = await client.get(
            f"/api/v1/explain/attribute/ucl/{attr_char.id}",
        )
        assert exp_resp.status_code == 200
        exp_ucl = exp_resp.json()["value"]

        assert chart_ucl is not None, "chart-data returned None UCL for attribute"
        assert abs(chart_ucl - exp_ucl) < TOLERANCE, (
            f"Attribute UCL mismatch: chart-data={chart_ucl}, explain={exp_ucl}"
        )

    async def test_attr_lcl_match(self, client: AsyncClient, attr_char: Characteristic):
        chart_resp = await client.get(
            f"/api/v1/characteristics/{attr_char.id}/chart-data",
        )
        assert chart_resp.status_code == 200
        chart_lcl = chart_resp.json()["control_limits"]["lcl"]

        exp_resp = await client.get(
            f"/api/v1/explain/attribute/lcl/{attr_char.id}",
        )
        assert exp_resp.status_code == 200
        exp_lcl = exp_resp.json()["value"]

        # LCL can be None if it would be negative -- both should agree
        if chart_lcl is None:
            assert exp_lcl is None or exp_lcl <= 0, (
                f"chart-data LCL is None but explain returned {exp_lcl}"
            )
        else:
            assert abs(chart_lcl - exp_lcl) < TOLERANCE, (
                f"Attribute LCL mismatch: chart-data={chart_lcl}, explain={exp_lcl}"
            )

    async def test_sigma_z_match(self, client: AsyncClient, attr_char: Characteristic):
        chart_resp = await client.get(
            f"/api/v1/characteristics/{attr_char.id}/chart-data",
        )
        assert chart_resp.status_code == 200
        chart_sigma_z = chart_resp.json().get("sigma_z")

        exp_resp = await client.get(
            f"/api/v1/explain/attribute/sigma_z/{attr_char.id}",
        )
        assert exp_resp.status_code == 200
        exp_sigma_z = exp_resp.json()["value"]

        assert chart_sigma_z is not None, (
            "chart-data returned None sigma_z -- Laney correction may not have fired. "
            "Check that use_laney_correction=True and >=3 samples exist."
        )
        assert abs(chart_sigma_z - exp_sigma_z) < TOLERANCE, (
            f"sigma_z mismatch: chart-data={chart_sigma_z}, explain={exp_sigma_z}"
        )
