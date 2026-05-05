"""Shared utilities for Cassini seed scripts.

Canonical versions of InlineNelsonChecker, NELSON_RULE_NAMES, and
make_timestamps() — extracted from seed_chart_showcase.py to avoid
duplication across vertical seed scripts.
"""

import os
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ── Timestamp helpers ────────────────────────────────────────────────────

BASE_TIME = datetime.now(timezone.utc)


def utcnow() -> str:
    """ISO timestamp for SQLite."""
    return datetime.now(timezone.utc).isoformat()


def ts_offset(base_dt: datetime, minutes: int = 0, hours: int = 0, days: int = 0) -> str:
    """ISO string offset from a base datetime."""
    return (base_dt + timedelta(minutes=minutes, hours=hours, days=days)).isoformat()


def make_timestamps(n: int, span_days: int = 90, base: datetime | None = None) -> list[str]:
    """Generate n timestamps spread over span_days, backdated from base (default: now)."""
    ref = base or BASE_TIME
    interval = (span_days * 24 * 60) / n  # minutes between samples
    return [ts_offset(ref, minutes=-(span_days * 24 * 60) + int(i * interval)) for i in range(n)]


# ── Nelson rule metadata ─────────────────────────────────────────────────

NELSON_RULE_NAMES = {
    1: "Beyond 3\u03c3",
    2: "9 points same side",
    3: "6 points trending",
    4: "14 points alternating",
    5: "2 of 3 in Zone A",
    6: "4 of 5 in Zone B+",
    7: "15 points in Zone C",
    8: "8 points outside Zone C",
}


# ── Inline Nelson checker ────────────────────────────────────────────────


class InlineNelsonChecker:
    """Lightweight Nelson rules evaluator for seed-time violation detection.

    Evaluates Nelson rules 1-8 in-process as samples are added, so seed
    scripts can create realistic Violation rows without running the full
    SPC engine.
    """

    def __init__(self, cl: float, ucl: float, lcl: float, enabled_rules: list[int]):
        self.cl = cl
        self.ucl = ucl
        self.lcl = lcl
        self.sigma = (ucl - cl) / 3.0 if ucl != cl else 1.0
        self.enabled_rules = set(enabled_rules)
        self.means: list[float] = []

    def _zone(self, value: float) -> str:
        dist = abs(value - self.cl)
        above = value >= self.cl
        if dist > 3 * self.sigma:
            return "BEYOND_UCL" if above else "BEYOND_LCL"
        elif dist > 2 * self.sigma:
            return "ZONE_A_UPPER" if above else "ZONE_A_LOWER"
        elif dist > 1 * self.sigma:
            return "ZONE_B_UPPER" if above else "ZONE_B_LOWER"
        else:
            return "ZONE_C_UPPER" if above else "ZONE_C_LOWER"

    def check(self, sample_mean: float) -> list[int]:
        self.means.append(sample_mean)
        triggered = []
        for rule_id in self.enabled_rules:
            if self._check_rule(rule_id):
                triggered.append(rule_id)
        return triggered

    def _check_rule(self, rule_id: int) -> bool:
        vals = self.means
        n = len(vals)

        if rule_id == 1:
            if n < 1:
                return False
            z = self._zone(vals[-1])
            return z in ("BEYOND_UCL", "BEYOND_LCL")

        elif rule_id == 2:
            if n < 9:
                return False
            last9 = vals[-9:]
            return all(v > self.cl for v in last9) or all(v < self.cl for v in last9)

        elif rule_id == 3:
            if n < 6:
                return False
            last6 = vals[-6:]
            increasing = all(last6[i] < last6[i + 1] for i in range(5))
            decreasing = all(last6[i] > last6[i + 1] for i in range(5))
            return increasing or decreasing

        elif rule_id == 4:
            if n < 14:
                return False
            last14 = vals[-14:]
            alternations = 0
            for i in range(1, 13):
                prev_dir = last14[i] - last14[i - 1]
                next_dir = last14[i + 1] - last14[i]
                if prev_dir != 0 and next_dir != 0 and (prev_dir > 0) != (next_dir > 0):
                    alternations += 1
            return alternations >= 12

        elif rule_id == 5:
            if n < 3:
                return False
            last3 = vals[-3:]
            zones = [self._zone(v) for v in last3]
            upper_a = sum(1 for z in zones if z in ("ZONE_A_UPPER", "BEYOND_UCL"))
            lower_a = sum(1 for z in zones if z in ("ZONE_A_LOWER", "BEYOND_LCL"))
            return upper_a >= 2 or lower_a >= 2

        elif rule_id == 6:
            if n < 5:
                return False
            last5 = vals[-5:]
            zones = [self._zone(v) for v in last5]
            upper_b = sum(1 for z in zones if z in ("ZONE_B_UPPER", "ZONE_A_UPPER", "BEYOND_UCL"))
            lower_b = sum(1 for z in zones if z in ("ZONE_B_LOWER", "ZONE_A_LOWER", "BEYOND_LCL"))
            return upper_b >= 4 or lower_b >= 4

        elif rule_id == 7:
            if n < 15:
                return False
            last15 = vals[-15:]
            return all(self._zone(v).startswith("ZONE_C") for v in last15)

        elif rule_id == 8:
            if n < 8:
                return False
            last8 = vals[-8:]
            return all(not self._zone(v).startswith("ZONE_C") for v in last8)

        return False


# ── Database reset helper ───────────────────────────────────────────────

BACKEND_DIR = Path(__file__).resolve().parent.parent


def reset_and_migrate(db_path: Path | None = None) -> Path:
    """Drop all tables via raw sqlite3, then run Alembic migrations.

    This avoids SQLAlchemy's metadata.drop_all which chokes on circular
    FKs (characteristic <-> sample) in SQLite.

    Returns the db_path used.
    """
    if db_path is None:
        db_path = BACKEND_DIR / "data" / "cassini.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)

    # 1. Drop all tables with FKs disabled (handles circular deps)
    if db_path.exists():
        print("Dropping all tables...")
        conn = sqlite3.connect(str(db_path))
        cur = conn.cursor()
        cur.execute("PRAGMA foreign_keys=OFF")
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        for (tbl,) in cur.fetchall():
            cur.execute(f"DROP TABLE IF EXISTS [{tbl}]")
        conn.commit()
        conn.close()

    # 2. Run Alembic migrations to recreate schema
    print("Running Alembic migrations...")
    env = {**os.environ, "CASSINI_DATABASE_URL": f"sqlite:///{db_path.resolve()}"}
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(BACKEND_DIR),
        capture_output=True, text=True,
        env=env,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Alembic migration failed: {result.stderr}")
    print("Migrations complete.")

    # 3. Remove "Default Plant" created by Alembic migration
    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()
    cur.execute("DELETE FROM hierarchy WHERE plant_id IN (SELECT id FROM plant WHERE code='DEFAULT')")
    cur.execute("DELETE FROM user_plant_role WHERE plant_id IN (SELECT id FROM plant WHERE code='DEFAULT')")
    cur.execute("DELETE FROM plant WHERE code='DEFAULT'")
    conn.commit()
    conn.close()

    return db_path
