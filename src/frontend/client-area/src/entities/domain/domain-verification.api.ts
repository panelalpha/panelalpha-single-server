import { api } from '@/shared/api/client'

// The domain verification call shared by hosting (add and transfer of a domain) and the onboarding domain step (same contract in app and app-lite).

export interface DomainVerification {
  verification_allowed?: boolean
  verification_required?: boolean
  verification_record?: Record<string, unknown>
}

/** `GET /services/{id}/domains/verify?domain=`: whether adding the domain asks for a DNS record first. */
export async function verifyDomain (serviceId: number, domain: string): Promise<DomainVerification> {
  const { data } = await api.get<DomainVerification>(`/services/${serviceId}/domains/verify?domain=${encodeURIComponent(domain)}`)
  return data
}
