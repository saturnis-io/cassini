import type { HierarchyNode, Characteristic } from '@/types'

export interface ConstellationPosition {
  x: number
  z: number
  constellationId: number
}

/**
 * Deterministic seeded pseudo-random number generator.
 * Returns a value in [0, 1) based on the integer seed.
 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

/**
 * Find the top-level ancestor of a node within the tree.
 * Returns the id of the root-most node that is a direct child of the
 * conceptual root (parent_id === null) containing the target node.
 */
function findTopLevelAncestor(
  nodeId: number,
  parentMap: Map<number, number | null>,
): number {
  let current = nodeId
  let parent = parentMap.get(current)

  // Walk up the tree until we reach a node whose parent is null (root level)
  while (parent !== null && parent !== undefined) {
    const grandparent = parentMap.get(parent)
    if (grandparent === null || grandparent === undefined) {
      // parent is a top-level node
      return parent
    }
    current = parent
    parent = grandparent
  }

  // The node itself is top-level
  return current
}

/**
 * Flatten a hierarchy tree into a map of nodeId -> parentId.
 */
function flattenTree(
  nodes: HierarchyNode[],
  parentMap: Map<number, number | null>,
): void {
  for (const node of nodes) {
    parentMap.set(node.id, node.parent_id)
    if (node.children && node.children.length > 0) {
      flattenTree(node.children, parentMap)
    }
  }
}

/**
 * Build a map from hierarchy node ID to its full breadcrumb path string.
 * Walks the tree recursively, accumulating path segments like "Area > Line > Station".
 * Top-level nodes (direct children of root) start the path — the plant/root name is excluded.
 */
export function buildHierarchyPathMap(
  tree: HierarchyNode[],
): Map<number, string> {
  const pathMap = new Map<number, string>()

  function walk(nodes: HierarchyNode[], prefix: string): void {
    for (const node of nodes) {
      const path = prefix ? `${prefix} > ${node.name}` : node.name
      pathMap.set(node.id, path)
      if (node.children && node.children.length > 0) {
        walk(node.children, path)
      }
    }
  }

  walk(tree, '')
  return pathMap
}

/**
 * Compute spatial positions for all characteristics in a plant, grouped by hierarchy.
 *
 * Uses a deterministic force-directed layout:
 * - Top-level hierarchy groups are placed in a circle 150+ units from origin
 * - Within each group, characteristics attract siblings (spring, rest length 15)
 *   and repel all others within range (inverse-square, range 100)
 * - 100 simulation steps produce the final positions
 * - All randomness is seeded by node IDs for full determinism
 *
 * @param nodes - The hierarchy tree (top-level nodes with nested children)
 * @param characteristics - All characteristics in the plant
 * @returns Map from characteristic ID to its position in the XZ plane
 */
export function computeConstellationLayout(
  nodes: HierarchyNode[],
  characteristics: Characteristic[],
): Map<number, ConstellationPosition> {
  const result = new Map<number, ConstellationPosition>()

  // Edge case: nothing to lay out
  if (nodes.length === 0 || characteristics.length === 0) {
    return result
  }

  // Build a flat parent map from the hierarchy tree
  const parentMap = new Map<number, number | null>()
  flattenTree(nodes, parentMap)

  // Group characteristics by their top-level ancestor
  const groups = new Map<number, Characteristic[]>()

  for (const char of characteristics) {
    // Only include characteristics whose hierarchy_id exists in the tree
    if (!parentMap.has(char.hierarchy_id)) continue

    const topId = findTopLevelAncestor(char.hierarchy_id, parentMap)
    let group = groups.get(topId)
    if (!group) {
      group = []
      groups.set(topId, group)
    }
    group.push(char)
  }

  // Edge case: no characteristics mapped to known hierarchy nodes
  if (groups.size === 0) {
    return result
  }

  // Compute top-level group center positions arranged in a circle
  const groupIds = Array.from(groups.keys()).sort((a, b) => a - b)
  const groupCenters = new Map<number, { x: number; z: number }>()
  const groupRadius = Math.max(150, groupIds.length * 40)

  if (groupIds.length === 1) {
    // Single group at origin
    groupCenters.set(groupIds[0], { x: 0, z: 0 })
  } else {
    const angleStep = (2 * Math.PI) / groupIds.length
    for (let i = 0; i < groupIds.length; i++) {
      const angle = angleStep * i
      groupCenters.set(groupIds[i], {
        x: Math.cos(angle) * groupRadius,
        z: Math.sin(angle) * groupRadius,
      })
    }
  }

  // Initialize positions for every characteristic within its group
  // using seeded random offsets from the group center
  interface Particle {
    charId: number
    hierarchyId: number
    constellationId: number
    x: number
    z: number
    vx: number
    vz: number
  }

  const particles: Particle[] = []
  const particleIndex = new Map<number, number>() // charId -> index in particles[]

  for (const groupId of groupIds) {
    const chars = groups.get(groupId)!
    const center = groupCenters.get(groupId)!

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i]
      // Seed from characteristic id for determinism
      const seed = char.id * 1000 + i
      const angle = seededRandom(seed) * 2 * Math.PI
      const radius = seededRandom(seed + 1) * 20

      particleIndex.set(char.id, particles.length)
      particles.push({
        charId: char.id,
        hierarchyId: char.hierarchy_id,
        constellationId: groupId,
        x: center.x + Math.cos(angle) * radius,
        z: center.z + Math.sin(angle) * radius,
        vx: 0,
        vz: 0,
      })
    }
  }

  // Edge case: single characteristic — no forces needed
  if (particles.length <= 1) {
    for (const p of particles) {
      result.set(p.charId, {
        x: p.x,
        z: p.z,
        constellationId: p.constellationId,
      })
    }
    return result
  }

  // Force-directed simulation: 100 steps
  // SPRING_REST must exceed halo ring radius (~30) to prevent visual overlap
  const SPRING_REST = 55
  const SPRING_K = 0.05
  const REPULSION_RANGE = 150
  const REPULSION_STRENGTH = 2000
  const DAMPING = 0.85
  const STEPS = 100

  // Pre-build same-group lists for efficient sibling detection
  const groupParticleIndices = new Map<number, number[]>()
  for (let i = 0; i < particles.length; i++) {
    const gId = particles[i].constellationId
    let indices = groupParticleIndices.get(gId)
    if (!indices) {
      indices = []
      groupParticleIndices.set(gId, indices)
    }
    indices.push(i)
  }

  for (let step = 0; step < STEPS; step++) {
    // Reset forces
    for (const p of particles) {
      p.vx *= DAMPING
      p.vz *= DAMPING
    }

    // Apply forces within each group
    for (const indices of groupParticleIndices.values()) {
      for (let i = 0; i < indices.length; i++) {
        const pi = particles[indices[i]]

        for (let j = i + 1; j < indices.length; j++) {
          const pj = particles[indices[j]]

          const dx = pj.x - pi.x
          const dz = pj.z - pi.z
          const distSq = dx * dx + dz * dz
          const dist = Math.sqrt(distSq) || 0.01

          // Repulsion (inverse square, capped at range)
          if (dist < REPULSION_RANGE) {
            const repForce = REPULSION_STRENGTH / (distSq || 1)
            const fx = (dx / dist) * repForce
            const fz = (dz / dist) * repForce
            pi.vx -= fx
            pi.vz -= fz
            pj.vx += fx
            pj.vz += fz
          }

          // Spring attraction for siblings (same hierarchy parent)
          if (pi.hierarchyId === pj.hierarchyId) {
            const displacement = dist - SPRING_REST
            const springForce = SPRING_K * displacement
            const fx = (dx / dist) * springForce
            const fz = (dz / dist) * springForce
            pi.vx += fx
            pi.vz += fz
            pj.vx -= fx
            pj.vz -= fz
          }
        }
      }
    }

    // Gentle attraction toward group center to prevent drift
    const CENTER_PULL = 0.002
    for (const p of particles) {
      const center = groupCenters.get(p.constellationId)!
      const dx = center.x - p.x
      const dz = center.z - p.z
      p.vx += dx * CENTER_PULL
      p.vz += dz * CENTER_PULL
    }

    // Update positions
    for (const p of particles) {
      p.x += p.vx
      p.z += p.vz
    }
  }

  // Write final positions to the result map
  for (const p of particles) {
    result.set(p.charId, {
      x: p.x,
      z: p.z,
      constellationId: p.constellationId,
    })
  }

  return result
}
