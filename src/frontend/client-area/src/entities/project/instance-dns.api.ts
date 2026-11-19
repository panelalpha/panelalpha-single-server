import { api } from '@/shared/api/client'

// The call is `PUT /instances/{id}/dns/alerts/enable|disable`; the stored flag is `response.data.data`.
// The client rewrites `instances` to `projects` on single server, as for every instance request.

/** Switches the DNS alerts of the instance and returns the flag the server stores. Errors reject (the caller shows them). */
export async function setDnsAlerts (id: number, enabled: boolean): Promise<boolean> {
  const action = enabled ? 'enable' : 'disable'
  const { data } = await api.put<{ data: boolean }>(`/instances/${id}/dns/alerts/${action}`)
  return data.data
}
