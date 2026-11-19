import type { Service } from './services.types'
import { api } from '@/shared/api/client'

// Calls of the services screen, same contract as legacy.

/** `GET /services`. */
export async function listServices (): Promise<Service[]> {
  const { data } = await api.get<{ data: Service[] }>('/services')
  return data.data
}

export interface CancelServiceResult {
  cancel_url?: string
}

/** `PUT /services/{id}/cancel`; the reason is the text of the description field. */
export async function cancelService (id: number, reason: string): Promise<CancelServiceResult | undefined> {
  const { data } = await api.put<{ data?: CancelServiceResult } | undefined>(`/services/${id}/cancel`, { reason })
  return data?.data
}
