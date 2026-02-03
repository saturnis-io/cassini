import {
  ListTodo,
  CheckCircle2,
  Circle,
  Loader2,
  ArrowRight,
  User,
} from 'lucide-react';
import { useDashboardStore, Task } from '../store/dashboardStore';

function TaskCard({ task }: { task: Task }) {
  const statusConfig = {
    pending: {
      icon: <Circle className="w-4 h-4" />,
      color: 'text-gray-500',
      badge: 'badge-neutral',
    },
    in_progress: {
      icon: <Loader2 className="w-4 h-4 animate-spin" />,
      color: 'text-blue-400',
      badge: 'badge-info',
    },
    completed: {
      icon: <CheckCircle2 className="w-4 h-4" />,
      color: 'text-green-400',
      badge: 'badge-success',
    },
  };

  const config = statusConfig[task.status];

  return (
    <div className="p-3 bg-gray-700/50 rounded-lg">
      <div className="flex items-start gap-3">
        <div className={config.color}>{config.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`font-medium truncate ${
                task.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-100'
              }`}
            >
              {task.subject}
            </span>
            <span className={`badge ${config.badge} shrink-0`}>
              {task.status.replace('_', ' ')}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-2 text-sm">
            {task.owner && (
              <div className="flex items-center gap-1 text-gray-400">
                <User className="w-3 h-3" />
                {task.owner}
              </div>
            )}

            {task.blockedBy && task.blockedBy.length > 0 && (
              <div className="flex items-center gap-1 text-yellow-400">
                <ArrowRight className="w-3 h-3" />
                Blocked by: {task.blockedBy.join(', ')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TasksPanel() {
  const { tasks } = useDashboardStore();

  const inProgress = tasks.filter((t) => t.status === 'in_progress');
  const pending = tasks.filter((t) => t.status === 'pending');
  const completed = tasks.filter((t) => t.status === 'completed');

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-semibold text-gray-100 flex items-center gap-2">
          <ListTodo className="w-5 h-5" />
          Tasks
        </h2>
        <div className="flex gap-2">
          {inProgress.length > 0 && (
            <span className="badge badge-info">{inProgress.length} active</span>
          )}
          {pending.length > 0 && (
            <span className="badge badge-neutral">{pending.length} pending</span>
          )}
        </div>
      </div>
      <div className="card-body space-y-4 max-h-[500px] overflow-y-auto scrollbar-thin">
        {tasks.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No tasks in queue
          </div>
        ) : (
          <>
            {/* In Progress */}
            {inProgress.length > 0 && (
              <div>
                <div className="text-xs font-medium text-blue-400 uppercase mb-2">
                  In Progress
                </div>
                <div className="space-y-2">
                  {inProgress.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </div>
            )}

            {/* Pending */}
            {pending.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase mb-2">
                  Pending
                </div>
                <div className="space-y-2">
                  {pending.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </div>
            )}

            {/* Recently Completed */}
            {completed.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase mb-2">
                  Recently Completed
                </div>
                <div className="space-y-2">
                  {completed.slice(0, 5).map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
