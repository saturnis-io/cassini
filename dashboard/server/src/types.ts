// Workflow state types
export interface WorkflowState {
  phase: WorkflowPhase;
  currentProject?: string;
  startedAt?: string;
  lastActivity?: string;
  blockers?: string[];
}

export type WorkflowPhase =
  | 'idle'
  | 'expertise'
  | 'planning'
  | 'execution'
  | 'review'
  | 'merge';

// Configuration types
export interface CompanyConfig {
  name: string;
  version: string;
  modelAssignments: {
    ceo: string;
    specialists: string;
    default: string;
  };
  autoApprove: boolean;
  verbosity: 'minimal' | 'normal' | 'verbose';
}

// Roster types
export interface Roster {
  ceo: RoleDef;
  specialists: Record<string, RoleDef>;
  roles: Record<string, RoleDef>;
}

export interface RoleDef {
  name: string;
  title: string;
  model?: string;
  expertise?: string[];
  status?: 'active' | 'idle' | 'blocked';
  currentTask?: string;
}

// Proposal types
export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  requiresCEO: boolean;
  createdAt: string;
  resolvedAt?: string;
  resolution?: string;
}

// Artifact types
export interface Artifact {
  id: string;
  role: string;
  filename: string;
  path: string;
  tier: 'SUMMARY' | 'DECISIONS' | 'FULL';
  content?: string;
  createdAt: string;
  size: number;
}

// Activity types
export interface ActivityEvent {
  id: string;
  timestamp: string;
  action: string;
  role?: string;
  details?: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

// Phase/Roadmap types
export interface Phase {
  number: number;
  name: string;
  status: 'pending' | 'active' | 'complete';
  goal?: string;
  artifacts?: string[];
  tasks?: Task[];
}

export interface Task {
  id: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed';
  owner?: string;
  blockedBy?: string[];
}

// WebSocket message types
export type WSEventType =
  | 'state:update'
  | 'config:update'
  | 'roster:update'
  | 'proposal:new'
  | 'proposal:resolved'
  | 'artifact:created'
  | 'activity:log'
  | 'roadmap:update'
  | 'phase:progress'
  | 'initial:state'
  | 'connection:status';

export interface WSMessage<T = unknown> {
  type: WSEventType;
  payload: T;
  timestamp: string;
}

// Server config
export interface ServerConfig {
  projectPath: string;
  port: number;
  wsPort: number;
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  content?: string;
}
