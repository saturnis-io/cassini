import {
  FileQuestion,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { useDashboardStore, Proposal } from '../store/dashboardStore';

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const statusConfig = {
    pending: {
      icon: <Clock className="w-4 h-4" />,
      badge: 'badge-warning',
      text: 'Pending',
    },
    approved: {
      icon: <CheckCircle className="w-4 h-4" />,
      badge: 'badge-success',
      text: 'Approved',
    },
    rejected: {
      icon: <XCircle className="w-4 h-4" />,
      badge: 'badge-error',
      text: 'Rejected',
    },
  };

  const config = statusConfig[proposal.status];
  const createdDate = new Date(proposal.createdAt);
  const timeAgo = getTimeAgo(createdDate);

  return (
    <div
      className={`p-3 bg-gray-700/50 rounded-lg border-l-2 ${
        proposal.status === 'pending'
          ? proposal.requiresCEO
            ? 'border-l-yellow-500'
            : 'border-l-blue-500'
          : proposal.status === 'approved'
          ? 'border-l-green-500'
          : 'border-l-red-500'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-100">{proposal.title}</span>
            {proposal.requiresCEO && proposal.status === 'pending' && (
              <span title="CEO Decision Required"><AlertCircle className="w-4 h-4 text-yellow-500" /></span>
            )}
          </div>
          <div className="text-sm text-gray-400 mt-1">
            by {proposal.proposedBy}
          </div>
        </div>
        <span className={`badge ${config.badge} flex items-center gap-1`}>
          {config.icon}
          {config.text}
        </span>
      </div>

      {proposal.description && (
        <p className="text-sm text-gray-400 mb-2 line-clamp-2">
          {proposal.description}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{timeAgo}</span>
        {proposal.resolvedAt && (
          <span>Resolved {getTimeAgo(new Date(proposal.resolvedAt))}</span>
        )}
      </div>

      {proposal.resolution && (
        <div className="mt-2 p-2 bg-gray-800/50 rounded text-sm text-gray-400">
          {proposal.resolution}
        </div>
      )}
    </div>
  );
}

function getTimeAgo(date: Date): string {
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

export function ProposalsQueue() {
  const { proposals } = useDashboardStore();

  const pendingProposals = proposals.filter((p) => p.status === 'pending');
  const ceoRequired = pendingProposals.filter((p) => p.requiresCEO);
  const resolvedProposals = proposals.filter((p) => p.status !== 'pending');

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-semibold text-gray-100 flex items-center gap-2">
          <FileQuestion className="w-5 h-5" />
          Proposals
        </h2>
        {pendingProposals.length > 0 && (
          <span className="badge badge-warning">
            {pendingProposals.length} pending
          </span>
        )}
      </div>
      <div className="card-body space-y-4 max-h-[500px] overflow-y-auto scrollbar-thin">
        {proposals.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No proposals yet
          </div>
        ) : (
          <>
            {/* CEO Required Section */}
            {ceoRequired.length > 0 && (
              <div>
                <div className="text-xs font-medium text-yellow-500 uppercase mb-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Requires CEO Decision
                </div>
                <div className="space-y-2">
                  {ceoRequired.map((proposal) => (
                    <ProposalCard key={proposal.id} proposal={proposal} />
                  ))}
                </div>
              </div>
            )}

            {/* Other Pending */}
            {pendingProposals.filter((p) => !p.requiresCEO).length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase mb-2">
                  Pending Review
                </div>
                <div className="space-y-2">
                  {pendingProposals
                    .filter((p) => !p.requiresCEO)
                    .map((proposal) => (
                      <ProposalCard key={proposal.id} proposal={proposal} />
                    ))}
                </div>
              </div>
            )}

            {/* Resolved */}
            {resolvedProposals.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase mb-2">
                  Recently Resolved
                </div>
                <div className="space-y-2">
                  {resolvedProposals.slice(0, 5).map((proposal) => (
                    <ProposalCard key={proposal.id} proposal={proposal} />
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
