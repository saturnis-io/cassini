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
    <div className="space-y-4">
      {/* Server selector bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 max-w-md">
          <ServerSelector
            value={selectedServer}
            onChange={handleServerChange}
          />
        </div>
        {selectedServer && (
          <span className={`text-xs px-2 py-1 rounded ${
            selectedServer.isConnected
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-red-500/10 text-red-400'
          }`}>
            {selectedServer.isConnected ? 'Connected' : 'Disconnected'}
          </span>
        )}
      </div>

      {/* Empty state when no server selected */}
      {!selectedServer && (
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-12 text-center">
          <Search className="h-10 w-10 mx-auto mb-3 text-[#1e293b]" />
          <h3 className="text-sm font-medium text-[#94a3b8] mb-1">Browse Data Sources</h3>
          <p className="text-xs text-[#475569] max-w-sm mx-auto">
            Select a connected server above to browse its available data points.
            For MQTT brokers, you can discover topics. For OPC-UA servers, browse the address space.
          </p>
        </div>
      )}

      {/* Disconnected server warning */}
      {selectedServer && !selectedServer.isConnected && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-3 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">
            This server is currently disconnected. Connect it from the Servers tab to browse data points.
          </p>
        </div>
      )}

      {/* Split-panel layout */}
      {selectedServer && selectedServer.isConnected && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left panel: Browser (3 cols) */}
          <div className="lg:col-span-3 bg-[#111827] border border-[#1e293b] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e293b] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#e2e8f0]">
                {selectedServer.protocol === 'mqtt' ? 'Topic Browser' : 'Address Space'}
              </h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider ${
                selectedServer.protocol === 'mqtt'
                  ? 'bg-teal-500/15 text-teal-400'
                  : 'bg-purple-500/15 text-purple-400'
              }`}>
                {selectedServer.protocol === 'mqtt' ? 'MQTT' : 'OPC-UA'}
              </span>
            </div>

            <div className="max-h-[560px] overflow-y-auto">
              {selectedServer.protocol === 'mqtt' ? (
                <TopicTreeBrowser
                  brokerId={selectedServer.id}
                  onSelectTopic={handleTopicSelect}
                />
              ) : (
                <NodeTreeBrowser
                  serverId={selectedServer.id}
                  onNodeSelect={handleNodeSelect}
                />
              )}
            </div>
          </div>

          {/* Right panel: Preview + Quick Map (2 cols) */}
          <div className="lg:col-span-2 bg-[#111827] border border-[#1e293b] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e293b]">
              <h3 className="text-sm font-semibold text-[#e2e8f0]">Preview & Map</h3>
            </div>

            <div className="p-4 space-y-4">
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
