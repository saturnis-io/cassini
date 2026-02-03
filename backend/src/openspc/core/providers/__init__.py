"""Data providers - Tag and Manual data sources."""

from openspc.core.providers.manual import ManualProvider
from openspc.core.providers.protocol import (
    DataProvider,
    SampleCallback,
    SampleContext,
    SampleEvent,
)
from openspc.core.providers.tag import TagProvider, TriggerStrategy

__all__ = [
    "DataProvider",
    "SampleCallback",
    "SampleContext",
    "SampleEvent",
    "ManualProvider",
    "TagProvider",
    "TriggerStrategy",
]
