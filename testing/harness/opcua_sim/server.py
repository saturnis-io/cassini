"""OPC-UA simulator for the Cassini test harness.

Exposes a small set of variable nodes that evolve over time so an SPC engine
subscribed to them sees realistic signals: occasional shifts, slight noise,
and a few deterministic special-cause events. Designed to be run as a single
docker container — no external dependencies beyond ``asyncua``.

Endpoint: ``opc.tcp://0.0.0.0:4840/cassini/test/`` (anonymous, no encryption).

Tags exposed under namespace URI ``urn:cassini:test:opcua-sim``:

    GageStation/BoreDiameter         (Double, mm)   nominal 25.000, sigma 0.012
    GageStation/ShaftLength          (Double, mm)   nominal 100.000, sigma 0.050
    GageStation/Temperature          (Double, degC) nominal 22.0, slow drift
    GageStation/Pressure             (Double, kPa)  nominal 101.3, sigma 0.20
    GageStation/Torque               (Double, Nm)   nominal 8.0, sigma 0.15
    GageStation/PartCount            (UInt32)       monotonic counter
    GageStation/MachineState         (String)       cycles RUN/IDLE/ALARM
    GageStation/LastInspectionPassed (Boolean)      attribute pass/fail

Behaviour notes:
    - Normal noise: ``random.gauss`` per tick.
    - Every ``SHIFT_INTERVAL_TICKS`` the BoreDiameter mean shifts by 0.5 sigma
      to give the SPC engine a Western Electric / Nelson signal to detect.
    - MachineState cycles through values to test categorical/state ingestion.
"""

from __future__ import annotations

import asyncio
import logging
import math
import random
import signal
from dataclasses import dataclass

from asyncua import Server, ua

LOGGER = logging.getLogger("cassini.opcua_sim")

ENDPOINT = "opc.tcp://0.0.0.0:4840/cassini/test/"
NAMESPACE_URI = "urn:cassini:test:opcua-sim"
SERVER_NAME = "Cassini Test OPC-UA Simulator"
TICK_SECONDS = 1.0
SHIFT_INTERVAL_TICKS = 60  # one minute at 1 Hz
MACHINE_STATES = ("RUN", "RUN", "RUN", "IDLE", "RUN", "ALARM")


@dataclass
class GaugeSpec:
    """Specification for a numeric process variable."""

    name: str
    nominal: float
    sigma: float
    drift_per_tick: float = 0.0
    units: str = ""


GAUGE_SPECS: list[GaugeSpec] = [
    GaugeSpec("BoreDiameter", nominal=25.000, sigma=0.012, units="mm"),
    GaugeSpec("ShaftLength", nominal=100.000, sigma=0.050, units="mm"),
    GaugeSpec("Temperature", nominal=22.0, sigma=0.10, drift_per_tick=0.0005, units="degC"),
    GaugeSpec("Pressure", nominal=101.3, sigma=0.20, units="kPa"),
    GaugeSpec("Torque", nominal=8.0, sigma=0.15, units="Nm"),
]


async def build_server() -> tuple[Server, dict[str, object]]:
    """Construct and configure the asyncua Server, returning handles to nodes."""
    server = Server()
    await server.init()
    server.set_endpoint(ENDPOINT)
    server.set_server_name(SERVER_NAME)
    server.set_security_policy([ua.SecurityPolicyType.NoSecurity])

    namespace_idx = await server.register_namespace(NAMESPACE_URI)
    objects = server.nodes.objects
    station = await objects.add_object(namespace_idx, "GageStation")

    nodes: dict[str, object] = {}

    for spec in GAUGE_SPECS:
        var = await station.add_variable(
            namespace_idx, spec.name, float(spec.nominal), ua.VariantType.Double
        )
        await var.set_writable()
        nodes[spec.name] = var

    part_count = await station.add_variable(
        namespace_idx, "PartCount", 0, ua.VariantType.UInt32
    )
    await part_count.set_writable()
    nodes["PartCount"] = part_count

    machine_state = await station.add_variable(
        namespace_idx, "MachineState", "RUN", ua.VariantType.String
    )
    await machine_state.set_writable()
    nodes["MachineState"] = machine_state

    last_pass = await station.add_variable(
        namespace_idx,
        "LastInspectionPassed",
        True,
        ua.VariantType.Boolean,
    )
    await last_pass.set_writable()
    nodes["LastInspectionPassed"] = last_pass

    return server, nodes


async def update_loop(nodes: dict[str, object], stop: asyncio.Event) -> None:
    """Drive the variables with realistic noise and special-cause events."""
    rng = random.Random(20260505)
    tick = 0
    bore_shift = 0.0

    while not stop.is_set():
        tick += 1

        # Apply a 0.5-sigma shift on BoreDiameter once per SHIFT_INTERVAL_TICKS
        # to give SPC rules something to catch.
        if tick % SHIFT_INTERVAL_TICKS == 0:
            bore_shift = rng.choice((-0.5, 0.0, 0.5)) * GAUGE_SPECS[0].sigma

        for spec in GAUGE_SPECS:
            mean = spec.nominal + spec.drift_per_tick * tick
            if spec.name == "BoreDiameter":
                mean += bore_shift
            value = rng.gauss(mean, spec.sigma)
            # Add a faint sinusoid on Temperature so simple plots look alive.
            if spec.name == "Temperature":
                value += 0.05 * math.sin(tick / 30.0)
            await nodes[spec.name].write_value(float(value))

        await nodes["PartCount"].write_value(tick)
        await nodes["MachineState"].write_value(
            MACHINE_STATES[tick % len(MACHINE_STATES)]
        )
        # Pass rate ~95%
        await nodes["LastInspectionPassed"].write_value(rng.random() > 0.05)

        try:
            await asyncio.wait_for(stop.wait(), timeout=TICK_SECONDS)
        except asyncio.TimeoutError:
            continue


async def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    server, nodes = await build_server()

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig_name in ("SIGINT", "SIGTERM"):
        sig = getattr(signal, sig_name, None)
        if sig is None:
            continue
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:
            # Windows asyncio loop doesn't support add_signal_handler.
            pass

    LOGGER.info("Starting OPC-UA simulator at %s", ENDPOINT)
    async with server:
        updater = asyncio.create_task(update_loop(nodes, stop))
        await stop.wait()
        updater.cancel()
        try:
            await updater
        except asyncio.CancelledError:
            pass
    LOGGER.info("OPC-UA simulator stopped")


if __name__ == "__main__":
    asyncio.run(main())
