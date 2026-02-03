import * as fs from 'fs';
import type { Phase } from '../types.js';

export function parseRoadmap(filePath: string): Phase[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseRoadmapContent(content);
  } catch (error) {
    console.error(`Error parsing roadmap ${filePath}:`, error);
    return [];
  }
}

export function parseRoadmapContent(content: string): Phase[] {
  const phases: Phase[] = [];
  const lines = content.split('\n');

  let currentPhase: Phase | null = null;

  for (const line of lines) {
    // Match phase headers like "## Phase 1: Setup" or "### Phase 2 - Implementation"
    const phaseMatch = line.match(/^#{2,3}\s*Phase\s+(\d+(?:\.\d+)?)[:\s-]*(.*)$/i);
    if (phaseMatch) {
      if (currentPhase) {
        phases.push(currentPhase);
      }

      const phaseNum = parseFloat(phaseMatch[1]);
      const phaseName = phaseMatch[2].trim();

      // Determine status from markers in the line
      let status: 'pending' | 'active' | 'complete' = 'pending';
      if (line.includes('✅') || line.includes('[x]') || line.toLowerCase().includes('complete')) {
        status = 'complete';
      } else if (line.includes('🔄') || line.includes('[ ]') || line.toLowerCase().includes('active') || line.toLowerCase().includes('in progress')) {
        status = 'active';
      }

      currentPhase = {
        number: phaseNum,
        name: phaseName,
        status,
        goal: '',
        artifacts: [],
        tasks: [],
      };
      continue;
    }

    // Parse goal if in a phase
    if (currentPhase) {
      const goalMatch = line.match(/^\s*(?:\*\*)?Goal(?:\*\*)?[:\s]+(.+)$/i);
      if (goalMatch) {
        currentPhase.goal = goalMatch[1].trim();
      }

      // Parse artifacts list items
      const artifactMatch = line.match(/^\s*[-*]\s*`?([^`\n]+)`?\s*$/);
      if (artifactMatch && line.toLowerCase().includes('artifact')) {
        currentPhase.artifacts = currentPhase.artifacts || [];
        currentPhase.artifacts.push(artifactMatch[1].trim());
      }
    }
  }

  // Don't forget the last phase
  if (currentPhase) {
    phases.push(currentPhase);
  }

  return phases;
}

export function parseStateMarkdown(filePath: string): { entries: StateLogEntry[] } {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseStateContent(content);
  } catch (error) {
    console.error(`Error parsing state markdown ${filePath}:`, error);
    return { entries: [] };
  }
}

interface StateLogEntry {
  timestamp: string;
  action: string;
  details?: string;
}

export function parseStateContent(content: string): { entries: StateLogEntry[] } {
  const entries: StateLogEntry[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Match log entries like "- [2024-01-15 10:30] Action description"
    const logMatch = line.match(/^\s*[-*]\s*\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)\]\s*(.+)$/);
    if (logMatch) {
      entries.push({
        timestamp: logMatch[1],
        action: logMatch[2].trim(),
      });
    }
  }

  return { entries };
}

export function extractTier(content: string): 'SUMMARY' | 'DECISIONS' | 'FULL' {
  if (content.includes('<!-- TIER: SUMMARY -->')) return 'SUMMARY';
  if (content.includes('<!-- TIER: DECISIONS -->')) return 'DECISIONS';

  // Heuristic based on content length
  const lines = content.split('\n').filter(l => l.trim()).length;
  if (lines < 20) return 'SUMMARY';
  if (lines < 100) return 'DECISIONS';
  return 'FULL';
}
