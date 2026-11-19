import { api } from '@/shared/api/client'

// The CDN page of an instance under
// `/instances/{id}/cdn/*`. Requests go through the shared client; the `instances` / `projects` segment is rewritten there, so these paths
// stay as legacy writes them.

export interface CdnFeature {
  name: string
  title?: string | null
}

export interface CdnStatus {
  under_attack_mode: boolean
  features: CdnFeature[]
}

/** `GET /instances/{id}/cdn/status`: the under-attack switch and the feature list (`features` falls back to `[]`). */
export async function getCdnStatus (id: number | string): Promise<CdnStatus> {
  const { data } = await api.get<CdnStatus>(`/instances/${id}/cdn/status`)
  return {
    under_attack_mode: data.under_attack_mode,
    features: data.features ?? [],
  }
}

/** `POST /instances/{id}/cdn/purge` without a body. */
export async function purgeCdnCache (id: number | string): Promise<void> {
  await api.post(`/instances/${id}/cdn/purge`)
}

/** `POST /instances/{id}/cdn/under-attack` with `{ enabled }`. */
export async function setUnderAttackMode (id: number | string, enabled: boolean): Promise<void> {
  await api.post(`/instances/${id}/cdn/under-attack`, { enabled })
}
