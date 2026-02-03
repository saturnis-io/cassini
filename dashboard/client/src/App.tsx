import { useEffect } from 'react';
import { Layout } from './components/Layout';
import { WorkflowStatus } from './components/WorkflowStatus';
import { RosterPanel } from './components/RosterPanel';
import { ProposalsQueue } from './components/ProposalsQueue';
import { PhaseTimeline } from './components/PhaseTimeline';
import { TasksPanel } from './components/TasksPanel';
import { ArtifactsViewer } from './components/ArtifactsViewer';
import { ActivityFeed } from './components/ActivityFeed';
import { MetricsCards } from './components/MetricsCards';
import { useWebSocket } from './hooks/useWebSocket';
import { useDashboardStore } from './store/dashboardStore';

function App() {
  const { reconnect } = useWebSocket();
  const { connected, setProjectPath } = useDashboardStore();

  // Fetch initial config
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.projectPath) {
          setProjectPath(data.projectPath);
        }
      })
      .catch((err) => console.error('Failed to fetch config:', err));
  }, [setProjectPath]);

  return (
    <Layout onReconnect={reconnect}>
      <div className="space-y-6">
        {/* Metrics Row */}
        <MetricsCards />

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            <WorkflowStatus />
            <RosterPanel />
          </div>

          {/* Middle Column */}
          <div className="space-y-6">
            <PhaseTimeline />
            <TasksPanel />
          </div>

          {/* Right Column */}
          <div className="space-y-6 xl:col-span-1 lg:col-span-2 xl:col-span-1">
            <ProposalsQueue />
            <ArtifactsViewer />
          </div>
        </div>

        {/* Activity Feed - Full Width */}
        <ActivityFeed />
      </div>

      {/* Connection lost overlay */}
      {!connected && (
        <div className="fixed bottom-4 right-4 bg-red-500/90 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          Connection lost. Reconnecting...
        </div>
      )}
    </Layout>
  );
}

export default App;
