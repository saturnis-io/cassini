import * as fs from 'fs';
import * as path from 'path';
import type { WorkflowState, CompanyConfig, Roster, Proposal, Artifact } from '../types.js';

export function parseJsonFile<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    console.error(`Error parsing JSON file ${filePath}:`, error);
    return null;
  }
}

export function parseStateJson(filePath: string): WorkflowState | null {
  return parseJsonFile<WorkflowState>(filePath);
}

export function parseConfigJson(filePath: string): CompanyConfig | null {
  return parseJsonFile<CompanyConfig>(filePath);
}

export function parseRosterJson(filePath: string): Roster | null {
  return parseJsonFile<Roster>(filePath);
}

export function parseProposalFile(filePath: string): Proposal | null {
  const proposal = parseJsonFile<Partial<Proposal>>(filePath);
  if (!proposal) return null;

  const filename = path.basename(filePath, '.json');
  const parentDir = path.basename(path.dirname(filePath));

  return {
    id: proposal.id || filename,
    title: proposal.title || filename,
    description: proposal.description || '',
    proposedBy: proposal.proposedBy || 'unknown',
    status: parentDir === 'approved' ? 'approved'
          : parentDir === 'rejected' ? 'rejected'
          : 'pending',
    requiresCEO: proposal.requiresCEO ?? false,
    createdAt: proposal.createdAt || new Date().toISOString(),
    resolvedAt: proposal.resolvedAt,
    resolution: proposal.resolution,
  };
}

export function parseArtifactFile(filePath: string, basePath: string): Artifact | null {
  try {
    const stats = fs.statSync(filePath);
    const relativePath = path.relative(basePath, filePath);
    const parts = relativePath.split(path.sep);

    // Extract role from path (e.g., .company/artifacts/architect/design.md)
    const role = parts.length > 2 ? parts[1] : 'unknown';
    const filename = path.basename(filePath);

    // Determine tier from content or filename
    let tier: 'SUMMARY' | 'DECISIONS' | 'FULL' = 'FULL';
    let content: string | undefined;

    if (filePath.endsWith('.md') || filePath.endsWith('.txt') || filePath.endsWith('.json')) {
      content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes('<!-- TIER: SUMMARY -->') || filename.includes('summary')) {
        tier = 'SUMMARY';
      } else if (content.includes('<!-- TIER: DECISIONS -->') || filename.includes('decisions')) {
        tier = 'DECISIONS';
      }
    }

    return {
      id: relativePath.replace(/[/\\]/g, '-'),
      role,
      filename,
      path: relativePath,
      tier,
      content: content?.substring(0, 5000), // Limit content size
      createdAt: stats.birthtime.toISOString(),
      size: stats.size,
    };
  } catch (error) {
    console.error(`Error parsing artifact ${filePath}:`, error);
    return null;
  }
}

export function loadAllProposals(proposalsDir: string): Proposal[] {
  const proposals: Proposal[] = [];

  const subdirs = ['pending', 'approved', 'rejected'];
  for (const subdir of subdirs) {
    const dir = path.join(proposalsDir, subdir);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const proposal = parseProposalFile(path.join(dir, file));
      if (proposal) proposals.push(proposal);
    }
  }

  return proposals.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function loadAllArtifacts(artifactsDir: string, basePath: string): Artifact[] {
  const artifacts: Artifact[] = [];

  if (!fs.existsSync(artifactsDir)) return artifacts;

  function walkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else {
        const artifact = parseArtifactFile(fullPath, basePath);
        if (artifact) artifacts.push(artifact);
      }
    }
  }

  walkDir(artifactsDir);
  return artifacts.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
