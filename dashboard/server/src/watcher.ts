import chokidar from 'chokidar';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import type { FileChangeEvent, WSEventType, Proposal, Artifact, Phase, ActivityEvent } from './types.js';
import {
  parseStateJson,
  parseConfigJson,
  parseRosterJson,
  parseProposalFile,
  parseArtifactFile,
  loadAllProposals,
  loadAllArtifacts,
} from './parsers/json.js';
import { parseRoadmap } from './parsers/markdown.js';

export class FileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private projectPath: string;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceMs = 100;

  constructor(projectPath: string) {
    super();
    this.projectPath = projectPath;
  }

  start(): void {
    const companyPath = path.join(this.projectPath, '.company');
    const planningPath = path.join(this.projectPath, '.planning');

    // Paths to watch
    const watchPaths = [
      path.join(companyPath, '**/*'),
      path.join(planningPath, '**/*'),
    ];

    console.log(`Starting file watcher for: ${this.projectPath}`);
    console.log(`Watching: ${watchPaths.join(', ')}`);

    this.watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher
      .on('add', (filePath) => this.handleChange('add', filePath))
      .on('change', (filePath) => this.handleChange('change', filePath))
      .on('unlink', (filePath) => this.handleChange('unlink', filePath))
      .on('error', (error) => console.error('Watcher error:', error));
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private handleChange(type: 'add' | 'change' | 'unlink', filePath: string): void {
    // Debounce rapid changes to the same file
    const existing = this.debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    this.debounceTimers.set(filePath, setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.processChange(type, filePath);
    }, this.debounceMs));
  }

  private processChange(type: 'add' | 'change' | 'unlink', filePath: string): void {
    const relativePath = path.relative(this.projectPath, filePath);
    const normalizedPath = relativePath.replace(/\\/g, '/');

    console.log(`File ${type}: ${normalizedPath}`);

    // Emit activity event for all changes
    this.emitActivity(type, normalizedPath);

    // Route to specific handlers based on path
    if (normalizedPath === '.company/state.json') {
      this.handleStateChange(filePath, type);
    } else if (normalizedPath === '.company/config.json') {
      this.handleConfigChange(filePath, type);
    } else if (normalizedPath === '.company/roster.json') {
      this.handleRosterChange(filePath, type);
    } else if (normalizedPath.startsWith('.company/proposals/')) {
      this.handleProposalChange(filePath, type, normalizedPath);
    } else if (normalizedPath.startsWith('.company/artifacts/')) {
      this.handleArtifactChange(filePath, type);
    } else if (normalizedPath === '.planning/ROADMAP.md') {
      this.handleRoadmapChange(filePath, type);
    } else if (normalizedPath.match(/^\.planning\/phase-\d+/)) {
      this.handlePhaseChange(filePath, type, normalizedPath);
    }
  }

  private handleStateChange(filePath: string, type: string): void {
    if (type === 'unlink') {
      this.emit('event', {
        type: 'state:update' as WSEventType,
        payload: { phase: 'idle' },
      });
      return;
    }

    const state = parseStateJson(filePath);
    if (state) {
      this.emit('event', {
        type: 'state:update' as WSEventType,
        payload: state,
      });
    }
  }

  private handleConfigChange(filePath: string, type: string): void {
    if (type === 'unlink') return;

    const config = parseConfigJson(filePath);
    if (config) {
      this.emit('event', {
        type: 'config:update' as WSEventType,
        payload: config,
      });
    }
  }

  private handleRosterChange(filePath: string, type: string): void {
    if (type === 'unlink') return;

    const roster = parseRosterJson(filePath);
    if (roster) {
      this.emit('event', {
        type: 'roster:update' as WSEventType,
        payload: roster,
      });
    }
  }

  private handleProposalChange(filePath: string, type: string, relativePath: string): void {
    if (!filePath.endsWith('.json')) return;

    const proposal = type !== 'unlink' ? parseProposalFile(filePath) : null;

    if (type === 'add' && relativePath.includes('/pending/')) {
      if (proposal) {
        this.emit('event', {
          type: 'proposal:new' as WSEventType,
          payload: proposal,
        });
      }
    } else if (type === 'add' && (relativePath.includes('/approved/') || relativePath.includes('/rejected/'))) {
      if (proposal) {
        this.emit('event', {
          type: 'proposal:resolved' as WSEventType,
          payload: proposal,
        });
      }
    }
  }

  private handleArtifactChange(filePath: string, type: string): void {
    if (type === 'unlink') return;

    const artifact = parseArtifactFile(filePath, this.projectPath);
    if (artifact) {
      this.emit('event', {
        type: 'artifact:created' as WSEventType,
        payload: artifact,
      });
    }
  }

  private handleRoadmapChange(filePath: string, type: string): void {
    if (type === 'unlink') return;

    const phases = parseRoadmap(filePath);
    this.emit('event', {
      type: 'roadmap:update' as WSEventType,
      payload: phases,
    });
  }

  private handlePhaseChange(filePath: string, type: string, relativePath: string): void {
    // Extract phase number from path
    const match = relativePath.match(/phase-(\d+)/);
    if (!match) return;

    const phaseNum = parseInt(match[1], 10);

    this.emit('event', {
      type: 'phase:progress' as WSEventType,
      payload: {
        phase: phaseNum,
        action: type,
        file: path.basename(filePath),
      },
    });
  }

  private emitActivity(type: string, relativePath: string): void {
    const actionMap: Record<string, string> = {
      add: 'created',
      change: 'updated',
      unlink: 'deleted',
    };

    const activity: ActivityEvent = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      action: `File ${actionMap[type] || type}`,
      details: relativePath,
      type: type === 'unlink' ? 'warning' : 'info',
    };

    // Try to extract role from path
    const roleMatch = relativePath.match(/\/(artifacts|inboxes)\/([^/]+)\//);
    if (roleMatch) {
      activity.role = roleMatch[2];
    }

    this.emit('event', {
      type: 'activity:log' as WSEventType,
      payload: activity,
    });
  }

  // Load initial state
  loadInitialState(): {
    workflow: ReturnType<typeof parseStateJson>;
    config: ReturnType<typeof parseConfigJson>;
    roster: ReturnType<typeof parseRosterJson>;
    proposals: Proposal[];
    artifacts: Artifact[];
    phases: Phase[];
  } {
    const companyPath = path.join(this.projectPath, '.company');
    const planningPath = path.join(this.projectPath, '.planning');

    return {
      workflow: fs.existsSync(path.join(companyPath, 'state.json'))
        ? parseStateJson(path.join(companyPath, 'state.json'))
        : { phase: 'idle' as const },
      config: fs.existsSync(path.join(companyPath, 'config.json'))
        ? parseConfigJson(path.join(companyPath, 'config.json'))
        : null,
      roster: fs.existsSync(path.join(companyPath, 'roster.json'))
        ? parseRosterJson(path.join(companyPath, 'roster.json'))
        : null,
      proposals: fs.existsSync(path.join(companyPath, 'proposals'))
        ? loadAllProposals(path.join(companyPath, 'proposals'))
        : [],
      artifacts: fs.existsSync(path.join(companyPath, 'artifacts'))
        ? loadAllArtifacts(path.join(companyPath, 'artifacts'), this.projectPath)
        : [],
      phases: fs.existsSync(path.join(planningPath, 'ROADMAP.md'))
        ? parseRoadmap(path.join(planningPath, 'ROADMAP.md'))
        : [],
    };
  }
}
