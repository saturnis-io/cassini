import { useState } from 'react';
import {
  FolderOpen,
  FileText,
  ChevronDown,
  ChevronRight,
  Layers,
  Clock,
  HardDrive,
} from 'lucide-react';
import { useDashboardStore, Artifact } from '../store/dashboardStore';
import ReactMarkdown from 'react-markdown';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function ArtifactCard({
  artifact,
  isExpanded,
  onToggle,
}: {
  artifact: Artifact;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const tierColors = {
    SUMMARY: 'badge-success',
    DECISIONS: 'badge-warning',
    FULL: 'badge-info',
  };

  return (
    <div className="p-3 bg-gray-700/50 rounded-lg">
      <button
        onClick={onToggle}
        className="w-full text-left flex items-start justify-between"
      >
        <div className="flex items-start gap-2">
          <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <div className="font-medium text-gray-100">{artifact.filename}</div>
            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {getTimeAgo(artifact.createdAt)}
              </span>
              <span className="flex items-center gap-1">
                <HardDrive className="w-3 h-3" />
                {formatBytes(artifact.size)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge ${tierColors[artifact.tier]}`}>
            {artifact.tier}
          </span>
          {artifact.content && (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )
          )}
        </div>
      </button>

      {isExpanded && artifact.content && (
        <div className="mt-3 p-3 bg-gray-800 rounded text-sm overflow-auto max-h-64">
          <div className="prose prose-sm prose-invert max-w-none">
            <ReactMarkdown>{artifact.content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

export function ArtifactsViewer() {
  const { artifacts } = useDashboardStore();
  const [expandedArtifacts, setExpandedArtifacts] = useState<Set<string>>(new Set());
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

  // Group artifacts by role
  const artifactsByRole = artifacts.reduce((acc, artifact) => {
    if (!acc[artifact.role]) {
      acc[artifact.role] = [];
    }
    acc[artifact.role].push(artifact);
    return acc;
  }, {} as Record<string, Artifact[]>);

  const toggleArtifact = (id: string) => {
    setExpandedArtifacts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleRole = (role: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  };

  const roles = Object.keys(artifactsByRole).sort();

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-semibold text-gray-100 flex items-center gap-2">
          <FolderOpen className="w-5 h-5" />
          Artifacts
        </h2>
        <span className="badge badge-neutral">{artifacts.length} files</span>
      </div>
      <div className="card-body max-h-[500px] overflow-y-auto scrollbar-thin">
        {artifacts.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No artifacts yet
          </div>
        ) : (
          <div className="space-y-3">
            {roles.map((role) => (
              <div key={role}>
                <button
                  onClick={() => toggleRole(role)}
                  className="w-full flex items-center justify-between p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary-400" />
                    <span className="font-medium text-gray-200 capitalize">
                      {role}
                    </span>
                    <span className="text-xs text-gray-500">
                      ({artifactsByRole[role].length})
                    </span>
                  </div>
                  {expandedRoles.has(role) ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {expandedRoles.has(role) && (
                  <div className="ml-6 mt-2 space-y-2">
                    {artifactsByRole[role].map((artifact) => (
                      <ArtifactCard
                        key={artifact.id}
                        artifact={artifact}
                        isExpanded={expandedArtifacts.has(artifact.id)}
                        onToggle={() => toggleArtifact(artifact.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
