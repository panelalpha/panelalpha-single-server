import type { DomainSslDetails } from './instance-resource'
import { api } from '@/shared/api/client'

/** The certificate the server answers for the domain, or `null`. */
export async function getDetectedCertificate (
  serverAccountId: number,
  domain: string,
): Promise<DomainSslDetails['detected_ssl_cert']> {
  const { data } = await api.get<{ data: DomainSslDetails['detected_ssl_cert'] }>(
    `/server-accounts/${serverAccountId}/ssl/certificate/detected?domain=${domain}`,
  )
  return data.data
}
