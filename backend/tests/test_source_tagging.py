"""Tests for sample source tagging."""
from cassini.core.providers.protocol import SampleContext


def test_sample_context_defaults_to_manual():
    ctx = SampleContext()
    assert ctx.source == "MANUAL"


def test_sample_context_tag_source():
    ctx = SampleContext(source="TAG")
    assert ctx.source == "TAG"


def test_sample_context_opcua_source():
    ctx = SampleContext(source="OPCUA")
    assert ctx.source == "OPCUA"


def test_sample_context_api_source():
    ctx = SampleContext(source="API")
    assert ctx.source == "API"
