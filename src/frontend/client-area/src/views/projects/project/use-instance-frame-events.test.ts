import type { RawInstance } from '@/entities/project/instance-resource'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type EffectScope, effectScope } from 'vue'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { emit, resetAppEvents } from '@/shared/events/app-events'
import { getInstance } from './instance.api'
import { useInstanceStore } from './instance.store'
import { type InstanceFrameEventHooks, useInstanceFrameEvents } from './use-instance-frame-events'

vi.mock('./instance.api', () => ({ getInstance: vi.fn() }))
vi.mock('@/entities/project/instance-modes.api', () => ({
  getMaintenanceMode: vi.fn(),
  getDebugMode: vi.fn(),
}))

const IDLE = { installation: null, update: null, push_to_live: null, pull_from_staging: null, push_to_staging: null }

function raw (id: number, overrides: Record<string, unknown> = {}): RawInstance {
  return {
    id,
    url: `https://site-${id}.example.com`,
    status: 'active',
    created_at: '2026-10-01 10:00:00',
    async_status: IDLE,
    ...overrides,
  } as RawInstance
}

/** The page: live 1 with its staging copy 41, both idle unless `staging` says otherwise. */
function pageRaw (staging: Record<string, unknown> = {}): RawInstance {
  return raw(1, {
    version: '6.4',
    staging_apps: [raw(41, { staging: true, ...staging })],
  })
}

describe('useInstanceFrameEvents', () => {
  let scope: EffectScope
  let singleServer: boolean
  let hooks: InstanceFrameEventHooks & { openInstance: ReturnType<typeof vi.fn>, leave: ReturnType<typeof vi.fn>, onUpdateFinished: ReturnType<typeof vi.fn>, onWoocommerceChanged: ReturnType<typeof vi.fn>, onWoocommerceInstallFailed: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    setActivePinia(createPinia())
    resetAppEvents()
    vi.mocked(getInstance).mockReset()
    singleServer = false
    hooks = {
      currentId: () => useInstanceStore().instance?.id ?? null,
      singleServer: () => singleServer,
      openInstance: vi.fn(),
      leave: vi.fn(),
      onUpdateFinished: vi.fn(),
      onWoocommerceChanged: vi.fn(),
      onWoocommerceInstallFailed: vi.fn(),
    }
    useInstanceStore().replace(toInstanceResource(pageRaw(), null))
    scope = effectScope()
    scope.run(() => useInstanceFrameEvents(hooks))
  })

  afterEach(() => {
    scope.stop()
    resetAppEvents()
  })

  const store = () => useInstanceStore()
  const page = () => store().instance!
  const staging = () => page().subInstances[0]!

  describe('instance-changed', () => {
    it('moves the page to another instance', () => {
      emit('instance-changed', { id: 41 })
      expect(hooks.openInstance).toHaveBeenCalledWith(41)
    })

    it('ignores the id of the page itself', () => {
      emit('instance-changed', { id: 1 })
      expect(hooks.openInstance).not.toHaveBeenCalled()
    })

    it('ignores a payload without an id', () => {
      emit('instance-changed', {})
      expect(hooks.openInstance).not.toHaveBeenCalled()
    })
  })

  describe('instance-updated', () => {
    it('sets the shares of the page instance', () => {
      emit('instance-updated', { id: 1, sharedAccess: [{ email: 'ann@example.com', role: 'editor' }] })
      expect(page().sharedAccess).toEqual([{ email: 'ann@example.com', role: 'editor' }])
    })

    it('ignores the shares of another instance', () => {
      emit('instance-updated', { id: 41, sharedAccess: [{ email: 'ann@example.com', role: 'editor' }] })
      expect(page().sharedAccess).toBeUndefined()
    })
  })

  describe('instance-update', () => {
    it('marks the update failed on the page instance', () => {
      emit('instance-update-failed', { id: 1 })
      expect(page().async_status.update).toBe('failed')
    })

    it('finishes the update and takes the new WordPress version of the page instance', () => {
      page().async_status.update = 'in_progress'
      emit('instance-update-finished', { id: 1, version: '6.5' })
      expect(page().async_status.update).toBe('finished')
      expect(page().status.wordpress).toBe('6.5')
      expect(hooks.onUpdateFinished).toHaveBeenCalledOnce()
    })

    it('keeps the last version when the finished payload carries none, and asks the page to reload', () => {
      page().async_status.update = 'in_progress'
      emit('instance-update-finished', { id: 1, version: null })
      expect(page().async_status.update).toBe('finished')
      expect(page().status.wordpress).toBe('6.4')
      expect(hooks.onUpdateFinished).toHaveBeenCalledOnce()
    })

    it('keeps the version when another instance finishes its update', () => {
      emit('instance-update-finished', { id: 41, version: '6.9' })
      expect(page().status.wordpress).toBe('6.4')
      expect(hooks.onUpdateFinished).not.toHaveBeenCalled()
    })
  })

  describe('plugin-item-changed', () => {
    it('ends the WooCommerce install wait of the page instance and asks the page to read the project again', () => {
      page().setWoocommerceInstalling(true)

      emit('plugin-item-changed', { name: 'woocommerce', version: '11.3.0', application_id: 1 })

      expect(page().status.woocommerce_installing).toBe(false)
      expect(hooks.onWoocommerceChanged).toHaveBeenCalledOnce()
    })

    it('ignores another plugin of the page instance', () => {
      page().setWoocommerceInstalling(true)

      emit('plugin-item-changed', { name: 'akismet', version: '5.7.2', application_id: 1 })

      expect(page().status.woocommerce_installing).toBe(true)
      expect(hooks.onWoocommerceChanged).not.toHaveBeenCalled()
    })

    it('ignores WooCommerce of another instance', () => {
      page().setWoocommerceInstalling(true)

      emit('plugin-item-changed', { name: 'woocommerce', version: '11.3.0', application_id: 41 })

      expect(page().status.woocommerce_installing).toBe(true)
      expect(hooks.onWoocommerceChanged).not.toHaveBeenCalled()
    })
  })

  describe('plugin-install-failed', () => {
    it('names the failure of the page instance\'s WooCommerce', () => {
      emit('plugin-install-failed', { name: 'woocommerce', application_id: 1 })

      expect(hooks.onWoocommerceInstallFailed).toHaveBeenCalledOnce()
    })

    it('ignores the failure of another plugin of the page instance', () => {
      emit('plugin-install-failed', { name: 'akismet', application_id: 1 })

      expect(hooks.onWoocommerceInstallFailed).not.toHaveBeenCalled()
    })

    it('ignores the WooCommerce failure of another instance', () => {
      emit('plugin-install-failed', { name: 'woocommerce', application_id: 41 })

      expect(hooks.onWoocommerceInstallFailed).not.toHaveBeenCalled()
    })
  })

  describe('staging-install', () => {
    it('marks the install of the staging copy failed', () => {
      emit('staging-install-failed', { id: 41 })
      expect(staging().async_status.installation).toBe('failed')
    })

    it('replaces the staging copy with the fresh resource', () => {
      emit('staging-install-finished', { ...raw(41, { staging: true, name: 'Fresh copy' }) })
      expect(staging().title).toBe('Fresh copy')
      expect(staging().async_status.installation).toBeNull()
      expect(page().subInstances).toHaveLength(1)
    })

    it('leaves the sub-instances alone for an unknown id', () => {
      const before = page().subInstances
      emit('staging-install-finished', raw(99, { staging: true }))
      expect(page().subInstances).toBe(before)
    })
  })

  describe('push to live', () => {
    it('marks the push on the staging copy and the pull on its live counterpart', () => {
      emit('push-to-live-finished', { id: 41, staging: 1 })
      expect(staging().async_status.push_to_live).toBe('finished')
      expect(page().async_status.pull_from_staging).toBe('finished')
    })

    it('marks both failed when the push fails', () => {
      emit('push-to-live-failed', { id: 41, staging: 1 })
      expect(staging().async_status.push_to_live).toBe('failed')
      expect(page().async_status.pull_from_staging).toBe('failed')
    })

    it('marks only the staging copy when the payload names no numeric counterpart', () => {
      emit('push-to-live-finished', { id: 41, staging: true })
      expect(staging().async_status.push_to_live).toBe('finished')
      expect(page().async_status.pull_from_staging).toBeNull()
    })
  })

  describe('push to staging', () => {
    it('marks the push to staging finished and failed on the instance', () => {
      emit('push-to-staging-finished', { id: 1 })
      expect(page().async_status.push_to_staging).toBe('finished')
      emit('push-to-staging-failed', { id: 1 })
      expect(page().async_status.push_to_staging).toBe('failed')
    })
  })

  describe('diagnostic-mode-enabled', () => {
    it('leaves the page of the instance in diagnostic mode', () => {
      emit('diagnostic-mode-enabled', { id: 1 })
      expect(hooks.leave).toHaveBeenCalledTimes(1)
    })

    it('stays on the page for another instance', () => {
      emit('diagnostic-mode-enabled', { id: 41 })
      expect(hooks.leave).not.toHaveBeenCalled()
    })
  })

  describe('app-lite SSL order events', () => {
    it('ignores ssl-certificate-installed outside single server', () => {
      page().ssl_order_status = 'pending'
      emit('ssl-certificate-installed', { id: 1 })
      expect(page().ssl_order_status).toBe('pending')
    })

    it('clears the SSL order of the page instance under single server', () => {
      singleServer = true
      page().ssl_order_status = 'pending'
      emit('ssl-certificate-installed', { id: 1 })
      expect(page().ssl_order_status).toBe('none')
    })

    it('takes ssl_order_status from an installation payload', () => {
      singleServer = true
      emit('instance-item-changed', { id: 1, ssl_order_status: 'awaiting_dns_propagation' })
      expect(page().ssl_order_status).toBe('awaiting_dns_propagation')
      expect(getInstance).not.toHaveBeenCalled()
    })

    it('reads the instance again when the installation payload has no SSL order status', async () => {
      singleServer = true
      vi.mocked(getInstance).mockResolvedValue(toInstanceResource(raw(1, { ssl_order_status: 'failed' }), null))

      emit('instance-installation-finished', { id: 1 })
      await vi.waitFor(() => expect(page().ssl_order_status).toBe('failed'))
      expect(getInstance).toHaveBeenCalledWith(1, null)
    })

    it('ignores an installation payload of another instance', () => {
      singleServer = true
      emit('instance-item-changed', { id: 41, ssl_order_status: 'failed' })
      expect(page().ssl_order_status).toBe('none')
      expect(getInstance).not.toHaveBeenCalled()
    })

    it('ignores installation events outside single server', () => {
      emit('instance-item-changed', { id: 1, ssl_order_status: 'failed' })
      expect(page().ssl_order_status).toBe('none')
    })
  })
})
