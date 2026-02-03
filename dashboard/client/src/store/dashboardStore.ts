import { create } from 'zustand';

// Types
export type WorkflowPhase = 'idle' | 'expertise' | 'planning' | 'execution' | 'review' | 'merge';

export interface WorkflowState {
  phase: WorkflowPhase;
  currentProject?: string;
  startedAt?: string;
  lastActivity?: string;
  blockers?: string[];
}

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

export interface RoleDef {
  name: string;
  title: string;
  model?: string;
  expertise?: string[];
  status?: 'active' | 'idle' | 'blocked';
  currentTask?: string;
}

export interface Roster {
  ceo: RoleDef;
  specialists: Record<string, RoleDef>;
  roles: Record<string, RoleDef>;
}

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

export interface ActivityEvent {
  id: string;
  timestamp: string;
  action: string;
  role?: string;
  details?: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

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

interface DashboardState {
  connected: boolean;
  projectPath: string | null;
  workflow: WorkflowState;
  config: CompanyConfig | null;
  roster: Roster | null;
  proposals: Proposal[];
  artifacts: Artifact[];
  activities: ActivityEvent[];
  phases: Phase[];
  tasks: Task[];

  // Actions
  setConnected: (connected: boolean) => void;
  setProjectPath: (path: string) => void;
  setWorkflow: (workflow: WorkflowState) => void;
  setConfig: (config: CompanyConfig) => void;
  setRoster: (roster: Roster) => void;
  addProposal: (proposal: Proposal) => void;
  updateProposal: (proposal: Proposal) => void;
  addArtifact: (artifact: Artifact) => void;
  addActivity: (activity: ActivityEvent) => void;
  setPhases: (phases: Phase[]) => void;
  setTasks: (tasks: Task[]) => void;
  setInitialState: (state: Partial<DashboardState>) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  connected: false,
  projectPath: null,
  workflow: { phase: 'idle' },
  config: null,
  roster: null,
  proposals: [],
  artifacts: [],
  activities: [],
  phases: [],
  tasks: [],

  setConnected: (connected) => set({ connected }),

  setProjectPath: (projectPath) => set({ projectPath }),

  setWorkflow: (workflow) => set({ workflow }),

  setConfig: (config) => set({ config }),

  setRoster: (roster) => set({ roster }),

  addProposal: (proposal) =>
    set((state) => ({
      proposals: [proposal, ...state.proposals.filter((p) => p.id !== proposal.id)],
    })),

  updateProposal: (proposal) =>
    set((state) => ({
      proposals: state.proposals.map((p) =>
        p.id === proposal.id ? proposal : p
      ),
    })),

  addArtifact: (artifact) =>
    set((state) => ({
      artifacts: [artifact, ...state.artifacts.filter((a) => a.id !== artifact.id)],
    })),

  addActivity: (activity) =>
    set((state) => ({
      activities: [activity, ...state.activities].slice(0, 100), // Keep last 100
    })),

  setPhases: (phases) => set({ phases }),

  setTasks: (tasks) => set({ tasks }),

  setInitialState: (initialState) =>
    set((state) => ({
      ...state,
      workflow: initialState.workflow || state.workflow,
      config: initialState.config || state.config,
      roster: initialState.roster || state.roster,
      proposals: initialState.proposals || state.proposals,
      artifacts: initialState.artifacts || state.artifacts,
      phases: initialState.phases || state.phases,
    })),
}));
