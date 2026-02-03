import { useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  Loader2,
  FileText,
} from 'lucide-react';
import { useDashboardStore, Phase } from '../store/dashboardStore';

function PhaseCard({ phase, isExpanded, onToggle }: {
  phase: Phase;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const statusConfig = {
    pending: {
      icon: <Circle className="w-4 h-4" />,
      color: 'text-gray-500',
      bgColor: 'bg-gray-500/20',
    },
    active: {
      icon: <Loader2 className="w-4 h-4 animate-spin" />,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/20',
    },
    complete: {
      icon: <CheckCircle2 className="w-4 h-4" />,
      color: 'text-green-400',
      bgColor: 'bg-green-500/20',
    },
  };

  const config = statusConfig[phase.status];

  return (
    <div className="relative">
      {/* Timeline connector */}
      <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-gray-700" />

      <div className="relative flex gap-3">
        {/* Status indicator */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${config.bgColor} ${config.color}`}
        >
          {config.icon}
        </div>

        {/* Content */}
        <div className="flex-1 pb-4">
          <button
            onClick={onToggle}
            className="w-full text-left p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`font-medium ${config.color}`}>
                  Phase {phase.number}
                </span>
                <span className="text-gray-300">{phase.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${
                  phase.status === 'complete'
                    ? 'badge-success'
                    : phase.status === 'active'
                    ? 'badge-info'
                    : 'badge-neutral'
                }`}>
                  {phase.status}
                </span>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
              </div>
            </div>
          </button>

          {/* Expanded content */}
          {isExpanded && (
            <div className="mt-2 ml-3 pl-3 border-l border-gray-700 space-y-3">
              {phase.goal && (
                <div>
                  <div className="text-xs text-gray-500 uppercase mb-1">Goal</div>
                  <p className="text-sm text-gray-300">{phase.goal}</p>
                </div>
              )}

              {phase.artifacts && phase.artifacts.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500 uppercase mb-1">Artifacts</div>
                  <div className="space-y-1">
                    {phase.artifacts.map((artifact, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-sm text-gray-400"
                      >
                        <FileText className="w-3 h-3" />
                        {artifact}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {phase.tasks && phase.tasks.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500 uppercase mb-1">Tasks</div>
                  <div className="space-y-1">
                    {phase.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        {task.status === 'completed' ? (
                          <CheckCircle2 className="w-3 h-3 text-green-400" />
                        ) : task.status === 'in_progress' ? (
                          <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                        ) : (
                          <Circle className="w-3 h-3 text-gray-500" />
                        )}
                        <span className={
                          task.status === 'completed' ? 'text-gray-500' : 'text-gray-300'
                        }>
                          {task.subject}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PhaseTimeline() {
  const { phases } = useDashboardStore();
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set());

  const togglePhase = (phaseNum: number) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseNum)) {
        next.delete(phaseNum);
      } else {
        next.add(phaseNum);
      }
      return next;
    });
  };

  const completedCount = phases.filter((p) => p.status === 'complete').length;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-semibold text-gray-100 flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Phase Timeline
        </h2>
        {phases.length > 0 && (
          <span className="badge badge-neutral">
            {completedCount}/{phases.length} complete
          </span>
        )}
      </div>
      <div className="card-body max-h-[500px] overflow-y-auto scrollbar-thin">
        {phases.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No phases defined yet
          </div>
        ) : (
          <div className="space-y-1">
            {phases.map((phase) => (
              <PhaseCard
                key={phase.number}
                phase={phase}
                isExpanded={expandedPhases.has(phase.number)}
                onToggle={() => togglePhase(phase.number)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
