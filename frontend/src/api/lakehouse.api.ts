import { API_BASE, fetchApi, getAccessToken } from '@/api/client'

export type LakehouseFormat = 'arrow' | 'parquet' | 'csv' | 'json'

export interface LakehouseTableInfo {
  name: string
  description: string
  columns: string[]
  plant_scoped: boolean
}

export interface LakehouseCatalog {
  tables: LakehouseTableInfo[]
  formats: string[]
  rate_limit: string
}

export interface LakehouseExportParams {
  table: string
  format: LakehouseFormat
  plantId?: number | null
  columns?: string[] | null
  from?: string | null
  to?: string | null
  limit?: number | null
}

export async function getLakehouseCatalog(): Promise<LakehouseCatalog> {
  return fetchApi<LakehouseCatalog>('/lakehouse/tables')
}

function buildExportPath(params: LakehouseExportParams): string {
  const search = new URLSearchParams()
  search.set('format', params.format)
  if (params.plantId != null) search.set('plant_id', String(params.plantId))
  if (params.columns && params.columns.length > 0)
    search.set('columns', params.columns.join(','))
  if (params.from) search.set('from', params.from)
  if (params.to) search.set('to', params.to)
  if (params.limit != null) search.set('limit', String(params.limit))
  return `/lakehouse/${encodeURIComponent(params.table)}?${search.toString()}`
}

/** Build the full URL (including /api/v1 prefix) for an export — used to render curl/python snippets. */
export function buildLakehouseExportUrl(params: LakehouseExportParams): string {
  return `${API_BASE}${buildExportPath(params)}`
}

/** Trigger a browser download for the given export. */
export async function downloadLakehouseExport(
  params: LakehouseExportParams,
): Promise<void> {
  const path = buildExportPath(params)
  const token = getAccessToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { headers, credentials: 'include' })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      // ignore — keep generic message
    }
    throw new Error(detail)
  }

  const blob = await res.blob()
  const filename = filenameFor(params)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function filenameFor(params: LakehouseExportParams): string {
  const ext = params.format === 'arrow' ? 'arrow' : params.format
  return `cassini-${params.table}.${ext}`
}

/** Render a copy-pasteable curl snippet for the given export. */
export function curlSnippet(params: LakehouseExportParams, baseUrl: string): string {
  const url = `${baseUrl}${buildExportPath(params)}`
  return [
    `curl -H 'Authorization: Bearer $CASSINI_TOKEN' \\`,
    `  '${url}' \\`,
    `  -o ${filenameFor(params)}`,
  ].join('\n')
}

/** Render a copy-pasteable Python snippet (requests + pyarrow). */
export function pythonSnippet(
  params: LakehouseExportParams,
  baseUrl: string,
): string {
  const url = `${baseUrl}${buildExportPath(params)}`
  if (params.format === 'arrow' || params.format === 'parquet') {
    const reader =
      params.format === 'arrow'
        ? "pa.ipc.open_stream(io.BytesIO(resp.content)).read_all()"
        : "pq.read_table(io.BytesIO(resp.content))"
    return [
      'import io',
      'import os',
      'import requests',
      params.format === 'arrow' ? 'import pyarrow as pa' : 'import pyarrow.parquet as pq',
      '',
      `url = "${url}"`,
      'headers = {"Authorization": f"Bearer {os.environ[\'CASSINI_TOKEN\']}"}',
      'resp = requests.get(url, headers=headers)',
      'resp.raise_for_status()',
      `table = ${reader}`,
      'df = table.to_pandas()',
      'print(df.head())',
    ].join('\n')
  }
  if (params.format === 'csv') {
    return [
      'import os',
      'import pandas as pd',
      '',
      `url = "${url}"`,
      'headers = {"Authorization": f"Bearer {os.environ[\'CASSINI_TOKEN\']}"}',
      'df = pd.read_csv(url, storage_options=headers)',
      'print(df.head())',
    ].join('\n')
  }
  return [
    'import os',
    'import requests',
    '',
    `url = "${url}"`,
    'headers = {"Authorization": f"Bearer {os.environ[\'CASSINI_TOKEN\']}"}',
    'resp = requests.get(url, headers=headers)',
    'resp.raise_for_status()',
    'data = resp.json()',
    'print(len(data["rows"]), "rows")',
  ].join('\n')
}
