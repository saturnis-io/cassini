"""Per-characteristic CEP condition evaluator.

Each :class:`CepCondition` is reduced to a tiny per-characteristic state
machine that consumes :class:`SampleProcessedEvent` instances in order
and reports whether the predicate is currently satisfied.

The semantics intentionally mirror well-known Nelson rule patterns so
SPC engineers can reason about CEP rules in vocabulary they already use:

* ``above_mean_consecutive`` / ``below_mean_consecutive`` — N points in
  a row strictly above / below the centre line (Nelson rule 2 shape).
* ``above_value`` / ``below_value`` — N points in a row above / below
  an absolute threshold provided in the rule.
* ``out_of_control`` — a single point outside the control limits, as
  reported by the SPC engine via ``in_control`` on the event.
* ``increasing`` / ``decreasing`` — N points in a row trending in one
  direction (Nelson rule 3 shape).

Streaming, not batched: each method takes a single event and returns the
new "matched" boolean. We never re-scan history because the SPC engine
already streams in the canonical order via the event bus. We DO keep a
small ring buffer (``maxlen = max(count, 2)``) so trend-style rules can
look at the previous value.

Centre-line resolution
----------------------
``above_mean_consecutive`` / ``below_mean_consecutive`` need the centre
line to evaluate. We do NOT re-query the DB on the hot path — the
:class:`SampleProcessedEvent` carries ``mean`` (the subgroup mean) but
not the centre line, so we accept a centre-line resolver callback that
the engine populates from a per-characteristic cache. When the centre
line is unknown we fall back to the rolling mean of the events we have
seen, which is a sensible streaming approximation and avoids dropping
samples while the cache warms up.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Any, Callable, Deque, Optional

from cassini.api.schemas.cep import CepCondition, CepConditionKind


# Type for the centre-line resolver. Returning ``None`` signals "unknown" —
# the evaluator then uses the running mean fallback.
CenterLineResolver = Callable[[int], Optional[float]]


def _running_mean(values: Deque[float]) -> Optional[float]:
    """Stream-friendly mean of the buffered values (None if empty)."""
    if not values:
        return None
    return sum(values) / len(values)


@dataclass
class CepConditionState:
    """Per-condition streaming state.

    Tracks recent values for a single characteristic so the condition can
    be re-evaluated after each new sample without re-scanning history.

    Attributes:
        condition: The condition spec being evaluated.
        values: Recent sample means (size-bounded by ``count``).
        in_control_flags: Recent ``in_control`` flags (mirrors ``values``).
        consecutive_hits: Number of consecutive hits accumulated so far.
        last_match_at_count: Total samples seen at the moment of the last match.
        total_samples: Total number of samples observed by this state.
    """

    condition: CepCondition
    values: Deque[float]
    in_control_flags: Deque[bool]
    consecutive_hits: int = 0
    last_match_at_count: Optional[int] = None
    total_samples: int = 0

    @classmethod
    def for_condition(cls, condition: CepCondition) -> "CepConditionState":
        # Buffer must be at least 2 long so trend rules can compare to
        # the prior value even when ``count == 1``.
        buffer_size = max(condition.count, 2)
        return cls(
            condition=condition,
            values=deque(maxlen=buffer_size),
            in_control_flags=deque(maxlen=buffer_size),
        )


def evaluate_condition_against_sample(
    state: CepConditionState,
    value: float,
    in_control: bool,
    center_line: Optional[float],
) -> bool:
    """Update ``state`` with a new sample and return whether the condition matches now.

    "Match" means the condition's full predicate (e.g. ``count`` consecutive
    above-mean points) is satisfied as of this sample. Each call advances
    the streaming state regardless of the return value.

    Args:
        state: Per-condition streaming state (mutated in place).
        value: Sample mean (or single-measurement value for n=1).
        in_control: Whether the SPC engine considered this sample in control.
        center_line: Resolved centre line for the characteristic, or
            ``None`` if unknown. When None, mean-based rules fall back to
            the running mean of buffered values.

    Returns:
        True iff the predicate was satisfied as of this sample.
    """
    state.total_samples += 1
    state.values.append(value)
    state.in_control_flags.append(in_control)

    rule = state.condition.rule
    count = state.condition.count

    # Resolve centre line — explicit value if known, otherwise running mean.
    # Streaming approximation: matches operator intuition once enough
    # samples have flowed through, and avoids stalling rule evaluation
    # while the engine warms its centre-line cache.
    effective_center = center_line if center_line is not None else _running_mean(state.values)

    matched_this_sample = False

    if rule == CepConditionKind.above_mean_consecutive:
        if effective_center is not None and value > effective_center:
            state.consecutive_hits += 1
        else:
            state.consecutive_hits = 0
        matched_this_sample = state.consecutive_hits >= count

    elif rule == CepConditionKind.below_mean_consecutive:
        if effective_center is not None and value < effective_center:
            state.consecutive_hits += 1
        else:
            state.consecutive_hits = 0
        matched_this_sample = state.consecutive_hits >= count

    elif rule == CepConditionKind.above_value:
        threshold = state.condition.threshold
        if threshold is not None and value > threshold:
            state.consecutive_hits += 1
        else:
            state.consecutive_hits = 0
        matched_this_sample = state.consecutive_hits >= count

    elif rule == CepConditionKind.below_value:
        threshold = state.condition.threshold
        if threshold is not None and value < threshold:
            state.consecutive_hits += 1
        else:
            state.consecutive_hits = 0
        matched_this_sample = state.consecutive_hits >= count

    elif rule == CepConditionKind.out_of_control:
        # A single OOC point per ``count`` window. ``count`` lets users
        # require N consecutive OOC samples (rare in practice but cheap
        # to support).
        if not in_control:
            state.consecutive_hits += 1
        else:
            state.consecutive_hits = 0
        matched_this_sample = state.consecutive_hits >= count

    elif rule == CepConditionKind.increasing:
        if len(state.values) >= 2 and state.values[-1] > state.values[-2]:
            state.consecutive_hits += 1
        else:
            state.consecutive_hits = 0
        # ``count`` consecutive UPs require count+1 points (pairs of
        # comparisons). Mirror that to keep the operator-facing meaning
        # consistent with Nelson rule 3.
        matched_this_sample = state.consecutive_hits >= count

    elif rule == CepConditionKind.decreasing:
        if len(state.values) >= 2 and state.values[-1] < state.values[-2]:
            state.consecutive_hits += 1
        else:
            state.consecutive_hits = 0
        matched_this_sample = state.consecutive_hits >= count

    if matched_this_sample:
        state.last_match_at_count = state.total_samples

    return matched_this_sample


def fingerprint_condition(condition: CepCondition) -> tuple[Any, ...]:
    """Return a hashable fingerprint identifying a condition.

    Used by the engine to decide whether a rule edit invalidates an
    existing per-characteristic state machine. Two conditions with the
    same fingerprint can safely share state across reloads.
    """
    return (
        condition.characteristic,
        condition.rule.value,
        condition.count,
        condition.threshold,
    )
