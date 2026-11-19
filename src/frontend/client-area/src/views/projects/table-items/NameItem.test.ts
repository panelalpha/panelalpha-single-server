import type { RawInstance } from '@/entities/project/instance-resource'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import NameItem from './NameItem.vue'

// The suspended chip of the list row, before it moves to `SuspendChip`.
function raw (overrides: Partial<RawInstance> = {}): RawInstance {
  return {
    id: 7,
    type: 'wordpress',
    name: 'Acme',
    url: 'https://acme.example.com',
    domain: 'acme.example.com',
    service_status: 'active',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    service_created_at: '2026-01-01T00:00:00.000Z',
    version: '6.5.0',
    has_automatic_backup: true,
    backup_details: [{ id: 1, type: 'automatic' }],
    async_status: { installation: 'finished' },
    labels: [],
    privileges: [],
    shared_access: [],
    staging_apps: [],
    details: {},
    server_settings: {},
    ...overrides,
  }
}

async function mountName (overrides: Partial<RawInstance> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome({ app: {}, user: {} })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
  return mountKit(NameItem, { props: { item: toInstanceResource(raw(overrides)), main: true }, global: { plugins: [pinia, router] } })
}

describe('NameItem suspended chip', () => {
  it.each(['suspended', 'cancelled'])('shows the suspended chip for a %s service', async serviceStatus => {
    const wrapper = await mountName({ service_status: serviceStatus })
    const chip = wrapper.get('[data-testid="instance-table-suspend-chip"]')
    expect(chip.classes()).toContain('suspend-chip')
    expect(chip.text()).toContain('message.status.suspended')
    wrapper.unmount()
  })

  it('shows no suspended chip for an active service', async () => {
    const wrapper = await mountName()
    expect(wrapper.find('[data-testid="instance-table-suspend-chip"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
