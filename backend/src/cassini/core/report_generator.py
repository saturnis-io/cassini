"""Report generator — produces HTML reports and converts them to PDF.

Fetches SPC data (samples, violations, capability) for a given schedule scope
and renders an HTML report using inline Jinja2 templates. Converts to PDF via xhtml2pdf.
"""

from __future__ import annotations

import io
import json
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.db.models.capability import CapabilityHistory
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.report_schedule import ReportSchedule
from cassini.db.models.sample import Measurement, Sample
from cassini.db.models.violation import Violation

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# HTML template (inline Jinja2-style, but using Python string formatting)
# ---------------------------------------------------------------------------

_CSS = """
<style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; color: #1a1a2e; font-size: 11px; }
    .header { background: #1a1a2e; color: white; padding: 20px 24px; border-radius: 8px; margin-bottom: 20px; }
    .header h1 { margin: 0 0 4px 0; font-size: 18px; }
    .header .meta { font-size: 11px; opacity: 0.8; }
    .section { margin-bottom: 20px; }
    .section h2 { font-size: 14px; color: #1a1a2e; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin: 0 0 12px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th { background: #f1f5f9; text-align: left; padding: 6px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; }
    tr:hover td { background: #f8fafc; }
    .stat-grid { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; min-width: 120px; flex: 1; }
    .stat-card .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-card .value { font-size: 18px; font-weight: 600; color: #1a1a2e; margin-top: 2px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 600; text-transform: uppercase; }
    .badge-critical { background: #fee2e2; color: #dc2626; }
    .badge-warning { background: #fef3c7; color: #d97706; }
    .badge-info { background: #dbeafe; color: #2563eb; }
    .badge-success { background: #dcfce7; color: #16a34a; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; text-align: center; }
</style>
"""


def _severity_badge(severity: str) -> str:
    """Generate an HTML badge for a violation severity."""
    css_class = {
        "CRITICAL": "badge-critical",
        "WARNING": "badge-warning",
        "INFO": "badge-info",
    }.get(severity, "badge-info")
    return f'<span class="badge {css_class}">{severity}</span>'


async def generate_report(
    schedule: ReportSchedule, session: AsyncSession
) -> tuple[bytes, str]:
    """Generate an HTML report and convert it to PDF.

    Args:
        schedule: The report schedule configuration.
        session: Database session for querying data.

    Returns:
        Tuple of (pdf_bytes, html_content).
    """
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=schedule.window_days)

    # Resolve characteristics in scope
    char_ids = await _resolve_scope_characteristics(
        schedule.scope_type, schedule.scope_id, schedule.plant_id, session
    )

    # Fetch data
    stats = await _fetch_summary_stats(char_ids, window_start, session)
    violations = await _fetch_violations(char_ids, window_start, session)
    capability = await _fetch_capability(char_ids, session)
    char_names = await _get_characteristic_names(char_ids, session)

    # Fetch chart data for inline SVG control charts
    chart_data = await _fetch_chart_data(char_ids, window_start, session)

    # Build scope label
    scope_label = await _get_scope_label(
        schedule.scope_type, schedule.scope_id, schedule.plant_id, session
    )

    # Build HTML
    html = _build_html(
        report_name=schedule.name,
        template_id=schedule.template_id,
        scope_label=scope_label,
        generated_at=now,
        window_start=window_start,
        window_days=schedule.window_days,
        stats=stats,
        violations=violations,
        capability=capability,
        char_names=char_names,
        char_count=len(char_ids),
        chart_data=chart_data,
    )

    # Convert to PDF
    pdf_bytes = _html_to_pdf(html)

    return pdf_bytes, html


# ---------------------------------------------------------------------------
# Scope resolution
# ---------------------------------------------------------------------------


async def _resolve_scope_characteristics(
    scope_type: str,
    scope_id: int | None,
    plant_id: int,
    session: AsyncSession,
) -> list[int]:
    """Resolve the list of characteristic IDs for the report scope."""
    if scope_type == "characteristic" and scope_id is not None:
        return [scope_id]

    if scope_type == "hierarchy" and scope_id is not None:
        # Get all characteristics under this hierarchy node (and descendants)
        # First get all descendant hierarchy IDs
        hierarchy_ids = await _get_hierarchy_descendants(scope_id, session)
        stmt = select(Characteristic.id).where(
            Characteristic.hierarchy_id.in_(hierarchy_ids)
        )
        result = await session.execute(stmt)
        return [row[0] for row in result.all()]

    # Plant-wide: get all characteristics for this plant
    stmt = (
        select(Characteristic.id)
        .join(Hierarchy, Characteristic.hierarchy_id == Hierarchy.id)
        .where(Hierarchy.plant_id == plant_id)
    )
    result = await session.execute(stmt)
    return [row[0] for row in result.all()]


async def _get_hierarchy_descendants(
    hierarchy_id: int, session: AsyncSession
) -> list[int]:
    """Get a hierarchy node and all its descendants (BFS)."""
    ids = [hierarchy_id]
    queue = [hierarchy_id]

    while queue:
        parent_id = queue.pop(0)
        stmt = select(Hierarchy.id).where(Hierarchy.parent_id == parent_id)
        result = await session.execute(stmt)
        children = [row[0] for row in result.all()]
        ids.extend(children)
        queue.extend(children)

    return ids


# ---------------------------------------------------------------------------
# Data fetching
# ---------------------------------------------------------------------------


async def _fetch_summary_stats(
    char_ids: list[int],
    window_start: datetime,
    session: AsyncSession,
) -> dict:
    """Fetch summary statistics for the report period."""
    if not char_ids:
        return {"total_samples": 0, "total_violations": 0, "chars_in_control": 0}

    # Total samples in window
    sample_count = (
        await session.execute(
            select(func.count(Sample.id)).where(
                Sample.char_id.in_(char_ids),
                Sample.timestamp >= window_start,
            )
        )
    ).scalar_one()

    # Total violations in window
    violation_count = (
        await session.execute(
            select(func.count(Violation.id)).where(
                Violation.char_id.in_(char_ids),
                Violation.created_at >= window_start,
            )
        )
    ).scalar_one()

    # Characteristics in control (no unacknowledged violations in window)
    chars_with_violations_stmt = (
        select(Violation.char_id)
        .where(
            Violation.char_id.in_(char_ids),
            Violation.created_at >= window_start,
            Violation.acknowledged.is_(False),
        )
        .distinct()
    )
    result = await session.execute(chars_with_violations_stmt)
    chars_with_violations = {row[0] for row in result.all()}
    chars_in_control = len(char_ids) - len(chars_with_violations)

    return {
        "total_samples": sample_count,
        "total_violations": violation_count,
        "chars_in_control": chars_in_control,
    }


async def _fetch_violations(
    char_ids: list[int],
    window_start: datetime,
    session: AsyncSession,
) -> list[dict]:
    """Fetch recent violations for the report."""
    if not char_ids:
        return []

    stmt = (
        select(
            Violation.id,
            Violation.rule_name,
            Violation.severity,
            Violation.acknowledged,
            Violation.created_at,
            Violation.char_id,
        )
        .where(
            Violation.char_id.in_(char_ids),
            Violation.created_at >= window_start,
        )
        .order_by(Violation.created_at.desc())
        .limit(100)
    )
    result = await session.execute(stmt)
    return [
        {
            "id": row[0],
            "rule_name": row[1],
            "severity": row[2].value if hasattr(row[2], "value") else str(row[2]),
            "acknowledged": row[3],
            "created_at": row[4],
            "char_id": row[5],
        }
        for row in result.all()
    ]


async def _fetch_capability(
    char_ids: list[int], session: AsyncSession
) -> list[dict]:
    """Fetch the latest capability snapshot for each characteristic."""
    if not char_ids:
        return []

    results = []
    for char_id in char_ids:
        stmt = (
            select(CapabilityHistory)
            .where(CapabilityHistory.characteristic_id == char_id)
            .order_by(CapabilityHistory.calculated_at.desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        cap = result.scalar_one_or_none()
        if cap:
            results.append(
                {
                    "char_id": char_id,
                    "cp": cap.cp,
                    "cpk": cap.cpk,
                    "pp": cap.pp,
                    "ppk": cap.ppk,
                    "sample_count": cap.sample_count,
                    "calculated_at": cap.calculated_at,
                }
            )
    return results


async def _get_characteristic_names(
    char_ids: list[int], session: AsyncSession
) -> dict[int, str]:
    """Get a mapping of characteristic ID to name."""
    if not char_ids:
        return {}
    stmt = select(Characteristic.id, Characteristic.name).where(
        Characteristic.id.in_(char_ids)
    )
    result = await session.execute(stmt)
    return dict(result.all())


async def _fetch_chart_data(
    char_ids: list[int],
    window_start: datetime,
    session: AsyncSession,
) -> dict[int, dict]:
    """Fetch recent sample data and control limits for SVG chart rendering.

    Returns a dict keyed by char_id with keys:
    - values: list of floats (subgroup means)
    - ucl, lcl, center_line: control limits
    - violation_indices: set of indices where violations occurred
    """
    if not char_ids:
        return {}

    results: dict[int, dict] = {}
    max_points = 50  # Last 50 subgroups per chart

    for char_id in char_ids:
        # Get characteristic control limits
        char_stmt = select(
            Characteristic.ucl, Characteristic.lcl, Characteristic.stored_center_line
        ).where(Characteristic.id == char_id)
        char_result = await session.execute(char_stmt)
        char_row = char_result.first()
        if not char_row:
            continue

        ucl, lcl, center_line = char_row

        # Get last N samples with measurements
        sample_stmt = (
            select(Sample)
            .options(selectinload(Sample.measurements))
            .where(
                Sample.char_id == char_id,
                Sample.timestamp >= window_start,
                Sample.is_excluded.is_(False),
            )
            .order_by(Sample.timestamp.desc())
            .limit(max_points)
        )
        sample_result = await session.execute(sample_stmt)
        samples = list(reversed(sample_result.scalars().all()))

        if not samples:
            continue

        # Compute subgroup means
        values: list[float] = []
        for s in samples:
            if s.measurements:
                mean = sum(m.value for m in s.measurements) / len(s.measurements)
                values.append(mean)

        if not values:
            continue

        # Find which points have violations
        sample_ids = [s.id for s in samples]
        violation_stmt = (
            select(Violation.sample_id)
            .where(Violation.sample_id.in_(sample_ids))
            .distinct()
        )
        violation_result = await session.execute(violation_stmt)
        violation_sample_ids = {row[0] for row in violation_result.all()}

        violation_indices: set[int] = set()
        for idx, s in enumerate(samples):
            if idx < len(values) and s.id in violation_sample_ids:
                violation_indices.add(idx)

        results[char_id] = {
            "values": values,
            "ucl": ucl,
            "lcl": lcl,
            "center_line": center_line,
            "violation_indices": violation_indices,
        }

    return results


async def _get_scope_label(
    scope_type: str,
    scope_id: int | None,
    plant_id: int,
    session: AsyncSession,
) -> str:
    """Build a human-readable label for the report scope."""
    if scope_type == "characteristic" and scope_id is not None:
        stmt = select(Characteristic.name).where(Characteristic.id == scope_id)
        result = await session.execute(stmt)
        name = result.scalar_one_or_none()
        return f"Characteristic: {name or scope_id}"

    if scope_type == "hierarchy" and scope_id is not None:
        stmt = select(Hierarchy.name).where(Hierarchy.id == scope_id)
        result = await session.execute(stmt)
        name = result.scalar_one_or_none()
        return f"Hierarchy: {name or scope_id}"

    from cassini.db.models.plant import Plant

    stmt = select(Plant.name).where(Plant.id == plant_id)
    result = await session.execute(stmt)
    name = result.scalar_one_or_none()
    return f"Plant: {name or plant_id}"


# ---------------------------------------------------------------------------
# SVG chart generation (no matplotlib — pure string templates)
# ---------------------------------------------------------------------------


def _generate_svg_chart(
    values: list[float],
    ucl: float | None,
    lcl: float | None,
    center_line: float | None,
    violation_indices: set[int],
    char_name: str,
    width: int = 500,
    height: int = 160,
) -> str:
    """Generate an inline SVG control chart for a characteristic.

    Renders a polyline of data points with horizontal limit lines
    and red circles for violation points. Designed to embed in HTML
    emails and PDF reports (xhtml2pdf renders inline SVG).
    """
    if not values:
        return ""

    n = len(values)
    padding_left = 50
    padding_right = 10
    padding_top = 20
    padding_bottom = 25
    plot_w = width - padding_left - padding_right
    plot_h = height - padding_top - padding_bottom

    # Determine y-axis range from data + limits
    all_vals = list(values)
    if ucl is not None:
        all_vals.append(ucl)
    if lcl is not None:
        all_vals.append(lcl)
    if center_line is not None:
        all_vals.append(center_line)

    y_min = min(all_vals)
    y_max = max(all_vals)
    y_range = y_max - y_min
    if y_range == 0:
        y_range = 1.0  # Prevent division by zero for flat data
    # Add 10% padding
    y_min -= y_range * 0.1
    y_max += y_range * 0.1
    y_range = y_max - y_min

    def x_pos(idx: int) -> float:
        if n <= 1:
            return padding_left + plot_w / 2
        return padding_left + (idx / (n - 1)) * plot_w

    def y_pos(val: float) -> float:
        return padding_top + (1 - (val - y_min) / y_range) * plot_h

    # Build SVG
    parts: list[str] = []
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{width}" height="{height}" '
        f'style="background: #fafbfc; border: 1px solid #e2e8f0; border-radius: 4px; margin-bottom: 8px;">'
    )

    # Title
    parts.append(
        f'<text x="{padding_left}" y="14" '
        f'font-size="10" font-family="Segoe UI, sans-serif" fill="#1a1a2e">'
        f"{_escape(char_name)}</text>"
    )

    # Plot area background
    parts.append(
        f'<rect x="{padding_left}" y="{padding_top}" '
        f'width="{plot_w}" height="{plot_h}" fill="white" stroke="#e2e8f0"/>'
    )

    # Limit lines
    if ucl is not None:
        uy = y_pos(ucl)
        parts.append(
            f'<line x1="{padding_left}" y1="{uy:.1f}" '
            f'x2="{padding_left + plot_w}" y2="{uy:.1f}" '
            f'stroke="#dc2626" stroke-width="1" stroke-dasharray="4,3"/>'
        )
        parts.append(
            f'<text x="{padding_left - 3}" y="{uy + 3:.1f}" '
            f'font-size="8" text-anchor="end" fill="#dc2626">UCL</text>'
        )

    if lcl is not None:
        ly = y_pos(lcl)
        parts.append(
            f'<line x1="{padding_left}" y1="{ly:.1f}" '
            f'x2="{padding_left + plot_w}" y2="{ly:.1f}" '
            f'stroke="#dc2626" stroke-width="1" stroke-dasharray="4,3"/>'
        )
        parts.append(
            f'<text x="{padding_left - 3}" y="{ly + 3:.1f}" '
            f'font-size="8" text-anchor="end" fill="#dc2626">LCL</text>'
        )

    if center_line is not None:
        cy = y_pos(center_line)
        parts.append(
            f'<line x1="{padding_left}" y1="{cy:.1f}" '
            f'x2="{padding_left + plot_w}" y2="{cy:.1f}" '
            f'stroke="#16a34a" stroke-width="1.5"/>'
        )
        parts.append(
            f'<text x="{padding_left - 3}" y="{cy + 3:.1f}" '
            f'font-size="8" text-anchor="end" fill="#16a34a">CL</text>'
        )

    # Data polyline
    points_str = " ".join(f"{x_pos(i):.1f},{y_pos(v):.1f}" for i, v in enumerate(values))
    parts.append(
        f'<polyline points="{points_str}" '
        f'fill="none" stroke="#3b82f6" stroke-width="1.5"/>'
    )

    # Data points (small circles)
    for i, v in enumerate(values):
        cx = x_pos(i)
        cy = y_pos(v)
        if i in violation_indices:
            # Violation point: red, larger
            parts.append(
                f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="4" '
                f'fill="#dc2626" stroke="white" stroke-width="1"/>'
            )
        else:
            # Normal point
            parts.append(
                f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="2.5" '
                f'fill="#3b82f6" stroke="white" stroke-width="0.5"/>'
            )

    # X-axis label
    parts.append(
        f'<text x="{padding_left + plot_w / 2}" y="{height - 3}" '
        f'font-size="8" text-anchor="middle" fill="#94a3b8">'
        f'{n} samples</text>'
    )

    parts.append("</svg>")
    return "".join(parts)


# ---------------------------------------------------------------------------
# HTML builder
# ---------------------------------------------------------------------------


def _build_html(
    report_name: str,
    template_id: str,
    scope_label: str,
    generated_at: datetime,
    window_start: datetime,
    window_days: int,
    stats: dict,
    violations: list[dict],
    capability: list[dict],
    char_names: dict[int, str],
    char_count: int,
    chart_data: dict[int, dict] | None = None,
) -> str:
    """Build the full HTML report."""
    if chart_data is None:
        chart_data = {}

    parts = [
        "<html><head>",
        _CSS,
        "</head><body>",
    ]

    # Header
    parts.append(f"""
    <div class="header">
        <h1>{_escape(report_name)}</h1>
        <div class="meta">
            {_escape(scope_label)} &bull;
            {generated_at.strftime('%B %d, %Y %H:%M UTC')} &bull;
            Last {window_days} days
        </div>
    </div>
    """)

    # Summary statistics
    parts.append("""<div class="section"><h2>Summary</h2>""")
    parts.append("""<div class="stat-grid">""")
    parts.append(f"""
        <div class="stat-card">
            <div class="label">Characteristics</div>
            <div class="value">{char_count}</div>
        </div>
        <div class="stat-card">
            <div class="label">Samples</div>
            <div class="value">{stats['total_samples']:,}</div>
        </div>
        <div class="stat-card">
            <div class="label">Violations</div>
            <div class="value">{stats['total_violations']:,}</div>
        </div>
        <div class="stat-card">
            <div class="label">In Control</div>
            <div class="value">{stats['chars_in_control']}/{char_count}</div>
        </div>
    """)
    parts.append("</div></div>")

    # Control limit status
    if char_count > 0:
        in_control_pct = (
            round(stats["chars_in_control"] / char_count * 100, 1) if char_count else 0
        )
        parts.append("""<div class="section"><h2>Control Status</h2>""")
        ctl_badge = "badge-success" if in_control_pct >= 90 else (
            "badge-warning" if in_control_pct >= 70 else "badge-critical"
        )
        parts.append(f"""
            <p>
                <span class="badge {ctl_badge}">{in_control_pct}% in control</span>
                &mdash; {stats['chars_in_control']} of {char_count} characteristics
                have no unacknowledged violations in the reporting window.
            </p>
        """)
        parts.append("</div>")

    # Inline SVG control charts
    if chart_data:
        parts.append("""<div class="section"><h2>Control Charts</h2>""")
        for char_id, cdata in chart_data.items():
            char_name = char_names.get(char_id, str(char_id))
            svg = _generate_svg_chart(
                values=cdata["values"],
                ucl=cdata["ucl"],
                lcl=cdata["lcl"],
                center_line=cdata["center_line"],
                violation_indices=cdata["violation_indices"],
                char_name=char_name,
            )
            parts.append(svg)
        parts.append("</div>")

    # Recent violations table
    if violations:
        parts.append("""<div class="section"><h2>Recent Violations</h2>""")
        parts.append("""<table><thead><tr>
            <th>ID</th>
            <th>Characteristic</th>
            <th>Rule</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Time</th>
        </tr></thead><tbody>""")

        for v in violations[:50]:
            char_name = char_names.get(v["char_id"], str(v["char_id"]))
            ack_label = "Acknowledged" if v["acknowledged"] else "Open"
            created = (
                v["created_at"].strftime("%m/%d %H:%M")
                if isinstance(v["created_at"], datetime)
                else str(v["created_at"])
            )
            parts.append(f"""<tr>
                <td>{v['id']}</td>
                <td>{_escape(char_name)}</td>
                <td>{_escape(v['rule_name'])}</td>
                <td>{_severity_badge(v['severity'])}</td>
                <td>{ack_label}</td>
                <td>{created}</td>
            </tr>""")

        parts.append("</tbody></table></div>")

    # Capability metrics
    if capability:
        parts.append("""<div class="section"><h2>Capability Metrics</h2>""")
        parts.append("""<table><thead><tr>
            <th>Characteristic</th>
            <th>Cp</th>
            <th>Cpk</th>
            <th>Pp</th>
            <th>Ppk</th>
            <th>Samples</th>
        </tr></thead><tbody>""")

        for cap in capability:
            char_name = char_names.get(cap["char_id"], str(cap["char_id"]))

            def _fmt(val):
                return f"{val:.3f}" if val is not None else "-"

            cpk_val = cap.get("cpk")
            cpk_style = ""
            if cpk_val is not None:
                if cpk_val < 1.0:
                    cpk_style = ' style="color: #dc2626; font-weight: 600;"'
                elif cpk_val < 1.33:
                    cpk_style = ' style="color: #d97706; font-weight: 600;"'
                else:
                    cpk_style = ' style="color: #16a34a; font-weight: 600;"'

            parts.append(f"""<tr>
                <td>{_escape(char_name)}</td>
                <td>{_fmt(cap.get('cp'))}</td>
                <td{cpk_style}>{_fmt(cpk_val)}</td>
                <td>{_fmt(cap.get('pp'))}</td>
                <td>{_fmt(cap.get('ppk'))}</td>
                <td>{cap.get('sample_count', 0)}</td>
            </tr>""")

        parts.append("</tbody></table></div>")

    # Footer
    parts.append(f"""
    <div class="footer">
        Generated by Cassini &bull; {generated_at.strftime('%Y-%m-%d %H:%M:%S UTC')}
    </div>
    """)

    parts.append("</body></html>")
    return "".join(parts)


def _escape(text: str) -> str:
    """Basic HTML escaping."""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


# ---------------------------------------------------------------------------
# PDF conversion
# ---------------------------------------------------------------------------


def _html_to_pdf(html: str) -> bytes:
    """Convert HTML to PDF using xhtml2pdf."""
    try:
        from xhtml2pdf import pisa

        buffer = io.BytesIO()
        pisa_status = pisa.CreatePDF(html, dest=buffer)
        if pisa_status.err:
            logger.warning("pdf_conversion_warnings", error_count=pisa_status.err)
        pdf_bytes = buffer.getvalue()
        buffer.close()
        return pdf_bytes
    except ImportError:
        logger.warning("xhtml2pdf not installed — returning empty PDF")
        return b""
