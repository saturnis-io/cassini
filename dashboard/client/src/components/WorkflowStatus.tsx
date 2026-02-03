import React from 'react';
import {
  Brain,
  FileText,
  Hammer,
  CheckCircle,
  GitMerge,
  Circle,
  AlertTriangle,
} from 'lucide-react';
import { useDashboardStore, WorkflowPhase } from '../store/dashboardStore';

const phaseConfig: Record<
  WorkflowPhase,
  { label: string; icon: React.ReactNode; color: string }
> = {
  idle: {
    label: 'Idle',
    icon: <Circle className="w-5 h-5" />,
    color: 'gray',
  },
  expertise: {
    label: 'Expertise',
    icon: <Brain className="w-5 h-5" />,
    color: 'purple',
  },
  planning: {
    label: 'Planning',
    icon: <FileText className="w-5 h-5" />,
    color: 'blue',
  },
  execution: {
    label: 'Execution',
    icon: <Hammer className="w-5 h-5" />,
    color: 'yellow',
  },
  review: {
    label: 'Review',
    icon: <CheckCircle className="w-5 h-5" />,
    color: 'green',
  },
  merge: {
    label: 'Merge',
    icon: <GitMerge className="w-5 h-5" />,
    color: 'cyan',
  },
};

const phaseOrder: WorkflowPhase[] = [
  'expertise',
  'planning',
  'execution',
  'review',
  'merge',
];

export function WorkflowStatus() {
  const { workflow } = useDashboardStore();
  const currentPhase = workflow.phase;
  const config = phaseConfig[currentPhase];

  const currentIndex = phaseOrder.indexOf(currentPhase);
  const progress =
    currentPhase === 'idle'
      ? 0
      : Math.round(((currentIndex + 1) / phaseOrder.length) * 100);

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-semibold text-gray-100">Workflow Status</h2>
        {workflow.currentProject && (
          <span className="badge badge-info">{workflow.currentProject}</span>
        )}
      </div>
      <div className="card-body">
        {/* Current Phase Display */}
        <div className="flex items-center gap-4 mb-6">
          <div
            className={`w-16 h-16 rounded-xl flex items-center justify-center bg-${config.color}-500/20`}
          >
            <div className={`text-${config.color}-400`}>{config.icon}</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-100">
              {config.label}
            </div>
            <div className="text-sm text-gray-400">
              {currentPhase === 'idle'
                ? 'Waiting for project'
                : `Phase ${currentIndex + 1} of ${phaseOrder.length}`}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Phase Steps */}
        <div className="flex justify-between relative">
          {/* Connection Line */}
          <div className="absolute top-4 left-6 right-6 h-0.5 bg-gray-700" />

          {phaseOrder.map((phase, index) => {
            const isComplete = currentIndex > index;
            const isCurrent = phase === currentPhase;
            const phaseInfo = phaseConfig[phase];

            return (
              <div
                key={phase}
                className="flex flex-col items-center z-10 relative"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    isComplete
                      ? 'bg-green-500 text-white'
                      : isCurrent
                      ? `bg-${phaseInfo.color}-500 text-white animate-pulse`
                      : 'bg-gray-700 text-gray-500'
                  }`}
                >
                  {isComplete ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <span className="text-xs font-bold">{index + 1}</span>
                  )}
                </div>
                <span
                  className={`text-xs mt-2 ${
                    isCurrent ? 'text-gray-100 font-medium' : 'text-gray-500'
                  }`}
                >
                  {phaseInfo.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Blockers */}
        {workflow.blockers && workflow.blockers.length > 0 && (
          <div className="mt-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-red-400 mb-2">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium">Blockers</span>
            </div>
            <ul className="text-sm text-gray-300 space-y-1">
              {workflow.blockers.map((blocker, i) => (
                <li key={i}>• {blocker}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
