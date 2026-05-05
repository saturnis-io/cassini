"""Streaming Complex Event Processing (CEP) for Cassini.

This subpackage adds a YAML-defined pattern language that combines per-
characteristic Nelson rules across sliding time windows. The engine
subscribes to the existing ``SampleProcessedEvent`` bus, evaluates each
rule's conditions on every sample, and fires a ``CepMatchEvent`` when all
conditions are satisfied within the window.

Public surface:

* :func:`load_rule_from_yaml` — strict YAML -> ``CepRuleSpec`` parser.
* :class:`CepConditionState` — per-characteristic sliding state.
* :class:`CepRuleRuntime` — rule + per-condition state container.
* :class:`CepEngine` — orchestrates subscriptions, evaluates rules, fires events.
"""
from cassini.core.cep.conditions import (
    CepConditionState,
    evaluate_condition_against_sample,
)
from cassini.core.cep.engine import (
    CepEngine,
    CepMatchEvent,
    CepRuleRuntime,
)
from cassini.core.cep.yaml_loader import (
    CepYamlError,
    load_rule_from_yaml,
)

__all__ = [
    "CepConditionState",
    "CepEngine",
    "CepMatchEvent",
    "CepRuleRuntime",
    "CepYamlError",
    "evaluate_condition_against_sample",
    "load_rule_from_yaml",
]
