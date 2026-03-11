"""Cassini ingestion throughput benchmark.

Runs multiple scenarios against a live Cassini backend to measure
sample ingestion throughput and compare against theoretical targets:
  - Community:   180,000 samples/min (sync pipeline)
  - Commercial:  300,000 samples/min (async batch pipeline)

Usage:
    python bench_ingest.py [--host http://localhost:8000] [--duration 30]
                           [--workers 50] [--manifest manifest.json]

Scenarios:
    A. Sequential single-sample  (baseline latency)
    B. Concurrent single-sample  (parallel throughput)
    C. Batch import (1000/req)   (bulk throughput, skip rules)
    D. Batch import (full SPC)   (bulk throughput, with rules)
    E. Batch import (async SPC)  (bulk throughput, deferred SPC)
"""

import argparse
import asyncio
import json
import math
import random
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import aiohttp


# ─── Theoretical targets ─────────────────────────────────────────────
TARGET_COMMUNITY = 180_000    # samples/min
TARGET_COMMERCIAL = 300_000   # samples/min


@dataclass
class BenchResult:
    """Results from a single benchmark scenario."""
    name: str
    total_samples: int = 0
    total_requests: int = 0
    errors: int = 0
    duration_s: float = 0.0
    latencies_ms: list[float] = field(default_factory=list)

    @property
    def samples_per_sec(self) -> float:
        return self.total_samples / self.duration_s if self.duration_s > 0 else 0

    @property
    def samples_per_min(self) -> float:
        return self.samples_per_sec * 60

    @property
    def requests_per_sec(self) -> float:
        return self.total_requests / self.duration_s if self.duration_s > 0 else 0

    @property
    def p50_ms(self) -> float:
        if not self.latencies_ms:
            return 0
        s = sorted(self.latencies_ms)
        return s[len(s) // 2]

    @property
    def p95_ms(self) -> float:
        if not self.latencies_ms:
            return 0
        s = sorted(self.latencies_ms)
        return s[int(len(s) * 0.95)]

    @property
    def p99_ms(self) -> float:
        if not self.latencies_ms:
            return 0
        s = sorted(self.latencies_ms)
        return s[int(len(s) * 0.99)]

    @property
    def error_rate(self) -> float:
        total = self.total_requests or 1
        return (self.errors / total) * 100


def generate_measurements(subgroup_size: int) -> list[float]:
    """Generate realistic normal-distributed measurements."""
    return [round(random.gauss(10.0, 0.1), 4) for _ in range(subgroup_size)]


def generate_batch_samples(count: int, subgroup_size: int = 3) -> list[dict]:
    """Generate a list of sample payloads for batch import."""
    return [
        {"measurements": generate_measurements(subgroup_size)}
        for _ in range(count)
    ]


async def login(session: aiohttp.ClientSession, host: str,
                username: str = "admin", password: str = "admin") -> str:
    """Login and return access token."""
    async with session.post(f"{host}/api/v1/auth/login", json={
        "username": username,
        "password": password,
    }) as resp:
        data = await resp.json()
        return data["access_token"]


# ─── Scenario A: Sequential single-sample ─────────────────────────
async def scenario_sequential(
    session: aiohttp.ClientSession,
    host: str,
    token: str,
    char_ids: list[int],
    char_subgroups: dict[int, int],
    duration: float,
) -> BenchResult:
    """Submit samples one at a time, measuring per-request latency."""
    result = BenchResult(name="Single (sequential)")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    deadline = time.monotonic() + duration

    while time.monotonic() < deadline:
        char_id = random.choice(char_ids)
        subgroup = char_subgroups.get(char_id, 1)
        payload = {
            "characteristic_id": char_id,
            "measurements": generate_measurements(subgroup),
        }
        t0 = time.monotonic()
        try:
            async with session.post(
                f"{host}/api/v1/samples/",
                json=payload,
                headers=headers,
            ) as resp:
                elapsed = (time.monotonic() - t0) * 1000
                result.latencies_ms.append(elapsed)
                result.total_requests += 1
                if resp.status < 300:
                    result.total_samples += 1
                else:
                    result.errors += 1
        except Exception:
            result.errors += 1
            result.total_requests += 1

    result.duration_s = duration
    return result


# ─── Scenario B: Concurrent single-sample ─────────────────────────
async def _worker_single(
    session: aiohttp.ClientSession,
    host: str,
    headers: dict,
    char_ids: list[int],
    char_subgroups: dict[int, int],
    deadline: float,
    result: BenchResult,
    lock: asyncio.Lock,
):
    """Worker coroutine that submits single samples until deadline."""
    while time.monotonic() < deadline:
        char_id = random.choice(char_ids)
        subgroup = char_subgroups.get(char_id, 1)
        payload = {
            "characteristic_id": char_id,
            "measurements": generate_measurements(subgroup),
        }
        t0 = time.monotonic()
        try:
            async with session.post(
                f"{host}/api/v1/samples/",
                json=payload,
                headers=headers,
            ) as resp:
                elapsed = (time.monotonic() - t0) * 1000
                async with lock:
                    result.latencies_ms.append(elapsed)
                    result.total_requests += 1
                    if resp.status < 300:
                        result.total_samples += 1
                    else:
                        result.errors += 1
        except Exception:
            async with lock:
                result.errors += 1
                result.total_requests += 1


async def scenario_concurrent(
    session: aiohttp.ClientSession,
    host: str,
    token: str,
    char_ids: list[int],
    char_subgroups: dict[int, int],
    duration: float,
    workers: int,
) -> BenchResult:
    """Submit single samples from N concurrent workers."""
    result = BenchResult(name=f"Single (x{workers} concurrent)")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    lock = asyncio.Lock()
    deadline = time.monotonic() + duration

    tasks = [
        asyncio.create_task(
            _worker_single(session, host, headers, char_ids, char_subgroups, deadline, result, lock)
        )
        for _ in range(workers)
    ]
    await asyncio.gather(*tasks)
    result.duration_s = duration
    return result


# ─── Scenario C: Batch import (skip rules) ────────────────────────
async def _worker_batch(
    session: aiohttp.ClientSession,
    host: str,
    headers: dict,
    char_ids: list[int],
    char_subgroups: dict[int, int],
    batch_size: int,
    skip_rules: bool,
    deadline: float,
    result: BenchResult,
    lock: asyncio.Lock,
):
    """Worker that submits batch import requests until deadline."""
    while time.monotonic() < deadline:
        char_id = random.choice(char_ids)
        subgroup = char_subgroups.get(char_id, 3)
        payload = {
            "characteristic_id": char_id,
            "skip_rule_evaluation": skip_rules,
            "samples": generate_batch_samples(batch_size, subgroup),
        }
        t0 = time.monotonic()
        try:
            async with session.post(
                f"{host}/api/v1/samples/batch",
                json=payload,
                headers=headers,
            ) as resp:
                elapsed = (time.monotonic() - t0) * 1000
                body = await resp.json()
                async with lock:
                    result.latencies_ms.append(elapsed)
                    result.total_requests += 1
                    if resp.status < 300:
                        result.total_samples += body.get("imported", batch_size)
                    else:
                        result.errors += 1
        except Exception:
            async with lock:
                result.errors += 1
                result.total_requests += 1


async def scenario_batch(
    session: aiohttp.ClientSession,
    host: str,
    token: str,
    char_ids: list[int],
    char_subgroups: dict[int, int],
    duration: float,
    workers: int,
    batch_size: int = 1000,
    skip_rules: bool = True,
) -> BenchResult:
    """Submit batch import requests from N concurrent workers."""
    label = "Batch (skip rules)" if skip_rules else "Batch (full SPC)"
    result = BenchResult(name=f"{label} x{workers}")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    lock = asyncio.Lock()
    deadline = time.monotonic() + duration

    tasks = [
        asyncio.create_task(
            _worker_batch(
                session, host, headers, char_ids, char_subgroups, batch_size,
                skip_rules, deadline, result, lock,
            )
        )
        for _ in range(workers)
    ]
    await asyncio.gather(*tasks)
    result.duration_s = duration
    return result


# ─── Scenario E: Batch import (async SPC) ─────────────────────────
async def _worker_batch_async(
    session: aiohttp.ClientSession,
    host: str,
    headers: dict,
    char_ids: list[int],
    char_subgroups: dict[int, int],
    batch_size: int,
    deadline: float,
    result: BenchResult,
    lock: asyncio.Lock,
):
    """Worker that submits async-SPC batch import requests until deadline."""
    while time.monotonic() < deadline:
        char_id = random.choice(char_ids)
        subgroup = char_subgroups.get(char_id, 3)
        payload = {
            "characteristic_id": char_id,
            "async_spc": True,
            "samples": generate_batch_samples(batch_size, subgroup),
        }
        t0 = time.monotonic()
        try:
            async with session.post(
                f"{host}/api/v1/samples/batch",
                json=payload,
                headers=headers,
            ) as resp:
                elapsed = (time.monotonic() - t0) * 1000
                body = await resp.json()
                async with lock:
                    result.latencies_ms.append(elapsed)
                    result.total_requests += 1
                    if resp.status < 300:
                        result.total_samples += body.get("imported", batch_size)
                    else:
                        result.errors += 1
        except Exception:
            async with lock:
                result.errors += 1
                result.total_requests += 1


async def scenario_batch_async(
    session: aiohttp.ClientSession,
    host: str,
    token: str,
    char_ids: list[int],
    char_subgroups: dict[int, int],
    duration: float,
    workers: int,
    batch_size: int = 1000,
) -> BenchResult:
    """Submit async-SPC batch import requests from N concurrent workers."""
    result = BenchResult(name=f"Batch (async SPC) x{workers}")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    lock = asyncio.Lock()
    deadline = time.monotonic() + duration

    tasks = [
        asyncio.create_task(
            _worker_batch_async(
                session, host, headers, char_ids, char_subgroups, batch_size,
                deadline, result, lock,
            )
        )
        for _ in range(workers)
    ]
    await asyncio.gather(*tasks)
    result.duration_s = duration
    return result


# ─── Reporting ────────────────────────────────────────────────────
def print_results(results: list[BenchResult], uvicorn_workers: int):
    """Print a formatted results table."""
    w = 90
    print()
    print("=" * w)
    print(f"{'CASSINI INGESTION BENCHMARK':^{w}}")
    print("=" * w)
    print(f"  Targets: Community {TARGET_COMMUNITY:,}/min | "
          f"Commercial {TARGET_COMMERCIAL:,}/min")
    print(f"  Uvicorn workers: {uvicorn_workers}")
    print("-" * w)
    print(f"  {'Scenario':<30} {'Samples':>9} {'Rate/min':>10} "
          f"{'%Target':>8} {'P50':>7} {'P95':>7} {'P99':>7} {'Err%':>6}")
    print("-" * w)

    for r in results:
        # Choose appropriate target based on scenario type
        if "skip rules" in r.name.lower() or "batch" in r.name.lower():
            target = TARGET_COMMERCIAL
        else:
            target = TARGET_COMMUNITY
        pct = (r.samples_per_min / target * 100) if target else 0

        # Color coding via ANSI
        if pct >= 100:
            color = "\033[32m"  # green
        elif pct >= 75:
            color = "\033[33m"  # yellow
        else:
            color = "\033[31m"  # red
        reset = "\033[0m"

        print(
            f"  {r.name:<30} "
            f"{r.total_samples:>9,} "
            f"{color}{r.samples_per_min:>9,.0f}{reset} "
            f"{color}{pct:>7.1f}%{reset} "
            f"{r.p50_ms:>6.1f}ms "
            f"{r.p95_ms:>6.1f}ms "
            f"{r.p99_ms:>6.1f}ms "
            f"{r.error_rate:>5.1f}%"
        )

    print("=" * w)

    # Summary JSON for programmatic consumption
    summary = {
        "scenarios": [
            {
                "name": r.name,
                "total_samples": r.total_samples,
                "samples_per_min": round(r.samples_per_min),
                "p50_ms": round(r.p50_ms, 1),
                "p95_ms": round(r.p95_ms, 1),
                "p99_ms": round(r.p99_ms, 1),
                "error_rate_pct": round(r.error_rate, 2),
            }
            for r in results
        ]
    }
    with open("results.json", "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\n  Detailed results written to results.json")


# ─── Main ─────────────────────────────────────────────────────────
async def run(args):
    manifest_path = Path(args.manifest)
    if not manifest_path.exists():
        print(f"ERROR: {manifest_path} not found. Run seed.py first.", file=sys.stderr)
        sys.exit(1)

    manifest = json.loads(manifest_path.read_text())
    char_ids = manifest["variable_char_ids"]
    # Map char_id -> subgroup_size (keys are strings in JSON)
    char_subgroups: dict[int, int] = {
        int(k): v for k, v in manifest.get("char_subgroup_sizes", {}).items()
    }
    if not char_subgroups:
        # Fallback: assume round-robin 1-5 pattern matching seed.py
        char_subgroups = {cid: (i % 5) + 1 for i, cid in enumerate(char_ids)}

    print(f"[bench] Connecting to {args.host}...")
    connector = aiohttp.TCPConnector(limit=args.workers + 20, force_close=False)
    timeout = aiohttp.ClientTimeout(total=60)

    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
        # Fresh login (manifest token may have expired)
        print("[bench] Authenticating...")
        token = await login(session, args.host)
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # ── Warm-up: seed historical data for control limit calculation ──
        # The single-sample endpoint computes zone boundaries from historical
        # data. Without enough history, recalculate_limits() raises ValueError.
        # Insert a small batch per characteristic so limits can be calculated.
        print("[bench] Warming up (seeding control limit history)...")
        warmup_count = 50  # samples per characteristic
        for char_id in char_ids:
            subgroup = char_subgroups.get(char_id, 3)
            payload = {
                "characteristic_id": char_id,
                "skip_rule_evaluation": True,
                "samples": generate_batch_samples(warmup_count, subgroup),
            }
            async with session.post(
                f"{args.host}/api/v1/samples/batch",
                json=payload,
                headers=headers,
            ) as resp:
                if resp.status >= 300:
                    body = await resp.text()
                    print(f"  WARNING: warm-up failed for char {char_id}: {body[:100]}")
        print(f"  {warmup_count} samples × {len(char_ids)} characteristics")

        results: list[BenchResult] = []

        # ── Scenario A: Sequential baseline ───────────────────────
        print(f"\n[A] Sequential single-sample ({args.seq_duration}s)...")
        r = await scenario_sequential(
            session, args.host, token, char_ids, char_subgroups, args.seq_duration,
        )
        results.append(r)
        print(f"    {r.total_samples:,} samples, "
              f"{r.samples_per_min:,.0f}/min, P50={r.p50_ms:.1f}ms")

        # ── Scenario B: Concurrent single-sample ──────────────────
        for w in args.concurrency_levels:
            print(f"\n[B] Concurrent single-sample x{w} ({args.duration}s)...")
            r = await scenario_concurrent(
                session, args.host, token, char_ids, char_subgroups, args.duration, w,
            )
            results.append(r)
            print(f"    {r.total_samples:,} samples, "
                  f"{r.samples_per_min:,.0f}/min, P50={r.p50_ms:.1f}ms")

        # ── Scenario C: Batch import (skip rules) ─────────────────
        for w in args.batch_levels:
            print(f"\n[C] Batch 1000/req, skip rules, x{w} ({args.duration}s)...")
            r = await scenario_batch(
                session, args.host, token, char_ids, char_subgroups,
                args.duration, w, batch_size=1000, skip_rules=True,
            )
            results.append(r)
            print(f"    {r.total_samples:,} samples, "
                  f"{r.samples_per_min:,.0f}/min, P50={r.p50_ms:.1f}ms")

        # ── Scenario D: Batch import (full SPC) ───────────────────
        for w in args.batch_levels:
            print(f"\n[D] Batch 1000/req, full SPC, x{w} ({args.duration}s)...")
            r = await scenario_batch(
                session, args.host, token, char_ids, char_subgroups,
                args.duration, w, batch_size=1000, skip_rules=False,
            )
            results.append(r)
            print(f"    {r.total_samples:,} samples, "
                  f"{r.samples_per_min:,.0f}/min, P50={r.p50_ms:.1f}ms")

        # ── Scenario E: Batch import (async SPC) ──────────────────
        for w in args.batch_levels:
            print(f"\n[E] Batch 1000/req, async SPC, x{w} ({args.duration}s)...")
            r = await scenario_batch_async(
                session, args.host, token, char_ids, char_subgroups,
                args.duration, w, batch_size=1000,
            )
            results.append(r)
            print(f"    {r.total_samples:,} samples, "
                  f"{r.samples_per_min:,.0f}/min, P50={r.p50_ms:.1f}ms")

    print_results(results, args.uvicorn_workers)


def main():
    parser = argparse.ArgumentParser(
        description="Cassini ingestion throughput benchmark",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--host", default="http://localhost:8000")
    parser.add_argument("--manifest", default="manifest.json")
    parser.add_argument("--duration", type=int, default=30,
                        help="Duration per scenario in seconds (default: 30)")
    parser.add_argument("--seq-duration", type=int, default=10,
                        help="Duration for sequential scenario (default: 10)")
    parser.add_argument("--workers", type=int, default=50,
                        help="Max concurrent workers (default: 50)")
    parser.add_argument("--concurrency-levels", type=int, nargs="+",
                        default=None,
                        help="Concurrency levels to test (default: 10,50,100)")
    parser.add_argument("--batch-levels", type=int, nargs="+",
                        default=None,
                        help="Batch concurrency levels (default: 5,10)")
    parser.add_argument("--uvicorn-workers", type=int, default=1,
                        help="Number of uvicorn workers (for reporting only)")
    args = parser.parse_args()

    if args.concurrency_levels is None:
        args.concurrency_levels = [10, min(50, args.workers), min(100, args.workers)]
        # Deduplicate while preserving order
        seen = set()
        args.concurrency_levels = [
            x for x in args.concurrency_levels
            if not (x in seen or seen.add(x))
        ]

    if args.batch_levels is None:
        args.batch_levels = [5, 10]

    asyncio.run(run(args))


if __name__ == "__main__":
    main()
