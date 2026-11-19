import type { InstanceResource } from '@/entities/project/instance-resource'

// The first IPv4 address of the host, then `host_ip_address`.
// The hosting-context adapter has no such fallback (the mixin does not either), so it lives here.
export function projectContainersServerIp (instance: Pick<InstanceResource, 'host_ipv4_addresses' | 'host_ip_address'>): string | null {
  return instance.host_ipv4_addresses?.[0] ?? instance.host_ip_address ?? null
}
