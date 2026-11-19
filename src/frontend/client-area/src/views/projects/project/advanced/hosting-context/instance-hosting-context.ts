import type { HostingService } from '@/views/hosting/hosting.types'
import type { InstanceResource } from '@/entities/project/instance-resource'

// The `service` the hosting sections of the
// project Advanced tab receive, built from the instance alone. Read-only: nothing is written back to the instance.

/** What the mixin reads from the instance. */
export type InstanceHostingSource = Pick<
  InstanceResource,
  | 'service_id'
  | 'hostingId'
  | 'hostingServerType'
  | 'hostingAccountDetails'
  | 'diagnostic_mode'
  | 'host_ipv4_addresses'
  | 'dns_nameservers'
  | 'host_c_names'
  | 'dns_settings'
  | 'server_settings'
  | 'plan_settings'
  | 'privileges'
>

export function buildInstanceHostingService (instance: InstanceHostingSource): HostingService {
  const details = (instance.hostingAccountDetails || {}) as Record<string, unknown> & { homedir?: string }
  // Not `mapServerAccounts`: it always appends `/`, the mixin only when it is missing.
  let homedir = details.homedir || ''
  if (homedir && !homedir.endsWith('/')) {
    homedir = `${homedir}/`
  }

  const account = {
    id: instance.hostingId,
    server_type: instance.hostingServerType,
    diagnostic_mode: instance.diagnostic_mode,
    username: details.username,
    homedir,
    mysql_db_prefix: details.mysql_db_prefix,
    ip_address: details.ip_address,
    details,
    ipv4_addresses: instance.host_ipv4_addresses,
    nameservers: instance.dns_nameservers,
    host_c_names: instance.host_c_names,
  }

  // One assertion: the mixin has no `domain`, `plan_name` or `status` (nor a numeric account `domain`/`id`); they stay `undefined`
  // as in legacy. The privilege methods are not built: next uses `hasPrivilege(service, …)`.
  return {
    id: instance.service_id,
    hosting_server_type: instance.hostingServerType,
    dns_settings: instance.dns_settings || {},
    server_settings: instance.server_settings || {},
    plan_settings: instance.plan_settings || {},
    dns_server_enabled: false,
    server_accounts: [account],
    privileges: instance.privileges,
  } as unknown as HostingService
}
