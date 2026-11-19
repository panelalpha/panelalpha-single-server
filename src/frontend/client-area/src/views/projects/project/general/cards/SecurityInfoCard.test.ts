import type { RawInstance } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PRIVILEGES } from '@/entities/privileges/privileges'
import * as backupsApi from '@/entities/project/instance-backups.api'
import { toInstanceResource } from '@/entities/project/instance-resource'
import * as sslApi from '@/entities/ssl/ssl-certificates.api'
import SslIndicator from '@/entities/ssl/ui/SslIndicator.vue'
import { emit } from '@/shared/events/app-events'
import { mountKit } from '@/test/mount-kit'
import SecurityInfoCard from './SecurityInfoCard.vue'

vi.mock('@/entities/project/instance-backups.api', () => ({
  getAutomaticBackupSettings: vi.fn(),
  createBackup: vi.fn(),
}))

vi.mock('@/entities/ssl/ssl-certificates.api', () => ({
  getDetectedCertificate: vi.fn().mockResolvedValue({}),
  getDetectedCertificateByUrl: vi.fn().mockResolvedValue({}),
  resetCertificateCache: vi.fn(),
}))

// The kit maps t(key) to the key, so the assertions name legacy keys, not English copy.

function raw (overrides: Partial<RawInstance> = {}): RawInstance {
  return {
    id: 3,
    type: 'wordpress',
    name: 'Acme',
    url: 'https://acme.example.com',
    domain: 'acme.example.com',
    status: 'active',
    version: '6.5.1',
    privileges: [PRIVILEGES.MANAGE_BACKUPS, PRIVILEGES.MANAGE_AUTO_BACKUP],
    labels: [],
    shared_access: [],
    staging_apps: [],
    details: {},
    server_settings: {},
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

async function mountCard (overrides: Partial<RawInstance> = {}) {
  setActivePinia(createPinia())
  const wrapper = await mountKit(SecurityInfoCard, {
    props: { instance: toInstanceResource(raw(overrides)) },
    global: { plugins: [createPinia()] },
  })
  await flushPromises()
  return wrapper
}

describe('SecurityInfoCard: Create backup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is blocked when no backup store is set up', async () => {
    vi.mocked(backupsApi.getAutomaticBackupSettings).mockResolvedValue({ frequency: 'never', store_configured: false })

    const wrapper = await mountCard()

    expect(wrapper.get('[data-testid="security-create-backup"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('is available when the store is set up', async () => {
    vi.mocked(backupsApi.getAutomaticBackupSettings).mockResolvedValue({ frequency: 'never', store_configured: true })

    const wrapper = await mountCard()

    expect(wrapper.get('[data-testid="security-create-backup"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('is available while the answer is unknown (older Engine)', async () => {
    vi.mocked(backupsApi.getAutomaticBackupSettings).mockResolvedValue({ frequency: 'never' })

    const wrapper = await mountCard()

    expect(wrapper.get('[data-testid="security-create-backup"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('is available when the server runs its own backup system', async () => {
    vi.mocked(backupsApi.getAutomaticBackupSettings).mockResolvedValue({ frequency: 'never', store_configured: false })

    const wrapper = await mountCard({ server_settings: { uses_own_backup_system: true } })

    expect(wrapper.get('[data-testid="security-create-backup"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('SecurityInfoCard: SSL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(backupsApi.getAutomaticBackupSettings).mockResolvedValue({ frequency: 'never', store_configured: true })
  })

  it('shows no "Disabled" when the certificate request fails', async () => {
    vi.mocked(sslApi.getDetectedCertificate).mockRejectedValueOnce(new Error('Too Many Attempts.'))

    const wrapper = await mountCard()

    expect(wrapper.find('[data-testid="security-ssl-unknown"]').exists()).toBe(true)
    expect(wrapper.findComponent(SslIndicator).exists()).toBe(false)
    wrapper.unmount()
  })

  it('clears the dash when a new request succeeds after a failed one', async () => {
    vi.mocked(sslApi.getDetectedCertificate).mockRejectedValueOnce(new Error('Too Many Attempts.'))
    const wrapper = await mountCard()
    expect(wrapper.find('[data-testid="security-ssl-unknown"]').exists()).toBe(true)

    vi.mocked(sslApi.getDetectedCertificate).mockResolvedValueOnce({ issuer_name: 'Let\'s Encrypt' } as never)
    emit('ssl-certificate-installed', { id: 3 })
    await flushPromises()

    expect(wrapper.find('[data-testid="security-ssl-unknown"]').exists()).toBe(false)
    expect(wrapper.findComponent(SslIndicator).exists()).toBe(true)
    wrapper.unmount()
  })

  it('ignores an older request that fails after a newer one succeeded', async () => {
    let rejectOld: (error: Error) => void = () => {}
    vi.mocked(sslApi.getDetectedCertificate).mockReturnValueOnce(new Promise((_resolve, reject) => {
      rejectOld = reject
    }))
    const wrapper = await mountCard()

    vi.mocked(sslApi.getDetectedCertificate).mockResolvedValueOnce({ issuer_name: 'Let\'s Encrypt' } as never)
    emit('ssl-certificate-installed', { id: 3 })
    await flushPromises()
    rejectOld(new Error('Too Many Attempts.'))
    await flushPromises()

    expect(wrapper.find('[data-testid="security-ssl-unknown"]').exists()).toBe(false)
    expect(wrapper.findComponent(SslIndicator).exists()).toBe(true)
    wrapper.unmount()
  })
})
