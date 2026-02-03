import { User, Users, Crown, Sparkles } from 'lucide-react';
import { useDashboardStore, RoleDef } from '../store/dashboardStore';

function RoleCard({ role, type }: { role: RoleDef; type: 'ceo' | 'specialist' | 'role' }) {
  const statusColors = {
    active: 'bg-green-500',
    idle: 'bg-gray-500',
    blocked: 'bg-red-500',
  };

  const typeIcons = {
    ceo: <Crown className="w-4 h-4 text-yellow-400" />,
    specialist: <Sparkles className="w-4 h-4 text-purple-400" />,
    role: <User className="w-4 h-4 text-gray-400" />,
  };

  return (
    <div className="p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {typeIcons[type]}
          <span className="font-medium text-gray-100">{role.name}</span>
        </div>
        <div
          className={`status-dot ${statusColors[role.status || 'idle']}`}
          title={role.status || 'idle'}
        />
      </div>
      <div className="text-sm text-gray-400 mb-2">{role.title}</div>
      {role.model && (
        <span className="badge badge-neutral text-xs">{role.model}</span>
      )}
      {role.expertise && role.expertise.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {role.expertise.slice(0, 3).map((exp) => (
            <span key={exp} className="badge badge-info text-xs">
              {exp}
            </span>
          ))}
          {role.expertise.length > 3 && (
            <span className="badge badge-neutral text-xs">
              +{role.expertise.length - 3}
            </span>
          )}
        </div>
      )}
      {role.currentTask && (
        <div className="mt-2 text-xs text-gray-500 truncate">
          Working on: {role.currentTask}
        </div>
      )}
    </div>
  );
}

export function RosterPanel() {
  const { roster } = useDashboardStore();

  if (!roster) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-gray-100 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Team Roster
          </h2>
        </div>
        <div className="card-body">
          <div className="text-center text-gray-500 py-8">
            No roster data available
          </div>
        </div>
      </div>
    );
  }

  const specialists = Object.entries(roster.specialists || {});
  const roles = Object.entries(roster.roles || {});

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-semibold text-gray-100 flex items-center gap-2">
          <Users className="w-5 h-5" />
          Team Roster
        </h2>
        <span className="badge badge-neutral">
          {1 + specialists.length + roles.length} members
        </span>
      </div>
      <div className="card-body space-y-4 max-h-[500px] overflow-y-auto scrollbar-thin">
        {/* CEO */}
        {roster.ceo && (
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase mb-2">
              Leadership
            </div>
            <RoleCard role={roster.ceo} type="ceo" />
          </div>
        )}

        {/* Specialists */}
        {specialists.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase mb-2">
              Specialists
            </div>
            <div className="space-y-2">
              {specialists.map(([key, role]) => (
                <RoleCard key={key} role={role} type="specialist" />
              ))}
            </div>
          </div>
        )}

        {/* Other Roles */}
        {roles.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase mb-2">
              Team Members
            </div>
            <div className="space-y-2">
              {roles.map(([key, role]) => (
                <RoleCard key={key} role={role} type="role" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
