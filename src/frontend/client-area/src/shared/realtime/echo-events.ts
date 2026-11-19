import { type AppEventName, type AppEvents, emit as busEmit } from '@/shared/events/app-events'

/**
 * Pure mapping of Echo payloads to the typed bus. App-lite adds redeploy and `DeployLogUpdated`.
 * Event names and payloads are 1:1 with legacy.
 */

/** Which field of the notification body a bus event carries as its payload. */
export type NotificationPayloadKey = 'instance' | 'backup' | 'plugin' | 'theme' | null

export interface NotificationRule {
  events: ReadonlyArray<readonly [AppEventName, NotificationPayloadKey]>
  /** The new instance changes `/home` (services / limits). */
  refreshHome?: true
}

const instance = 'instance'

export const NOTIFICATION_RULES: Readonly<Record<string, NotificationRule>> = {
  'user.instance.installation_finished': {
    refreshHome: true,
    events: [['instance-installation-finished', instance], ['instance-item-changed', instance]],
  },
  'user.instance.installation_failed': {
    events: [['instance-installation-failed', instance], ['instance-item-changed', instance]],
  },
  // app-lite only
  'user.instance.redeploy_finished': {
    events: [['instance-redeploy-finished', instance], ['instance-item-changed', instance]],
  },
  'user.instance.redeploy_failed': {
    events: [['instance-redeploy-failed', instance], ['instance-item-changed', instance]],
  },
  'user.instance.create_staging_finished': { events: [['staging-install-finished', instance]] },
  'user.instance.create_staging_failed': { events: [['staging-install-failed', instance]] },
  'user.instance.push_to_live_finished': { events: [['push-to-live-finished', instance]] },
  'user.instance.push_to_live_failed': { events: [['push-to-live-failed', instance]] },
  'user.instance.update_wordpress_finished': { events: [['instance-update-finished', instance]] },
  'user.instance.update_wordpress_failed': { events: [['instance-update-failed', instance]] },
  'user.instance.backup.create_finished': { events: [['backup-item-changed', 'backup']] },
  'user.instance.backup.create_failed': { events: [['backup-item-changed', 'backup']] },
  'user.instance.backup.restore_finished': { events: [['backup-item-changed', 'backup']] },
  'user.instance.backup.restore_failed': { events: [['backup-item-changed', 'backup']] },
  'user.instance.backup.delete_failed': { events: [['backup-item-changed', 'backup']] },
  'user.instance.backup.delete_finished': { events: [['backup-item-deleted', 'backup']] },
  'user.instance.plugin.install_finished': { events: [['plugin-item-changed', 'plugin']] },
  // The install failed: the page names the failure, then the lists take the final row.
  'user.instance.plugin.install_failed': { events: [['plugin-install-failed', 'plugin'], ['plugin-item-changed', 'plugin']] },
  'user.instance.plugin.update_finished': { events: [['plugin-item-changed', 'plugin']] },
  'user.instance.plugin.update_failed': { events: [['plugin-item-changed', 'plugin']] },
  'user.instance.theme.install_finished': { events: [['theme-item-changed', 'theme']] },
  'user.instance.theme.install_failed': { events: [['theme-item-changed', 'theme']] },
  'user.instance.theme.update_finished': { events: [['theme-item-changed', 'theme']] },
  'user.instance.theme.update_failed': { events: [['theme-item-changed', 'theme']] },
  'user.instance.push_to_staging_finished': { events: [['push-to-staging-finished', instance]] },
  'user.instance.push_to_staging_failed': { events: [['push-to-staging-failed', instance]] },
  'user.instance.wordpress_mcp.enable_finished': { events: [['wordpress-mcp-status-changed', instance]] },
  'user.instance.wordpress_mcp.enable_failed': { events: [['wordpress-mcp-status-changed', instance]] },
  'user.instance.wordpress_mcp.disable_finished': { events: [['wordpress-mcp-status-changed', instance]] },
  'user.instance.wordpress_mcp.disable_failed': { events: [['wordpress-mcp-status-changed', instance]] },
  'user.service.sync_hosting_account.failed': { events: [['service-sync-hosting-account-failed', null]] },
  'user.service.sync_hosting_account.finished': { events: [['service-sync-hosting-account-finished', null]] },
}

/** The `.notification(...)` body: `enabled`, `type`, plus the entity under `instance` / `backup` / `plugin` / `theme`. */
export interface EchoNotification {
  [key: string]: unknown
  id?: string
  type: string
  enabled?: boolean
}

export type BusEmit = (name: AppEventName, payload?: unknown) => void

const defaultEmit = busEmit as unknown as BusEmit

/**
 * Binds a dispatcher as an Echo channel listener. Echo hands a listener the pusher event's metadata as its second
 * argument, which would land in the dispatcher's injectable `emit` parameter.
 */
export function asChannelListener<T> (dispatch: (payload: T) => void): (payload: T) => void {
  return payload => {
    dispatch(payload)
  }
}

/** Emits the bus events of one notification; returns whether `/home` has to be refreshed. */
export function dispatchNotification (
  n: EchoNotification,
  emit: BusEmit = defaultEmit,
): { refreshHome: boolean } {
  const rule = Object.hasOwn(NOTIFICATION_RULES, n.type) ? NOTIFICATION_RULES[n.type] : undefined
  if (!rule) {
    return { refreshHome: false }
  }
  for (const [name, key] of rule.events) {
    if (key === null) {
      emit(name)
    } else {
      emit(name, n[key])
    }
  }
  return { refreshHome: rule.refreshHome === true }
}

type EntityPayload = AppEvents['import-status-changed']

/** `DiagnosticModeEnabled`: one event per application. */
export function dispatchDiagnosticModeEnabled (
  n: { applications?: EntityPayload[] },
  emit: BusEmit = defaultEmit,
): void {
  for (const application of n.applications ?? []) {
    emit('diagnostic-mode-enabled', application)
  }
}

/** `SslCertificateInstalled`: ignored without `application`. */
export function dispatchSslCertificateInstalled (
  n: { application?: EntityPayload },
  emit: BusEmit = defaultEmit,
): void {
  if (n.application !== undefined) {
    emit('ssl-certificate-installed', n.application)
  }
}

/** `ImportStatusChanged`: ignored without `application`. */
export function dispatchImportStatusChanged (
  n: { application?: EntityPayload },
  emit: BusEmit = defaultEmit,
): void {
  if (n.application !== undefined) {
    emit('import-status-changed', n.application)
  }
}

/** app-lite `DeployLogUpdated`: the whole body is the payload. */
export function dispatchDeployLogUpdated (n: EntityPayload, emit: BusEmit = defaultEmit): void {
  emit('deploy-log-updated', n)
}
