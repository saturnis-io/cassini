import { useState } from 'react';
import {
  Activity,
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { useDashboardStore, ActivityEvent } from '../store/dashboardStore';

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function ActivityItem({ event }: { event: ActivityEvent }) {
  const typeConfig = {
    info: {
      icon: <Info className="w-3 h-3" />,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/20',
    },
    success: {
      icon: <CheckCircle className="w-3 h-3" />,
      color: 'text-green-400',
      bgColor: 'bg-green-500/20',
    },
    warning: {
      icon: <AlertTriangle className="w-3 h-3" />,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/20',
    },
    error: {
      icon: <XCircle className="w-3 h-3" />,
      color: 'text-red-400',
      bgColor: 'bg-red-500/20',
    },
  };

  const config = typeConfig[event.type];

  return (
    <div className="flex items-start gap-2 py-2 border-b border-gray-700/50 last:border-0">
      <div
        className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${config.bgColor} ${config.color}`}
      >
        {config.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-200">{event.action}</span>
          {event.role && (
            <span className="badge badge-neutral text-xs">{event.role}</span>
          )}
        </div>
        {event.details && (
          <div className="text-xs text-gray-500 mt-0.5 truncate">
            {event.details}
          </div>
        )}
      </div>
      <span className="text-xs text-gray-500 shrink-0">
        {formatTime(event.timestamp)}
      </span>
    </div>
  );
}

export function ActivityFeed() {
  const { activities } = useDashboardStore();
  const [filter, setFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ActivityEvent['type'] | null>(null);

  // Get unique roles
  const roles = [...new Set(activities.map((a) => a.role).filter(Boolean))];

  // Apply filters
  let filteredActivities = activities;
  if (filter) {
    filteredActivities = filteredActivities.filter((a) => a.role === filter);
  }
  if (typeFilter) {
    filteredActivities = filteredActivities.filter((a) => a.type === typeFilter);
  }

  return (
    <div className="card">
      <div className="card-header flex-wrap gap-2">
        <h2 className="font-semibold text-gray-100 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Activity Feed
        </h2>
        <div className="flex items-center gap-2">
          {/* Type Filter */}
          <select
            value={typeFilter || ''}
            onChange={(e) =>
              setTypeFilter(
                e.target.value ? (e.target.value as ActivityEvent['type']) : null
              )
            }
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300"
          >
            <option value="">All types</option>
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>

          {/* Role Filter */}
          {roles.length > 0 && (
            <select
              value={filter || ''}
              onChange={(e) => setFilter(e.target.value || null)}
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300"
            >
              <option value="">All roles</option>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="card-body p-2 max-h-[400px] overflow-y-auto scrollbar-thin">
        {filteredActivities.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            {activities.length === 0
              ? 'No activity yet'
              : 'No matching activities'}
          </div>
        ) : (
          <div className="space-y-0">
            {filteredActivities.map((event) => (
              <ActivityItem key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
