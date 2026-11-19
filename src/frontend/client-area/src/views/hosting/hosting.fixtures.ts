import type { HostingService } from './hosting.types'

export function makeService (overrides: Partial<HostingService> = {}): HostingService {
  return {
    id: 1,
    domain: 'example.com',
    plan_name: 'Pro',
    status: 'active',
    privileges: ['hosting.manage_domains'],
    plan_settings: {},
    server_accounts: [{ id: 11, domain: 'example.com' }],
    ...overrides,
  }
}
