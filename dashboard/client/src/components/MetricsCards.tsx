import React from 'react';
import {
  TrendingUp,
  CheckSquare,
  Users,
  Clock,
  FileText,
  Zap,
} from 'lucide-react';
import { useDashboardStore } from '../store/dashboardStore';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  color?: string;
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  color = 'primary',
}: MetricCardProps) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-gray-400 mb-1">{title}</div>
          <div className="text-2xl font-bold text-gray-100">{value}</div>
          {subtitle && (
            <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
          )}
        </div>
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${color}-500/20 text-${color}-400`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export function MetricsCards() {
  const { workflow, roster, proposals, artifacts, tasks, phases } =
    useDashboardStore();

  // Calculate metrics
  const activeRoles =
    roster
      ? Object.values({ ...roster.roles, ...roster.specialists }).filter(
          (r) => r.status === 'active'
        ).length + (roster.ceo?.status === 'active' ? 1 : 0)
      : 0;

  const totalRoles = roster
    ? Object.keys(roster.roles || {}).length +
      Object.keys(roster.specialists || {}).length +
      1
    : 0;

  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const totalTasks = tasks.length;

  const completedPhases = phases.filter((p) => p.status === 'complete').length;
  const totalPhases = phases.length;

  const pendingProposals = proposals.filter(
    (p) => p.status === 'pending'
  ).length;

  // Calculate session duration
  let sessionDuration = 'N/A';
  if (workflow.startedAt) {
    const startTime = new Date(workflow.startedAt).getTime();
    const now = Date.now();
    const diffMs = now - startTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;

    if (diffHours > 0) {
      sessionDuration = `${diffHours}h ${mins}m`;
    } else {
      sessionDuration = `${mins}m`;
    }
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <MetricCard
        title="Workflow Phase"
        value={workflow.phase.charAt(0).toUpperCase() + workflow.phase.slice(1)}
        subtitle={workflow.currentProject || 'No active project'}
        icon={<Zap className="w-5 h-5" />}
        color="primary"
      />

      <MetricCard
        title="Active Agents"
        value={`${activeRoles}/${totalRoles}`}
        subtitle="Team members online"
        icon={<Users className="w-5 h-5" />}
        color="green"
      />

      <MetricCard
        title="Tasks"
        value={`${completedTasks}/${totalTasks}`}
        subtitle={
          totalTasks > 0
            ? `${Math.round((completedTasks / totalTasks) * 100)}% complete`
            : 'No tasks'
        }
        icon={<CheckSquare className="w-5 h-5" />}
        color="blue"
      />

      <MetricCard
        title="Phases"
        value={`${completedPhases}/${totalPhases}`}
        subtitle={
          totalPhases > 0
            ? `${Math.round((completedPhases / totalPhases) * 100)}% complete`
            : 'No phases'
        }
        icon={<TrendingUp className="w-5 h-5" />}
        color="purple"
      />

      <MetricCard
        title="Artifacts"
        value={artifacts.length}
        subtitle="Files generated"
        icon={<FileText className="w-5 h-5" />}
        color="yellow"
      />

      <MetricCard
        title="Session Time"
        value={sessionDuration}
        subtitle={pendingProposals > 0 ? `${pendingProposals} pending` : 'All clear'}
        icon={<Clock className="w-5 h-5" />}
        color="cyan"
      />
    </div>
  );
}
