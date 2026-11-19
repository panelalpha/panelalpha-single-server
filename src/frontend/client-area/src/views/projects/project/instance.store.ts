import type { AsyncStatus, InstanceResource, RawInstance, SharedAccessEntry } from '@/entities/project/instance-resource'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getDebugMode, getMaintenanceMode } from '@/entities/project/instance-modes.api'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { apiBaseUrl } from '@/shared/api/client'
import { getErrorMessage } from '@/shared/api/error-message'
import { useSessionStore } from '@/shared/session/session.store'
import { getInstance, type ProjectLimitsBody, updateLimits as putLimits, updateSiteName as putSiteName } from './instance.api'

/** The success alert is hard-coded English in both apps. It is kept as it is, not translated. */
const NAME_CHANGED_MESSAGE = 'Instance name changed successfully'

/** A project answer read while a WordPress update runs can leave the version out (the panel refreshes its facts): keep the last one. */
function keepWordpressVersionWhileUpdating (previous: InstanceResource | null, fresh: InstanceResource): InstanceResource {
  const version = previous?.status?.wordpress
  if (!previous || previous.id !== fresh.id || !version || fresh.status?.wordpress || !fresh.status) {
    return fresh
  }
  const updating = previous.hasUpdateInProgress?.() === true || fresh.hasUpdateInProgress?.() === true
  if (!updating) {
    return fresh
  }
  fresh.status.wordpress = version
  fresh.status.wordpress_available ??= previous.status.wordpress_available ?? version
  return fresh
}

/** An action's answer is the list item, without the WordPress facts the detail request adds: keep the ones shown. */
function keepWordpressFacts (previous: InstanceResource | null, fresh: InstanceResource): InstanceResource {
  const version = previous?.status?.wordpress
  if (!previous || previous.id !== fresh.id || !version || fresh.status?.wordpress || !fresh.status) {
    return fresh
  }
  fresh.status.wordpress = version
  fresh.status.wordpress_available ??= previous.status.wordpress_available ?? version
  if ((fresh.plugin_details?.length ?? 0) === 0 && (previous.plugin_details?.length ?? 0) > 0) {
    fresh.plugin_details = previous.plugin_details
    fresh.setPluginsData(previous.plugin_details)
  }
  return fresh
}

/**
 * State of the instance frame. The frame owns the resource; every instance screen
 * reads it.
 */
export const useInstanceStore = defineStore('instance', () => {
  const instance = ref<InstanceResource | null>(null)
  /** The child routes render only after the frame passed its redirects. */
  const pageMounted = ref(false)
  const fetching = ref(false)
  /** One shared flag for every Site name editor (topbar and card). */
  const savingName = ref(false)
  /** The Limits form of the Details page is saving. */
  const savingLimits = ref(false)

  /** `GET /instances/{id}`. The old resource stays until the answer comes; a failure rejects. */
  // Each fetch takes a ticket: after a quick switch (live/staging, `:id` change) the answer of the older id is dropped.
  // A dropped answer leaves `fetching` to the newer request.
  let fetchSeq = 0

  /** Resolves `true` when the answer was applied, `false` when a newer fetch replaced it (also for an outdated failure). */
  async function fetchResource (id: number | string): Promise<boolean> {
    const seq = ++fetchSeq
    fetching.value = true
    try {
      const resource = await getInstance(id, useSessionStore().home)
      if (seq !== fetchSeq) {
        return false
      }
      instance.value = keepWordpressVersionWhileUpdating(instance.value, resource)
      return true
    } catch (error) {
      if (seq !== fetchSeq) {
        return false
      }
      throw error
    } finally {
      if (seq === fetchSeq) {
        fetching.value = false
      }
    }
  }

  /** Frame mount: resets the state, then fetches the resource. */
  async function load (id: number | string): Promise<boolean> {
    instance.value = null
    pageMounted.value = false
    return fetchResource(id)
  }

  /** `:id` change: only `fetching` flips; the old resource and `pageMounted` stay until the new answer arrives. */
  async function reload (id: number | string): Promise<boolean> {
    return fetchResource(id)
  }

  /**
   * A change another screen made to the page's resource (a new main domain): the fresh resource replaces it without the frame
   * skeleton, and only while the page still shows that id. A failure rejects; the caller keeps its own request's report.
   */
  async function refresh (id: number | string): Promise<boolean> {
    const fresh = await getInstance(id, useSessionStore().home)
    if (instance.value?.id !== Number(id)) {
      return false
    }
    instance.value = keepWordpressFacts(instance.value, fresh)
    return true
  }

  /** Frame unmount. */
  function clear (): void {
    // A GET that answers after the frame unmounted is dropped.
    fetchSeq += 1
    instance.value = null
    pageMounted.value = false
    fetching.value = false
  }

  function replace (resource: InstanceResource): void {
    instance.value = keepWordpressFacts(instance.value, resource)
  }

  /**
   * Sets one async status on the instance, its staging copies or its
   * live parent, whichever has the id. Returns `false` when none of them is loaded.
   */
  function patchAsyncStatus (id: number, key: keyof AsyncStatus, value: string | null): boolean {
    const root = instance.value
    if (!root) {
      return false
    }
    const target = root.id === id
      ? root
      : root.subInstances.find(item => item.id === id) ?? (root.parentInstance?.id === id ? root.parentInstance : null)
    if (!target) {
      return false
    }
    target.async_status[key] = value
    return true
  }

  /** `staging-created`: the new staging copy joins the sub-instances. */
  function addSubinstance (raw: Record<string, unknown>): void {
    const root = instance.value
    if (!root) {
      return
    }
    const staging = toInstanceResource(raw as unknown as RawInstance, useSessionStore().home, { apiBase: apiBaseUrl() })
    root.subInstances = [...root.subInstances, staging]
  }

  /**
   * `staging-install-finished` and `staging-install-retry`: the sub-instance with the
   * id of `raw` becomes the fresh resource. Unknown ids change nothing.
   */
  function replaceSubinstance (raw: Record<string, unknown>): void {
    const root = instance.value
    if (!root) {
      return
    }
    const index = root.subInstances.findIndex(item => item.id === Number(raw.id))
    if (index === -1) {
      return
    }
    const fresh = toInstanceResource(raw as unknown as RawInstance, useSessionStore().home, { apiBase: apiBaseUrl() })
    root.subInstances = root.subInstances.map((item, position) => (position === index ? fresh : item))
  }

  /** `staging-deleted`: the sub-instance leaves the list. */
  function removeSubinstance (id: number): void {
    if (instance.value) {
      instance.value.subInstances = instance.value.subInstances.filter(item => item.id !== id)
    }
  }

  /** `instance.status.wordpress = instance.version` on `instance-update-finished`. */
  function setWordpressVersion (version: string | null): void {
    if (instance.value) {
      instance.value.status.wordpress = version
    }
  }

  /** The Installation card's queued WooCommerce install, until the panel notifies its end. */
  function setWoocommerceInstalling (installing: boolean): void {
    instance.value?.setWoocommerceInstalling(installing)
  }

  /** `ssl-certificate-installed` and the lite installation events: the SSL order status of the page's instance. */
  function patchSslOrderStatus (status: string): void {
    if (instance.value) {
      instance.value.ssl_order_status = status
    }
  }

  /**
   * `instance-item-changed` without `ssl_order_status` in the payload: `GET /instances/{id}` again.
   * The answer applies only while the page still shows the id.
   */
  async function refreshSslOrderStatus (): Promise<void> {
    const id = instance.value?.id
    if (id === undefined) {
      return
    }
    const fresh = await getInstance(id, useSessionStore().home)
    if (instance.value?.id === id) {
      instance.value.ssl_order_status = fresh.ssl_order_status
    }
  }

  /** `instance-updated`: the shares of the page's instance. */
  function setSharedAccess (sharedAccess: SharedAccessEntry[]): void {
    instance.value?.setSharedAccessData([...sharedAccess])
  }

  /** The frame's title follows after the site name `PUT` answers. */
  function patchName (name: string): void {
    if (instance.value) {
      instance.value.title = name
    }
  }

  /**
   * `PUT /instances/{id}/wordpress/site-name`, then the success alert and the new
   * title, or the error alert. Returns `true` on success. A second call while a save runs does nothing and returns `false`. The store
   * has no route, so the caller updates the document title after `true`. The editors close on the `savingName` change (watchers).
   */
  async function updateSiteName (name: string): Promise<boolean> {
    const resource = instance.value
    if (savingName.value || !resource) {
      return false
    }
    savingName.value = true
    try {
      await putSiteName(resource.id, name)
      patchName(name)
      useAlertsStore().addAlert({ success: true, successMessage: NAME_CHANGED_MESSAGE })
      return true
    } catch (error) {
      useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
      return false
    } finally {
      savingName.value = false
    }
  }

  /**
   * `PUT /instances/{id}/limits`: the answer is the new `resources` block and replaces the one of the instance. A failure
   * is rethrown, so the Limits modal can show the 422 messages under the right fields. A second call while a save runs, or a call with
   * no instance, sends nothing and gives `false`. The answer goes to the instance shown when it arrives, if it is still the same project
   * (a reload during the request replaces the object).
   */
  async function updateLimits (body: ProjectLimitsBody): Promise<boolean> {
    const resource = instance.value
    if (savingLimits.value || !resource) {
      return false
    }
    savingLimits.value = true
    try {
      const resources = await putLimits(resource.id, body)
      const current = instance.value
      if (current?.id === resource.id) {
        current.resources = resources
      }
      return true
    } finally {
      savingLimits.value = false
    }
  }

  /**
   * The maintenance and debug mode reads: only with the privilege and not for a staging
   * copy. Not awaited, as in legacy; a failure becomes an alert.
   */
  function fetchModes (): void {
    const resource = instance.value
    if (!resource || resource.staging) {
      return
    }
    if (resource.hasManageMaintenanceModePrivilege()) {
      void getMaintenanceMode(resource.id)
        .then(status => resource.setMaintenanceMode(status))
        .catch(error => useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) }))
    }
    if (resource.hasManageDebugModePrivilege()) {
      void getDebugMode(resource.id)
        .then(status => resource.setDebugMode(status))
        .catch(error => useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) }))
    }
  }

  return {
    instance,
    pageMounted,
    fetching,
    savingName,
    savingLimits,
    load,
    reload,
    refresh,
    clear,
    replace,
    patchName,
    updateSiteName,
    updateLimits,
    patchAsyncStatus,
    addSubinstance,
    replaceSubinstance,
    removeSubinstance,
    setWordpressVersion,
    setWoocommerceInstalling,
    patchSslOrderStatus,
    refreshSslOrderStatus,
    setSharedAccess,
    fetchModes,
  }
})
