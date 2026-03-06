import { useState } from 'react'
import { Search, RefreshCw } from 'lucide-react'
import { ServerSelector } from './ServerSelector'
import { TopicTreeBrowser } from './TopicTreeBrowser'
import { NodeTreeBrowser } from './NodeTreeBrowser'
import { DataPointPreview } from './DataPointPreview'
import { QuickMapForm } from './QuickMapForm'
import type { SelectedServer } from './ServerSelector'
import type { OPCUABrowsedNode, SparkplugMetricInfo } from '@/types'

/**
 * Browse tab — split-panel layout for discovering and exploring data points.
 * Left panel: protocol-specific browser (MQTT topic tree or OPC-UA node tree).
 * Right panel: DataPointPreview + QuickMapForm.
 * Stacks vertically on small screens.
 */
export function BrowseTab() {
  const [selectedServer, setSelectedServer] = useState<SelectedServer | null>(null)
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<OPCUABrowsedNode | null>(null)
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null)

  const handleServerChange = (server: SelectedServer | null) => {
    setSelectedServer(server)
    // Reset selections when server changes
    setSelectedTopic(null)
    setSelectedNode(null)
    setSelectedMetric(null)
  }

  const handleTopicSelect = (topic: string | null, metrics?: SparkplugMetricInfo[]) => {
    setSelectedTopic(topic)
    setSelectedNode(null)
    setSelectedMetric(null)
  }

  const handleNodeSelect = (node: OPCUABrowsedNode | null) => {
    setSelectedNode(node)
    setSelectedTopic(null)
    setSelectedMetric(null)
  }

  return (
    <div data-ui="browse-tab" className="space-y-5">
      {/* Server selector bar */}
      <div data-ui="browse-toolbar" className="flex items-center gap-3">
        <div className="max-w-md flex-1">
          <ServerSelector value={selectedServer} onChange={handleServerChange} />
        </div>
        {selectedServer && (
          <span
            className={`rounded px-2 py-1 text-xs ${
              selectedServer.isConnected
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            {selectedServer.isConnected ? 'Connected' : 'Disconnected'}
          </span>
        )}
      </div>

      {/* Empty state when no server selected */}
      {!selectedServer && (
        <div className="bg-muted rounded-xl p-12 text-center">
          <Search className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
          <h3 className="text-muted-foreground mb-1 text-sm font-medium">Browse Data Sources</h3>
          <p className="text-muted-foreground mx-auto max-w-sm text-xs">
            Select a connected server above to browse its available data points. For MQTT brokers,
            you can discover topics. For OPC-UA servers, browse the address space.
          </p>
        </div>
      )}

      {/* Disconnected server warning */}
      {selectedServer && !selectedServer.isConnected && (
        <div className="border-warning/20 bg-warning/5 flex items-center gap-2 rounded-lg border px-4 py-3">
          <RefreshCw className="text-warning h-4 w-4 shrink-0" />
          <p className="text-warning text-sm">
            This server is currently disconnected. Connect it from the Servers tab to browse data
            points.
          </p>
        </div>
      )}

      {/* Split-panel layout */}
      {selectedServer && selectedServer.isConnected && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {/* Left panel: Browser (3 cols) */}
          <div data-ui="browse-tree-panel" className="bg-muted overflow-hidden rounded-xl lg:col-span-3">
            <div className="border-border flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-foreground text-sm font-semibold">
                {selectedServer.protocol === 'mqtt' ? 'Topic Browser' : 'Address Space'}
              </h3>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wider uppercase ${
                  selectedServer.protocol === 'mqtt'
                    ? 'bg-teal-500/15 text-teal-400'
                    : 'bg-purple-500/15 text-purple-400'
                }`}
              >
                {selectedServer.protocol === 'mqtt' ? 'MQTT' : 'OPC-UA'}
              </span>
            </div>

            <div className="max-h-[560px] overflow-y-auto">
              {selectedServer.protocol === 'mqtt' ? (
                <TopicTreeBrowser brokerId={selectedServer.id} onSelectTopic={handleTopicSelect} />
              ) : (
                <NodeTreeBrowser serverId={selectedServer.id} onNodeSelect={handleNodeSelect} />
              )}
            </div>
          </div>

          {/* Right panel: Preview + Quick Map (2 cols) */}
          <div data-ui="browse-preview-panel" className="bg-muted overflow-hidden rounded-xl lg:col-span-2">
            <div className="border-border border-b px-4 py-3">
              <h3 className="text-foreground text-sm font-semibold">Preview & Map</h3>
            </div>

            <div className="space-y-4 p-4">
              {/* Data point preview */}
              <DataPointPreview
                server={selectedServer}
                selectedTopic={selectedTopic}
                selectedNode={selectedNode}
                onSelectMetric={setSelectedMetric}
                selectedMetric={selectedMetric}
              />

              {/* Quick map form */}
              <QuickMapForm
                server={selectedServer}
                selectedTopic={selectedTopic}
                selectedNode={selectedNode}
                selectedMetric={selectedMetric}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
