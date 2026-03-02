import type { ProductLimit } from '@/types'
import { fetchApi } from './client'

export interface ProductLimitUpsert {
  product_code: string
  ucl?: number | null
  lcl?: number | null
  stored_sigma?: number | null
  stored_center_line?: number | null
  target_value?: number | null
  usl?: number | null
  lsl?: number | null
}

export interface ProductLimitUpdate {
  ucl?: number | null
  lcl?: number | null
  stored_sigma?: number | null
  stored_center_line?: number | null
  target_value?: number | null
  usl?: number | null
  lsl?: number | null
}

export const productLimitApi = {
  list: (charId: number) =>
    fetchApi<ProductLimit[]>(`/characteristics/${charId}/product-limits`),

  upsert: (charId: number, data: ProductLimitUpsert) =>
    fetchApi<ProductLimit>(`/characteristics/${charId}/product-limits`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (charId: number, productCode: string) =>
    fetchApi<ProductLimit>(
      `/characteristics/${charId}/product-limits/${encodeURIComponent(productCode)}`,
    ),

  update: (charId: number, productCode: string, data: ProductLimitUpdate) =>
    fetchApi<ProductLimit>(
      `/characteristics/${charId}/product-limits/${encodeURIComponent(productCode)}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
    ),

  delete: (charId: number, productCode: string) =>
    fetchApi<void>(
      `/characteristics/${charId}/product-limits/${encodeURIComponent(productCode)}`,
      { method: 'DELETE' },
    ),

  productCodes: (charId: number) =>
    fetchApi<string[]>(`/characteristics/${charId}/product-codes`),
}
