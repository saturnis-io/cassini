"""YAML -> CepRuleSpec loader with structured error reporting.

The frontend Monaco editor expects validation errors in
``{line, column, message}`` form so it can render markers directly. This
module wraps PyYAML's ``MarkedYAMLError`` and Pydantic's
``ValidationError`` into that shape.
"""
from __future__ import annotations

from typing import Any

import yaml
from pydantic import ValidationError

from cassini.api.schemas.cep import CepRuleSpec


class CepYamlError(ValueError):
    """Structured CEP YAML validation error.

    ``errors`` is the list of ``{line, column, message, location}`` dicts
    surfaced to the editor. ``message`` retains a human-readable summary
    so server logs and HTTP error bodies stay useful.
    """

    def __init__(self, message: str, errors: list[dict[str, Any]]):
        super().__init__(message)
        self.errors = errors


def _yaml_to_dict(text: str) -> dict[str, Any]:
    """Parse YAML to a dict, raising ``CepYamlError`` on syntax errors.

    Uses ``safe_load`` so YAML constructors can never execute code.
    """
    try:
        loaded = yaml.safe_load(text)
    except yaml.MarkedYAMLError as exc:
        mark = exc.problem_mark
        line = mark.line + 1 if mark is not None else 1
        column = mark.column + 1 if mark is not None else 1
        msg = exc.problem or "YAML syntax error"
        raise CepYamlError(
            f"YAML syntax error at line {line}: {msg}",
            errors=[{"line": line, "column": column, "message": msg, "location": "yaml"}],
        ) from exc

    if loaded is None:
        raise CepYamlError(
            "Document is empty",
            errors=[{"line": 1, "column": 1, "message": "Document is empty", "location": "yaml"}],
        )
    if not isinstance(loaded, dict):
        raise CepYamlError(
            "Top-level YAML must be a mapping (object)",
            errors=[{
                "line": 1, "column": 1,
                "message": "Top-level YAML must be a mapping (object)",
                "location": "yaml",
            }],
        )
    return loaded


def _format_pydantic_error(text: str, exc: ValidationError) -> CepYamlError:
    """Wrap ``ValidationError`` so editor markers can locate each problem.

    Pydantic v2 doesn't give us source positions, so we lazily approximate
    by searching for the offending key in the YAML text. Best-effort —
    when no match is found, we point at line 1.
    """
    lines = text.splitlines()
    formatted: list[dict[str, Any]] = []
    for err in exc.errors():
        loc_path = ".".join(str(p) for p in err.get("loc", ()))
        message = err.get("msg", "validation error")
        line, column = _locate_in_yaml(lines, err.get("loc", ()))
        formatted.append({
            "line": line,
            "column": column,
            "message": f"{loc_path}: {message}" if loc_path else message,
            "location": loc_path or "schema",
        })
    summary = "; ".join(e["message"] for e in formatted) or "schema validation failed"
    return CepYamlError(summary, errors=formatted)


def _locate_in_yaml(lines: list[str], loc: tuple[Any, ...]) -> tuple[int, int]:
    """Best-effort search for the YAML position of a Pydantic loc tuple."""
    if not loc:
        return 1, 1
    # Try the deepest string segment first — typically the offending key
    for segment in reversed(loc):
        if isinstance(segment, str) and segment:
            for idx, line in enumerate(lines, start=1):
                col = line.find(segment)
                if col >= 0:
                    return idx, col + 1
    return 1, 1


def load_rule_from_yaml(text: str) -> CepRuleSpec:
    """Strict YAML -> ``CepRuleSpec`` parser.

    Args:
        text: Raw YAML source authored by the user.

    Returns:
        Validated ``CepRuleSpec``.

    Raises:
        CepYamlError: If the YAML is malformed or fails schema validation.
    """
    data = _yaml_to_dict(text)
    try:
        return CepRuleSpec.model_validate(data)
    except ValidationError as exc:
        raise _format_pydantic_error(text, exc) from exc
