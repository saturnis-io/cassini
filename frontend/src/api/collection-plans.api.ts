import { fetchApi } from './client'

// ---- Types ----

export interface CollectionPlanItemCreate {
  characteristic_id: number
  sequence_order: number
  instructions?: string
  required?: boolean
}

export interface CollectionPlanCreate {
  name: string
  plant_id: number
  description?: string
  items: CollectionPlanItemCreate[]
}

export interface CollectionPlanUpdate {
  name?: string
  description?: string
  is_active?: boolean
  items?: CollectionPlanItemCreate[]
}

export interface CollectionPlanItem {
  id: number
  characteristic_id: number
  characteristic_name: string | null
  hierarchy_path: string | null
  sequence_order: number
  instructions: string | null
  required: boolean
  usl: number | null
  lsl: number | null
  target_value: number | null
  subgroup_size: number
}

export interface CollectionPlan {
  id: number
  plant_id: number
  name: string
  description: string | null
  is_active: boolean
  created_by: number | null
  created_at: string
  updated_at: string | null
  item_count: number
}

export interface CollectionPlanDetail extends CollectionPlan {
  items: CollectionPlanItem[]
}

export interface ExecutionStartResponse {
  execution_id: number
  plan_id: number
  started_at: string
  items: CollectionPlanItem[]
}

export interface CollectionPlanExecution {
  id: number
  plan_id: number
  executed_by: number | null
  started_at: string
  completed_at: string | null
  status: 'in_progress' | 'completed' | 'abandoned'
  items_completed: number
  items_skipped: number
}

export interface ExecutionCompleteRequest {
  items_completed: number
  items_skipped: number
  status: 'completed' | 'abandoned'
}

// ---- API functions ----

export const collectionPlanApi = {
  list: (plantId: number, isActive?: boolean) => {
    const params = new URLSearchParams({ plant_id: String(plantId) })
    if (isActive != null) params.set('is_active', String(isActive))
    return fetchApi<CollectionPlan[]>(`collection-plans?${params}`)
  },

  get: (planId: number) =>
    fetchApi<CollectionPlanDetail>(`collection-plans/${planId}`),

  create: (data: CollectionPlanCreate) =>
    fetchApi<CollectionPlanDetail>('collection-plans', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (planId: number, data: CollectionPlanUpdate) =>
    fetchApi<CollectionPlanDetail>(`collection-plans/${planId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (planId: number) =>
    fetchApi<void>(`collection-plans/${planId}`, { method: 'DELETE' }),

  startExecution: (planId: number) =>
    fetchApi<ExecutionStartResponse>(`collection-plans/${planId}/execute`, {
      method: 'POST',
    }),

  completeExecution: (planId: number, executionId: number, data: ExecutionCompleteRequest) =>
    fetchApi<CollectionPlanExecution>(
      `collection-plans/${planId}/executions/${executionId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
    ),

  listExecutions: (planId: number, limit?: number) => {
    const params = new URLSearchParams()
    if (limit != null) params.set('limit', String(limit))
    const qs = params.toString()
    return fetchApi<CollectionPlanExecution[]>(
      `collection-plans/${planId}/executions${qs ? `?${qs}` : ''}`,
    )
  },
}
