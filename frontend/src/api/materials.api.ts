import { fetchApi } from './client'
import type {
  MaterialClass,
  MaterialClassTreeNode,
  Material,
  MaterialLimitOverride,
  ResolvedLimits,
} from '@/types'

// Material Classes
export function getMaterialClasses(plantId: number): Promise<MaterialClass[]> {
  return fetchApi(`/plants/${plantId}/material-classes`)
}

export function createMaterialClass(
  plantId: number,
  data: {
    name: string
    code: string
    parent_id?: number | null
    description?: string | null
  },
): Promise<MaterialClass> {
  return fetchApi(`/plants/${plantId}/material-classes`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateMaterialClass(
  plantId: number,
  classId: number,
  data: {
    name?: string
    code?: string
    parent_id?: number | null
    description?: string | null
  },
): Promise<MaterialClass> {
  return fetchApi(`/plants/${plantId}/material-classes/${classId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteMaterialClass(plantId: number, classId: number): Promise<void> {
  return fetchApi(`/plants/${plantId}/material-classes/${classId}`, { method: 'DELETE' })
}

export function getMaterialClassTree(
  plantId: number,
  classId: number,
): Promise<MaterialClassTreeNode> {
  return fetchApi(`/plants/${plantId}/material-classes/${classId}/tree`)
}

// Materials
export function getMaterials(
  plantId: number,
  params?: { class_id?: number; search?: string },
): Promise<Material[]> {
  const searchParams = new URLSearchParams()
  if (params?.class_id) searchParams.set('class_id', String(params.class_id))
  if (params?.search) searchParams.set('search', params.search)
  const qs = searchParams.toString()
  return fetchApi(`/plants/${plantId}/materials${qs ? `?${qs}` : ''}`)
}

export function createMaterial(
  plantId: number,
  data: {
    name: string
    code: string
    class_id?: number | null
    description?: string | null
    properties?: Record<string, unknown> | null
  },
): Promise<Material> {
  return fetchApi(`/plants/${plantId}/materials`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateMaterial(
  plantId: number,
  materialId: number,
  data: {
    name?: string
    code?: string
    class_id?: number | null
    description?: string | null
    properties?: Record<string, unknown> | null
  },
): Promise<Material> {
  return fetchApi(`/plants/${plantId}/materials/${materialId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteMaterial(plantId: number, materialId: number): Promise<void> {
  return fetchApi(`/plants/${plantId}/materials/${materialId}`, { method: 'DELETE' })
}

// Material Limit Overrides
export function getMaterialOverrides(charId: number): Promise<MaterialLimitOverride[]> {
  return fetchApi(`/characteristics/${charId}/material-overrides`)
}

export function createMaterialOverride(
  charId: number,
  data: {
    material_id?: number | null
    class_id?: number | null
    ucl?: number | null
    lcl?: number | null
    stored_sigma?: number | null
    stored_center_line?: number | null
    target_value?: number | null
    usl?: number | null
    lsl?: number | null
  },
): Promise<MaterialLimitOverride> {
  return fetchApi(`/characteristics/${charId}/material-overrides`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateMaterialOverride(
  charId: number,
  overrideId: number,
  data: {
    ucl?: number | null
    lcl?: number | null
    stored_sigma?: number | null
    stored_center_line?: number | null
    target_value?: number | null
    usl?: number | null
    lsl?: number | null
  },
): Promise<MaterialLimitOverride> {
  return fetchApi(`/characteristics/${charId}/material-overrides/${overrideId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteMaterialOverride(charId: number, overrideId: number): Promise<void> {
  return fetchApi(`/characteristics/${charId}/material-overrides/${overrideId}`, {
    method: 'DELETE',
  })
}

export function resolveMaterialLimits(
  charId: number,
  materialId: number,
): Promise<ResolvedLimits> {
  return fetchApi(`/characteristics/${charId}/material-overrides/resolve/${materialId}`)
}
