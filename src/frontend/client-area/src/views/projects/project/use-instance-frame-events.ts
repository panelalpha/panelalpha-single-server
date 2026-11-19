import type { AsyncStatus, SharedAccessEntry } from '@/entities/project/instance-resource'
import { type EntityPayload, useAppEvent } from '@/shared/events/app-events'
import { useInstanceStore } from './instance.store'

// The `$root` handlers of the instance frame, wired through `app-events`.
// The handlers only write the frame store; the redirects and the navigation go through the hooks the frame passes in.

/** What the frame answers to its handlers: the page's instance, the session flavour and the navigation. */
export interface InstanceFrameEventHooks {
  /** Id of the instance on the page, `null` while the frame has none. */
  currentId: () => number | null
  /** app-lite (single server): the events only app-lite sends are handled there, as in legacy. */
  singleServer: () => boolean
  /** `instance-update-finished` for the page's instance: the page reloads it and its WordPress versions. */
  onUpdateFinished?: () => void
  /** `plugin-item-changed` for the page's WooCommerce: the page reloads the project and its WordPress versions. */
  onWoocommerceChanged?: () => void
  /** `plugin-install-failed` for the page's WooCommerce: the page names the failure. */
  onWoocommerceInstallFailed?: () => void
  /** `instance-changed` for another id: the page moves to it. */
  openInstance: (id: number) => void
  /** `diagnostic-mode-enabled` for the page's instance: the page leaves for the list the session lands on. */
  leave: () => void
}

/** The `id` of an Echo payload, or `null` when it has none. */
export function payloadId (payload: EntityPayload): number | null {
  const id = payload?.id
  return typeof id === 'number' && Number.isInteger(id) ? id : null
}

/** The live id of a push payload (`instance.staging` in legacy). Only a numeric id counts. */
function pushCounterpartId (payload: EntityPayload): number | null {
  const staging = payload?.staging
  return typeof staging === 'number' && Number.isInteger(staging) ? staging : null
}

/** Subscribes the frame's handlers for the lifetime of the current effect scope (the frame's setup). */
export function useInstanceFrameEvents (hooks: InstanceFrameEventHooks): void {
  const instance = useInstanceStore()

  function isCurrent (payload: EntityPayload): boolean {
    const id = payloadId(payload)
    return id !== null && id === hooks.currentId()
  }

  function patch (payload: EntityPayload, key: keyof AsyncStatus, status: string): void {
    const id = payloadId(payload)
    if (id !== null) {
      instance.patchAsyncStatus(id, key, status)
    }
  }

  function patchCounterpart (payload: EntityPayload, key: keyof AsyncStatus, status: string): void {
    const id = pushCounterpartId(payload)
    if (id !== null) {
      instance.patchAsyncStatus(id, key, status)
    }
  }

  // `instance-changed`: the ids of the page's own instance are ignored.
  useAppEvent('instance-changed', payload => {
    const id = payloadId(payload)
    const current = hooks.currentId()
    if (id === null || current === null || id === current) {
      return
    }
    hooks.openInstance(id)
  })

  // The shares of the page's instance follow the share dialog.
  useAppEvent('instance-updated', payload => {
    if (!isCurrent(payload)) {
      return
    }
    instance.setSharedAccess(Array.isArray(payload?.sharedAccess) ? payload.sharedAccess as SharedAccessEntry[] : [])
  })

  // WordPress update. The version is the page's own, so only its own finish sets it.
  useAppEvent('instance-update-failed', payload => patch(payload, 'update', 'failed'))
  useAppEvent('instance-update-finished', payload => {
    patch(payload, 'update', 'finished')
    if (!isCurrent(payload)) {
      return
    }
    // The notification's reduced instance carries no version; keeping the last one avoids reading a finished update as not installed.
    if (typeof payload?.version === 'string') {
      instance.setWordpressVersion(payload.version)
    }
    hooks.onUpdateFinished?.()
  })

  // Plugin rows name their project `application_id`; this notification ends the install's wait.
  useAppEvent('plugin-item-changed', payload => {
    if (payload?.name !== 'woocommerce' || payload?.application_id !== hooks.currentId()) {
      return
    }
    instance.setWoocommerceInstalling(false)
    hooks.onWoocommerceChanged?.()
  })

  // A failed install only ends the wait in the bell; the page has to say it failed.
  useAppEvent('plugin-install-failed', payload => {
    if (payload?.name !== 'woocommerce' || payload?.application_id !== hooks.currentId()) {
      return
    }
    hooks.onWoocommerceInstallFailed?.()
  })

  // Staging install: the finished copy replaces the sub-instance.
  useAppEvent('staging-install-failed', payload => patch(payload, 'installation', 'failed'))
  useAppEvent('staging-install-finished', payload => {
    patch(payload, 'installation', 'finished')
    if (payload) {
      instance.replaceSubinstance(payload)
    }
  })

  // Push to live: the staging copy and its live counterpart share the result.
  useAppEvent('push-to-live-finished', payload => {
    patch(payload, 'push_to_live', 'finished')
    patchCounterpart(payload, 'pull_from_staging', 'finished')
  })
  useAppEvent('push-to-live-failed', payload => {
    patch(payload, 'push_to_live', 'failed')
    patchCounterpart(payload, 'pull_from_staging', 'failed')
  })

  // Push to staging.
  useAppEvent('push-to-staging-finished', payload => patch(payload, 'push_to_staging', 'finished'))
  useAppEvent('push-to-staging-failed', payload => patch(payload, 'push_to_staging', 'failed'))

  // Diagnostic mode: the page of the instance in diagnostic mode is left.
  useAppEvent('diagnostic-mode-enabled', payload => {
    if (isCurrent(payload)) {
      hooks.leave()
    }
  })

  // app-lite only: the SSL order of the page's instance.
  useAppEvent('ssl-certificate-installed', payload => {
    if (hooks.singleServer() && isCurrent(payload)) {
      instance.patchSslOrderStatus('none')
    }
  })

  function onInstallationPayload (payload: EntityPayload): void {
    if (!hooks.singleServer() || !isCurrent(payload)) {
      return
    }
    if (payload && 'ssl_order_status' in payload) {
      const status = payload.ssl_order_status
      instance.patchSslOrderStatus(typeof status === 'string' ? status : 'none')
      return
    }
    void instance.refreshSslOrderStatus()
  }

  useAppEvent('instance-item-changed', onInstallationPayload)
  useAppEvent('instance-installation-finished', onInstallationPayload)
}
