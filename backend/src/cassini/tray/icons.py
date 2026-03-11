"""Status icon generation for the Cassini system tray.

Creates simple 64x64 icons with a colored status indicator using
Pillow. No external icon assets required.
"""

from __future__ import annotations

from PIL import Image, ImageDraw

STATUS_COLORS: dict[str, str] = {
    "running": "#22c55e",   # green
    "stopped": "#ef4444",   # red
    "starting": "#eab308",  # yellow
    "unknown": "#6b7280",   # gray
}


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """Convert a hex color string to an RGB tuple."""
    hex_color = hex_color.lstrip("#")
    return (
        int(hex_color[0:2], 16),
        int(hex_color[2:4], 16),
        int(hex_color[4:6], 16),
    )


def create_status_icon(status: str) -> Image.Image:
    """Create a 64x64 icon with a colored status indicator.

    The icon is a filled circle centered on a transparent background.
    The circle color corresponds to the server status:
    - running: green
    - stopped: red
    - starting: yellow
    - unknown: gray

    Unrecognized status values fall back to the "unknown" color.

    Args:
        status: One of "running", "stopped", "starting", "unknown".

    Returns:
        A 64x64 RGBA Pillow Image.
    """
    color_hex = STATUS_COLORS.get(status, STATUS_COLORS["unknown"])
    color_rgb = _hex_to_rgb(color_hex)

    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Outer circle — full color
    margin = 4
    draw.ellipse(
        [margin, margin, size - margin - 1, size - margin - 1],
        fill=(*color_rgb, 255),
    )

    # Inner highlight — lighter center for depth
    highlight_margin = 16
    lighter = tuple(min(c + 60, 255) for c in color_rgb)
    draw.ellipse(
        [
            highlight_margin,
            highlight_margin,
            size - highlight_margin - 1,
            size - highlight_margin - 1,
        ],
        fill=(*lighter, 180),
    )

    # "C" letter overlay for brand recognition
    letter_color = (255, 255, 255, 200)
    # Draw a simple "C" using arcs
    letter_margin = 18
    bbox = [
        letter_margin,
        letter_margin,
        size - letter_margin - 1,
        size - letter_margin - 1,
    ]
    draw.arc(bbox, start=45, end=315, fill=letter_color, width=3)

    return img
