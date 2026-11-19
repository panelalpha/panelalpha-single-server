import type { HostingDomain } from './domains.types'
import { makeService } from '@/views/hosting/hosting.fixtures'
import { domainHeaders } from './domains-list'

/** A hosting service that can manage domains and SSL (what `DomainsView.test.ts` passes). */
export function domainsTableService () {
  return makeService({
    privileges: ['hosting.manage_domains', 'hosting.manage_ssl'],
    dns_settings: { verification_methods: [] },
    server_accounts: [{ id: 11, domain: 'example.com' }],
  })
}

export const domainsTableHeaders = domainHeaders({ hosting_server_type: 'cpanel' } as never)

/** A domain row as `use-domains-list` builds it (`HostingDomain`), with the fields the table reads. */
export function domainRow (name: string, overrides: Partial<HostingDomain> = {}): HostingDomain {
  return {
    domain: name,
    type: 'addon',
    type_text: 'addon',
    document_root: `/home/example/${name}`,
    capabilities: {},
    updated_at: null,
    updated_at_text: '',
    nsStatus: 'ok',
    sslStatusLoading: false,
    sslInstalledCert: null,
    sslDetectedCert: null,
    editSslButtonLoading: false,
    serverAccountId: 11,
    ...overrides,
  }
}
