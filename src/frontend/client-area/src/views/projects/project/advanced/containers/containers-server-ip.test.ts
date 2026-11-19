import { describe, expect, it } from 'vitest'
import { projectContainersServerIp } from './containers-server-ip'

describe('projectContainersServerIp', () => {
  it('takes the first address of the list', () => {
    expect(projectContainersServerIp({ host_ipv4_addresses: ['1.1.1.1', '2.2.2.2'], host_ip_address: '9.9.9.9' })).toBe('1.1.1.1')
  })

  it('falls back to host_ip_address when the list is empty', () => {
    expect(projectContainersServerIp({ host_ipv4_addresses: [], host_ip_address: '9.9.9.9' })).toBe('9.9.9.9')
  })

  it('returns null when there is neither', () => {
    expect(projectContainersServerIp({ host_ipv4_addresses: undefined, host_ip_address: undefined })).toBeNull()
    expect(projectContainersServerIp({ host_ipv4_addresses: [], host_ip_address: null })).toBeNull()
  })
})
