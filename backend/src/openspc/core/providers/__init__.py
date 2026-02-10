"""Data providers - Tag and Manual data sources."""

from openspc.core.providers.manager import TagProviderManager, TagProviderState, tag_provider_manager
from openspc.core.providers.manual import ManualProvider
from openspc.core.providers.protocol import (
    DataProvider,
    SampleCallback,
    SampleContext,
    SampleEvent,
)
from openspc.core.providers.tag import TagProvider
from openspc.db.models.data_source import TriggerStrategy

__all__ = [
    "DataProvider",
    "SampleCallback",
    "SampleContext",
    "SampleEvent",
    "ManualProvider",
    "TagProvider",
    "TagProviderManager",
    "TagProviderState",
    "tag_provider_manager",
    "TriggerStrategy",
]
