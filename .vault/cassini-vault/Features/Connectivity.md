---
type: feature
status: active
created: 2026-03-06
updated: 2026-03-06
sprint: "[[Sprints/Sprint 7 - Shop Floor Connectivity]]"
tags:
  - feature
  - active
aliases:
  - MQTT Connectivity
  - OPC-UA Integration
  - Gage Bridge
  - Gage Bridge Integration
---

# Connectivity

Unified industrial connectivity hub supporting three protocols: MQTT/SparkplugB (inbound data from brokers), OPC-UA (server browsing, subscriptions, node mapping), and RS-232/USB gage bridges (serial gage instruments via Python bridge agent). Manages data source mapping from external tags/nodes to SPC characteristics.

## Key Backend Components

- **Models**: `DataSource` (JTI base), `MQTTDataSource`, `OPCUADataSource` in `db/models/data_source.py`; `MQTTBroker` in `db/models/broker.py`; `OPCUAServer` in `db/models/opcua_server.py`; `GageBridge`, `GagePort` in `db/models/gage.py`
- **Providers**: `core/providers/manager.py` (ProviderManager), `opcua_provider.py`, `opcua_manager.py`, `manual.py`, `tag.py`, `buffer.py`
- **OPC-UA Client**: `opcua/client.py`, `opcua/browsing.py`
- **Routers**: `api/v1/opcua_servers.py`, `api/v1/tags.py`, `api/v1/brokers.py`, `api/v1/gage_bridges.py` (~28 endpoints total)
- **Migrations**: 001 (data_source, mqtt), Phase 2 (opcua), 034-035 (gage_bridge, gage_port)

## Key Frontend Components

- `ConnectivityPage.tsx` -- tabbed hub (Servers, Mapping, Monitor, Gages)
- `ServerSelector.tsx`, `NodeTreeBrowser.tsx`, `MappingTable.tsx`, `MappingRow.tsx`
- `GageBridgeList.tsx`, `GageBridgeRegisterDialog.tsx`, `GagePortConfig.tsx`, `GageProfileSelector.tsx`, `GagesTab.tsx`
- `CharacteristicPicker.tsx`, `MonitorTab.tsx`
- Hooks: `useOPCUAServers`, `useBrowseNodes`, `useTagMappings`, `useBrokers`, `useGageBridges`

## Connections

- Feeds data into [[SPC Engine]] via providers (OPCUAProvider -> `process_sample()`)
- Gage bridge uses API key auth from [[Auth]]
- Broker passwords encrypted with Fernet (same key as [[Admin]] DB encryption)
- Bridge package in `bridge/` -- standalone pip-installable `cassini-bridge`
- Design docs: [[Designs/Sprint 7 Gage Bridge]]

## Known Limitations

- Never explicitly `.join(DataSource)` when querying JTI subclasses -- SQLAlchemy auto-joins
- No `provider_type` column -- check `char.data_source is None` for manual
- Gage bridge dual-mapping race condition fixed but requires careful handling on simultaneous char+port updates
