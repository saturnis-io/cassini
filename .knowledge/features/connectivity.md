# Connectivity

## Data Flow
```
ConnectivityPage.tsx (tabs: Servers, Mappings, Browse, Monitor, Gages)
  → ServersTab → MQTTServerForm / OPCUAServerForm
    → POST /api/v1/brokers/ or POST /api/v1/opcua-servers/
  → MappingTab → MappingTable → MappingRow / MappingDialog / QuickMapForm
    → POST /api/v1/tags/map (creates DataSource linking char↔server)
  → BrowseTab → NodeTreeBrowser / TopicTreeBrowser
    → GET /api/v1/opcua-servers/{id}/browse?node_id=...
  → GagesTab → GageBridgeList → GageBridgeRegisterDialog / GagePortConfig
    → POST /api/v1/gage-bridges (register bridge + API key)

Data Ingestion:
  MQTTProvider subscribes to broker topics → on_message → SPCEngine.process_sample()
  OPCUAProvider subscribes to server nodes → on_data_change → SPCEngine.process_sample()
  GageBridge (external Python agent) → serial read → MQTT publish → MQTTProvider
```

## Backend

### Models
| Model | File | Key Columns/Relations | Migration |
|-------|------|-----------------------|-----------|
| DataSource (base) | db/models/data_source.py | id, type(poly discriminator), characteristic_id(FK unique), is_active, trigger_strategy, buffer_size | 017 JTI |
| MQTTDataSource | db/models/data_source.py | inherits DataSource; broker_id(FK), topic, payload_path, qos | 017 |
| OPCUADataSource | db/models/data_source.py | inherits DataSource; server_id(FK), node_id, namespace_index | 017, 018 |
| MQTTBroker | db/models/broker.py | id, name, host, port, plant_id(FK), username, password(encrypted), use_tls, payload_format, is_active, outbound_topic, outbound_enabled | 004, 009, 019 |
| OPCUAServer | db/models/opcua_server.py | id, name, endpoint_url, plant_id(FK), security_mode, security_policy, username, password, certificate_path, is_active | 018 |
| GageBridge | db/models/gage.py | id, name, plant_id(FK), api_key_hash, hostname, last_heartbeat, is_active | 034 |
| GagePort | db/models/gage.py | id, bridge_id(FK), port_name, profile, baud_rate, data_bits, parity, stop_bits, characteristic_id(FK nullable), label | 034, 035 |

### Endpoints
| Method | Path | Params | Response Shape | Auth |
|--------|------|--------|----------------|------|
| GET | /api/v1/brokers/ | plant_id, offset, limit | PaginatedResponse[BrokerResponse] | get_current_user |
| POST | /api/v1/brokers/ | body: BrokerCreate | BrokerResponse (201) | get_current_engineer |
| GET | /api/v1/brokers/all/status | plant_id | BrokerAllStatesResponse | get_current_user |
| GET | /api/v1/brokers/current/status | - | BrokerConnectionStatus | get_current_user |
| POST | /api/v1/brokers/disconnect | - | dict | get_current_engineer |
| POST | /api/v1/brokers/test | body: BrokerCreate | BrokerTestResponse | get_current_engineer |
| GET | /api/v1/brokers/{broker_id} | - | BrokerResponse | get_current_user |
| PATCH | /api/v1/brokers/{broker_id} | body: BrokerUpdate | BrokerResponse | get_current_engineer |
| DELETE | /api/v1/brokers/{broker_id} | - | 204 | get_current_engineer |
| POST | /api/v1/brokers/{broker_id}/activate | - | BrokerResponse | get_current_engineer |
| GET | /api/v1/brokers/{broker_id}/status | - | BrokerConnectionStatus | get_current_user |
| POST | /api/v1/brokers/{broker_id}/connect | - | BrokerConnectionStatus | get_current_engineer |
| POST | /api/v1/brokers/{broker_id}/discover | - | 202 | get_current_engineer |
| DELETE | /api/v1/brokers/{broker_id}/discover | - | dict | get_current_engineer |
| GET | /api/v1/brokers/{broker_id}/topics | - | list | get_current_user |
| GET | /api/v1/opcua-servers/ | plant_id, offset, limit | PaginatedResponse[OPCUAServerResponse] | get_current_user |
| POST | /api/v1/opcua-servers/ | body: OPCUAServerCreate | OPCUAServerResponse (201) | get_current_engineer |
| POST | /api/v1/opcua-servers/test | body: OPCUAServerCreate | OPCUAServerTestResponse | get_current_engineer |
| GET | /api/v1/opcua-servers/all/status | plant_id | OPCUAAllStatesResponse | get_current_user |
| GET | /api/v1/opcua-servers/{server_id} | - | OPCUAServerResponse | get_current_user |
| PATCH | /api/v1/opcua-servers/{server_id} | body: OPCUAServerUpdate | OPCUAServerResponse | get_current_engineer |
| DELETE | /api/v1/opcua-servers/{server_id} | - | 204 | get_current_engineer |
| POST | /api/v1/opcua-servers/{server_id}/connect | - | OPCUAServerConnectionStatus | get_current_engineer |
| POST | /api/v1/opcua-servers/{server_id}/disconnect | - | OPCUAServerConnectionStatus | get_current_engineer |
| GET | /api/v1/opcua-servers/{server_id}/status | - | OPCUAServerConnectionStatus | get_current_user |
| GET | /api/v1/opcua-servers/{server_id}/browse | node_id | list[BrowsedNodeResponse] | get_current_user |
| GET | /api/v1/opcua-servers/{server_id}/browse/value | node_id | NodeValueResponse | get_current_user |
| GET | /api/v1/tags/mappings | plant_id | list[TagMappingResponse] | get_current_user |
| POST | /api/v1/tags/map | body: TagMapRequest | TagMappingResponse | get_current_engineer |
| DELETE | /api/v1/tags/map/{characteristic_id} | - | 204 | get_current_engineer |
| POST | /api/v1/tags/preview | body: TagPreviewRequest | TagPreviewResponse | get_current_user |
| GET | /api/v1/providers/status | - | ProviderStatusResponse | get_current_user |
| POST | /api/v1/providers/tag/restart | - | TagProviderStatusResponse | get_current_engineer |
| POST | /api/v1/providers/tag/refresh | - | dict | get_current_engineer |
| GET | /api/v1/gage-bridges/profiles | - | list[GageProfileResponse] | get_current_user |
| POST | /api/v1/gage-bridges | body: GageBridgeCreate | GageBridgeRegistered (201, includes api_key shown once) | get_current_engineer |
| GET | /api/v1/gage-bridges | plant_id | list[GageBridgeResponse] | get_current_user |
| GET | /api/v1/gage-bridges/{bridge_id} | - | GageBridgeDetailResponse | get_current_user |
| PUT | /api/v1/gage-bridges/{bridge_id} | body: GageBridgeUpdate | GageBridgeResponse | get_current_engineer |
| DELETE | /api/v1/gage-bridges/{bridge_id} | - | 204 | get_current_engineer |
| GET | /api/v1/gage-bridges/my-config | X-API-Key header | bridge config JSON | API key auth |
| POST | /api/v1/gage-bridges/{bridge_id}/heartbeat | - | 204 | API key auth |
| GET | /api/v1/gage-bridges/{bridge_id}/config | - | bridge config JSON | get_current_user |
| POST | /api/v1/gage-bridges/{bridge_id}/ports | body: GagePortCreate | GagePortResponse (201) | get_current_engineer |
| PUT | /api/v1/gage-bridges/{bridge_id}/ports/{port_id} | body: GagePortUpdate | GagePortResponse | get_current_engineer |
| DELETE | /api/v1/gage-bridges/{bridge_id}/ports/{port_id} | - | 204 | get_current_engineer |

### Services
| Module | File | Key Functions |
|--------|------|---------------|
| MQTTProvider | core/providers/mqtt_provider.py | start(), stop(), on_message(), subscribe_characteristic() |
| OPCUAProvider | core/providers/opcua_provider.py | start(), stop(), subscribe_characteristic(), on_data_change() |
| OPCUAClient | opcua/client.py | connect(), browse(), read_value(), subscribe() |
| OPCUAServer (model mgr) | opcua/manager.py | connect_server(), disconnect_server(), get_status() |

### Repositories
| Class | File | Key Methods |
|-------|------|-------------|
| DataSourceRepository | db/repositories/data_source.py | get_by_characteristic, create_mqtt, create_opcua, delete_by_characteristic |
| BrokerRepository | db/repositories/broker.py | get_by_id, get_active, list_by_plant |
| OPCUAServerRepository | db/repositories/opcua_server.py | get_by_id, list_by_plant, get_active |

## Frontend

### Components
| Component | File | Key Props | Hooks Used |
|-----------|------|-----------|------------|
| ServersTab | components/connectivity/ServersTab.tsx | - | useOPCUAServers, broker hooks |
| MQTTServerForm | components/connectivity/MQTTServerForm.tsx | broker, onSave | broker mutations |
| OPCUAServerForm | components/connectivity/OPCUAServerForm.tsx | server, onSave | useCreateOPCUAServer, useUpdateOPCUAServer |
| MappingTab | components/connectivity/MappingTab.tsx | - | tag mapping hooks |
| MappingTable | components/connectivity/MappingTable.tsx | mappings | - |
| MappingRow | components/connectivity/MappingRow.tsx | mapping | - |
| MappingDialog | components/connectivity/MappingDialog.tsx | open, onClose | tag mapping hooks |
| QuickMapForm | components/connectivity/QuickMapForm.tsx | serverId | tag mapping hooks |
| NodeTreeBrowser | components/connectivity/NodeTreeBrowser.tsx | serverId | useBrowseOPCUANodes |
| TopicTreeBrowser | components/connectivity/TopicTreeBrowser.tsx | brokerId | broker topic hooks |
| ServerSelector | components/connectivity/ServerSelector.tsx | value, onChange | useOPCUAServers |
| CharacteristicPicker | components/connectivity/CharacteristicPicker.tsx | value, onChange | useCharacteristics |
| GagesTab | components/connectivity/GagesTab.tsx | - | useGageBridges |
| GageBridgeList | components/connectivity/GageBridgeList.tsx | bridges | - |
| GageBridgeRegisterDialog | components/connectivity/GageBridgeRegisterDialog.tsx | open, onClose | useRegisterGageBridge |
| GagePortConfig | components/connectivity/GagePortConfig.tsx | port, bridgeId | useUpdateGagePort, useDeleteGagePort |
| GageProfileSelector | components/connectivity/GageProfileSelector.tsx | value, onChange | useGageProfiles |
| ServerStatusGrid | components/connectivity/ServerStatusGrid.tsx | - | useOPCUAAllStatus |
| BrokerStatusCards | components/connectivity/BrokerStatusCards.tsx | - | broker status hooks |
| LiveValuePreview | components/connectivity/LiveValuePreview.tsx | serverId, nodeId | useReadOPCUAValue |
| ConnectionTestButton | components/connectivity/ConnectionTestButton.tsx | onTest | useTestOPCUAConnection |
| ProtocolSelector | components/connectivity/ProtocolSelector.tsx | value, onChange | - |
| ProtocolBadge | components/connectivity/ProtocolBadge.tsx | protocol | - |

### Hooks / API
| Hook/Method | Namespace | Endpoint | Cache Key |
|-------------|-----------|----------|-----------|
| useOPCUAServers | opcuaApi.list | GET /opcua-servers/ | ['opcua-servers', 'list', {plantId}] |
| useOPCUAServer | opcuaApi.get | GET /opcua-servers/{id} | ['opcua-servers', 'detail', id] |
| useOPCUAAllStatus | opcuaApi.getAllStatus | GET /opcua-servers/all/status | ['opcua-servers', 'status', {plantId}] (5s poll) |
| useCreateOPCUAServer | opcuaApi.create | POST /opcua-servers/ | invalidates all |
| useUpdateOPCUAServer | opcuaApi.update | PATCH /opcua-servers/{id} | invalidates all |
| useDeleteOPCUAServer | opcuaApi.delete | DELETE /opcua-servers/{id} | invalidates all |
| useConnectOPCUAServer | opcuaApi.connect | POST /opcua-servers/{id}/connect | invalidates status |
| useDisconnectOPCUAServer | opcuaApi.disconnect | POST /opcua-servers/{id}/disconnect | invalidates status |
| useTestOPCUAConnection | opcuaApi.test | POST /opcua-servers/test | - |
| useBrowseOPCUANodes | opcuaApi.browse | GET /opcua-servers/{id}/browse | ['opcua-servers', 'browse', id, nodeId] |
| useReadOPCUAValue | opcuaApi.readValue | GET /opcua-servers/{id}/browse/value | ['opcua-read', serverId, nodeId] (2s poll) |
| useGageBridges | gageBridgeApi.list | GET /gage-bridges | ['gageBridges', 'list', plantId] |
| useGageBridge | gageBridgeApi.get | GET /gage-bridges/{id} | ['gageBridges', 'detail', id] |
| useGageProfiles | gageBridgeApi.profiles | GET /gage-bridges/profiles | ['gageBridges', 'profiles'] |
| useRegisterGageBridge | gageBridgeApi.register | POST /gage-bridges | invalidates all |
| useDeleteGageBridge | gageBridgeApi.delete | DELETE /gage-bridges/{id} | invalidates all |
| useAddGagePort | gageBridgeApi.addPort | POST /gage-bridges/{id}/ports | invalidates all |
| useUpdateGagePort | gageBridgeApi.updatePort | PUT /gage-bridges/{id}/ports/{portId} | invalidates all |
| useDeleteGagePort | gageBridgeApi.deletePort | DELETE /gage-bridges/{id}/ports/{portId} | invalidates all |

### Pages / Routes
| Route | Page | Key Components |
|-------|------|----------------|
| /connectivity | ConnectivityPage.tsx | ServersTab, MappingTab, BrowseTab, MonitorTab, GagesTab |

## Migrations
- 004 (add_mqtt_broker): mqtt_broker table
- 009 (broker_payload_format): payload_format on broker
- 017 (jti_data_sources): data_source, mqtt_data_source, opcua_data_source tables (JTI)
- 018 (add_opcua_server): opcua_server table
- 019 (broker_outbound): outbound_topic, outbound_enabled on broker
- 034 (sprint7_gage_bridge): gage_bridge, gage_port tables
- 035 (sprint7_gage_constraints): unique constraints on gage_port

## Known Issues / Gotchas
- No provider_type column on characteristic (removed in migration 017). Check char.data_source is None for manual
- JTI query pattern: NEVER explicitly .join(DataSource) when querying subclasses -- auto-join causes "ambiguous column name" on SQLite
- Gage bridge API key is shown once on registration, then only hash is stored
- Dual-mapping bug: simultaneous char+port update on gage port was fixed (Sprint 7 skeptic)
- Broker credential fallback: plain text passwords still accepted for backward compat
- lib/protocols.ts: protocol registry maps protocol names to icons/labels/form components
