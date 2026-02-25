import type {
  Characteristic,
  HierarchyNode,
  Plant,
  PlantCreate,
  PlantUpdate,
} from '@/types'
import { fetchApi } from './client'

// Plant API
export const plantApi = {
  list: (activeOnly?: boolean) => {
    const params = activeOnly ? '?active_only=true' : ''
    return fetchApi<Plant[]>(`/plants/${params}`)
  },

  get: (id: number) => fetchApi<Plant>(`/plants/${id}`),

  create: (data: PlantCreate) =>
    fetchApi<Plant>('/plants/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: PlantUpdate) =>
    fetchApi<Plant>(`/plants/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number) => fetchApi<void>(`/plants/${id}`, { method: 'DELETE' }),
}

// Hierarchy API
export const hierarchyApi = {
  // Global endpoints (backward compatibility)
  getTree: () => fetchApi<HierarchyNode[]>('/hierarchy/'),

  getNode: (id: number) => fetchApi<HierarchyNode>(`/hierarchy/${id}`),

  createNode: (data: { name: string; type: string; parent_id: number | null }) =>
    fetchApi<HierarchyNode>('/hierarchy/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateNode: (id: number, data: { name?: string }) =>
    fetchApi<HierarchyNode>(`/hierarchy/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteNode: (id: number) => fetchApi<void>(`/hierarchy/${id}`, { method: 'DELETE' }),

  getCharacteristics: (id: number) =>
    fetchApi<Characteristic[]>(`/hierarchy/${id}/characteristics`),

  // Plant-scoped endpoints
  getTreeByPlant: (plantId: number) => fetchApi<HierarchyNode[]>(`/plants/${plantId}/hierarchies/`),

  createNodeInPlant: (
    plantId: number,
    data: { name: string; type: string; parent_id: number | null },
  ) =>
    fetchApi<HierarchyNode>(`/plants/${plantId}/hierarchies/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}
