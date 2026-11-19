import { onScopeDispose } from 'vue'

/**
 * Typed replacement of the legacy `$root.$emit` / `$root.$on` events that cross feature borders.
 * Event names stay 1:1 with legacy (app-lite adds the `redeploy` and
 * `deploy-log-updated` ones). Payloads are the loose Echo bodies (`n.instance`, `n.backup`, ...) until the code that
 * consumes an event types them. `loggedIn` / `loggedOut` are not events here: the navbar reads `session.isLoggedIn`.
 */
export type EntityPayload = Record<string, unknown> | undefined

/** `{ uploadItems }` of the app-lite drop zone: the dropped files. */
export interface FilesDropPayload {
  uploadItems: File[]
}

export interface AppEvents {
  // Shell
  'start-installation-process': void
  'after-login': void
  'app-ready-to-render': boolean
  // next-only (legacy called `updateDocumentTitle` directly): the title inputs changed (instance name, app name); the frame recomputes the tab title.
  'document-title-update': void
  // Style Manager drawer (legacy `$root` events). Only `style-manager-open` has an emitter in
  // legacy; the other three are listened to but never emitted there.
  'style-manager-open': void
  'style-manager-close': void
  'style-manager-activator-show': void
  'style-manager-activator-hide': void
  // The instance list (legacy `$root` events). `instance-deleted` carries the removed instance, or an
  // array of them after a mass delete; the list ignores the payload.
  'instances-list-reload': void
  'instance-deleted': EntityPayload | EntityPayload[]
  'instance-created': EntityPayload
  'instance-updated': EntityPayload
  // The instance page (legacy `$root` `instance-changed`): the frame follows the id of the payload.
  'instance-changed': EntityPayload
  'manage-first-instance': void
  'instance-retry-install': EntityPayload
  // `install_method === 'standard'`: the retry needs the onboarding form (legacy `instance-retry-install-with-form`)
  'instance-retry-install-with-form': EntityPayload
  // app-lite only: a valid drop on the project list
  'start-files-drop-install': FilesDropPayload
  // Echo: instances
  'instance-installation-finished': EntityPayload
  'instance-installation-failed': EntityPayload
  'instance-item-changed': EntityPayload
  'instance-update-finished': EntityPayload
  'instance-update-failed': EntityPayload
  'staging-install-finished': EntityPayload
  'staging-install-failed': EntityPayload
  'push-to-live-finished': EntityPayload
  'push-to-live-failed': EntityPayload
  'push-to-staging-finished': EntityPayload
  'push-to-staging-failed': EntityPayload
  'wordpress-mcp-status-changed': EntityPayload
  // Echo: backups, plugins, themes
  'backup-item-changed': EntityPayload
  'backup-item-deleted': EntityPayload
  'plugin-item-changed': EntityPayload
  'plugin-install-failed': EntityPayload
  'theme-item-changed': EntityPayload
  // Echo: services
  'service-sync-hosting-account-failed': void
  'service-sync-hosting-account-finished': void
  // Echo: `listen` channels
  'diagnostic-mode-enabled': EntityPayload
  'ssl-certificate-installed': EntityPayload
  'import-status-changed': EntityPayload
  // app-lite only
  'instance-redeploy-finished': EntityPayload
  'instance-redeploy-failed': EntityPayload
  'deploy-log-updated': EntityPayload
}

export type AppEventName = keyof AppEvents
export type AppEventHandler<K extends AppEventName> = (payload: AppEvents[K]) => void

const handlers = new Map<AppEventName, Set<(payload: never) => void>>()

/** Adds a handler and returns the function that removes it. */
export function on<K extends AppEventName> (name: K, handler: AppEventHandler<K>): () => void {
  let set = handlers.get(name)
  if (!set) {
    set = new Set()
    handlers.set(name, set)
  }
  set.add(handler)
  return () => off(name, handler)
}

export function off<K extends AppEventName> (name: K, handler: AppEventHandler<K>): void {
  const set = handlers.get(name)
  if (!set) {
    return
  }
  set.delete(handler)
  if (set.size === 0) {
    handlers.delete(name)
  }
}

export function emit<K extends AppEventName> (
  name: K,
  ...args: AppEvents[K] extends void ? [] : [payload: AppEvents[K]]
): void {
  const set = handlers.get(name)
  if (!set) {
    return
  }
  // Copy: a handler may unsubscribe (or re-subscribe) itself while the event is delivered.
  const snapshot = [...set]
  for (const handler of snapshot) {
    (handler as (payload: unknown) => void)(args[0])
  }
}

/** Subscribes for the lifetime of the current effect scope (component setup): the handler is removed on unmount. */
export function useAppEvent<K extends AppEventName> (name: K, handler: AppEventHandler<K>): void {
  const stop = on(name, handler)
  onScopeDispose(stop)
}

/** Test helper: drops every handler. */
export function resetAppEvents (): void {
  handlers.clear()
}
