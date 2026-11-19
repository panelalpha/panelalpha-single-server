import type { InstanceLogRow, InstanceLogUser } from '@/entities/project/instance-logs.api'
import { INSTANCE_LOG_ACTION_DEFAULTS, prettifyAction } from './instance-log-actions'

// `t` is passed in (the mixin used `i18next.t`); the copy is the same keys with the same arguments.

export type LogTranslate = (key: string, options?: Record<string, unknown>) => string

export type LogPayload = Record<string, unknown> | unknown[] | null | undefined

type Obj = Record<string, any>

const ENABLED = (t: LogTranslate) => `<b>${t('message.status.enabled')}</b>`
const DISABLED = (t: LogTranslate) => `<b>${t('message.status.disabled')}</b>`

function asObject (value: unknown): Obj | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Obj : null
}

/** The first key whose base class (namespace and `:id` stripped) equals `className`. */
export function payloadValue (payload: LogPayload, className: string): unknown {
  if (!payload) {
    return null
  }
  for (const [key, value] of Object.entries(payload)) {
    if (baseClass(key) === className) {
      return value
    }
  }
  return null
}

/** Every value whose base class equals `className`, in payload order. */
export function payloadValues (payload: LogPayload, className: string): unknown[] {
  if (!payload) {
    return []
  }
  return Object.entries(payload)
    .filter(([key]) => baseClass(key) === className)
    .map(([, value]) => value)
}

function baseClass (key: string): string | undefined {
  return key.split(':', 1)[0].split('\\').pop()
}

/** Whether the payload shows the tooltip: `action.payload && action.payload.length !== 0`. An object payload always shows it. */
export function hasInformationTooltip (payload: LogPayload): boolean {
  return Boolean(payload) && !(Array.isArray(payload) && payload.length === 0)
}

/**
 * Legacy's `$t` returns the key when missing, so its Title Case fallback was dead and an
 * action without a translation showed `activityLog.action.<action>`. Here a missing key falls back to the English
 * name from `INSTANCE_LOG_ACTION_DEFAULTS` (actions the panel logs but the API does not translate yet) and then to
 * the Title Case of the action. A translation from the API wins.
 */
export function actionName (action: string, t: LogTranslate): string {
  return t('activityLog.action.' + action, {
    defaultValue: INSTANCE_LOG_ACTION_DEFAULTS[action] ?? prettifyAction(action),
  })
}

export type LogChipClass = 'action-name--post' | 'action-name--delete' | 'action-name--other'

/** Legacy `success lighten-5` / `red lighten-4` / `warning lighten-5` with their `--text` colours. */
export function actionChipClass (method: string): LogChipClass {
  switch (method) {
    case 'POST': {
      return 'action-name--post'
    }
    case 'DELETE': {
      return 'action-name--delete'
    }
    default: {
      return 'action-name--other'
    }
  }
}

/** The info of a created or updated sharing of users. */
export function logUsername (user: InstanceLogUser): string {
  // Legacy concatenates without a guard, so a missing half renders as "undefined" / "null" (kept 1:1).
  if (user.first_name || user.last_name) {
    return `${String(user.first_name)} ${String(user.last_name)}`
  }
  return user.email
}

/** `_` to space and Title Case. A `null` role means owner (the view shows `general.owner`). */
export function logUserRole (role: string | null | undefined): string | null {
  if (role === null || role === undefined) {
    return null
  }
  return role.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function invitedUserInfo (payload: LogPayload): string {
  const user = asObject(payloadValue(payload, 'User'))
  return user ? `<b>${user.email}</b>` : ''
}

function deletedSharedUsersInfo (payload: LogPayload): string {
  const resources = payloadValue(payload, 'Resource')
  if (!Array.isArray(resources)) {
    return ''
  }
  let text = ''
  for (const item of resources) {
    const resource = asObject(item)
    if (!resource) {
      return ''
    }
    text += `<b>${resource.email}</b><br>`
  }
  return text
}

function createdSharedUsersInfo (payload: LogPayload): string {
  let text = ''
  for (const value of payloadValues(payload, 'User')) {
    const user = asObject(value)
    if (!user) {
      return ''
    }
    text += `<b>${logUsername(user as InstanceLogUser)}</b><br>`
  }
  return text
}

function updatedSharingUsersInfo (payload: LogPayload, t: LogTranslate): string {
  let text = ''
  for (const value of payloadValues(payload, 'User')) {
    const user = asObject(value)
    if (!user) {
      return ''
    }
    text += t('activityLog.suffix.toRole', { name: `<b>${logUsername(user as InstanceLogUser)}</b>` })
    text += '<br>'
  }
  return text
}

function backupInfo (payload: LogPayload): string {
  const backup = asObject(payloadValue(payload, 'Backup'))
  const details = asObject(backup?.location_details)
  return details ? `<b>${details.filename}</b>` : ''
}

function automaticBackupInfo (payload: LogPayload, t: LogTranslate): string {
  const automaticBackup = asObject(payloadValue(payload, 'AutomaticBackup'))
  if (!automaticBackup) {
    return ''
  }
  return automaticBackup.frequency === 'never'
    ? t('activityLog.suffix.toStatus', { status: DISABLED(t) })
    : t('activityLog.suffix.toStatus', { status: ENABLED(t) })
}

function labelInfo (payload: LogPayload): string {
  const label = asObject(payloadValue(payload, 'Label'))
  if (!label) {
    return ''
  }
  return `<span style="background-color: ${label.color}; color: white; padding: 1px 8px; border-radius: 15px;">${label.title}</span>`
}

function applicationField (payload: LogPayload, field: string): string {
  const application = asObject(payloadValue(payload, 'Application'))
  return application ? `<b>${application[field]}</b>` : ''
}

function createdStagingInfo (payload: LogPayload): string {
  // The second `Application` is the staging copy (missing means empty).
  const second = asObject(payloadValues(payload, 'Application')[1])
  return second ? `<b>${second.domain}</b>` : ''
}

function autoUpdateInfo (payload: LogPayload, t: LogTranslate): string {
  const resource = asObject(payloadValue(payload, 'Resource'))
  if (!resource) {
    return ''
  }
  let text = t('activityLog.suffix.wordpressStatus', {
    status: resource.auto_update ? ENABLED(t) : DISABLED(t),
  })
  text += t('activityLog.suffix.pluginStatus', {
    status: resource.auto_update_plugins ? ENABLED(t) : DISABLED(t),
  })
  text += t('activityLog.suffix.themeStatus', {
    status: resource.auto_update_themes ? ENABLED(t) : DISABLED(t),
  })
  return text
}

function developerSettingsInfo (payload: LogPayload, t: LogTranslate): string {
  const resource = payloadValue(payload, 'Resource')
  return resource
    ? t('activityLog.suffix.toStatus', { status: ENABLED(t) })
    : t('activityLog.suffix.toStatus', { status: DISABLED(t) })
}

function themeInfo (payload: LogPayload): string {
  const theme = asObject(payloadValue(payload, 'Resource'))
  return theme ? `<b>${theme.title || theme.name}</b>` : ''
}

function pluginInfo (payload: LogPayload): string {
  const plugin = asObject(payloadValue(payload, 'PluginResource'))
  return plugin ? `<b>${plugin.title}</b>` : ''
}

function wordpressUserInfo (payload: LogPayload): string {
  const user = asObject(payloadValue(payload, 'Resource'))
  return user ? `<b>${user.email}</b>` : ''
}

// A non-string resource shows as "[object Object]" (kept 1:1, see the spec notes).
function wordPressConfigInfo (payload: LogPayload): string {
  return `<b>${String(payloadValue(payload, 'Resource'))}</b>`
}

function capitalizeFirstLetter (value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

// Legacy `getCloudflareInfo` had no `return` for non-bool values, so it rendered nothing (added here).
function cloudflareInfo (payload: LogPayload, t: LogTranslate): string {
  const config = payloadValue(payload, 'Resource')
  if (typeof config === 'boolean') {
    return config
      ? t('activityLog.suffix.toStatus', { status: ENABLED(t) })
      : t('activityLog.suffix.toStatus', { status: DISABLED(t) })
  }
  if (typeof config !== 'string') {
    return ''
  }
  return t('activityLog.suffix.toStatus', { status: `<b>${capitalizeFirstLetter(config)}</b>` })
}

type InfoBuilder = (payload: LogPayload, t: LogTranslate) => string

const INFO_BY_ACTION: Record<string, InfoBuilder> = {
  'user.instance.shared_access.resend_access': payload => invitedUserInfo(payload),
  'user.instance.shared_access.create': payload => createdSharedUsersInfo(payload),
  'user.instance.shared_access.update': (payload, t) => updatedSharingUsersInfo(payload, t),
  'user.instance.shared_access.delete': payload => deletedSharedUsersInfo(payload),
  'user.instance.backup.update_automatic': (payload, t) => automaticBackupInfo(payload, t),
  'user.instance.backup.restore': payload => backupInfo(payload),
  'user.instance.backup.delete': payload => backupInfo(payload),
  'user.instance.assign_label': payload => labelInfo(payload),
  'user.instance.unassign_label': payload => labelInfo(payload),
  'user.instance.domain.change_to_own_domain': payload => applicationField(payload, 'domain'),
  'user.instance.domain.change_to_subdomain': payload => applicationField(payload, 'domain'),
  'user.instance.staging.show_push_to_live': payload => applicationField(payload, 'domain'),
  'user.instance.staging.create': payload => createdStagingInfo(payload),
  'user.instance.staging.retry_install': payload => createdStagingInfo(payload),
  'user.instance.wordpress.update': payload => applicationField(payload, 'version'),
  'user.instance.auto_update.update': (payload, t) => autoUpdateInfo(payload, t),
  'user.instance.update_site_name': payload => applicationField(payload, 'name'),
  'user.instance.maintenance_mode.update': (payload, t) => developerSettingsInfo(payload, t),
  'user.instance.debug_mode.update': (payload, t) => developerSettingsInfo(payload, t),
  'user.instance.theme.activate': payload => themeInfo(payload),
  'user.instance.theme.update': payload => themeInfo(payload),
  'user.instance.theme.delete': payload => themeInfo(payload),
  'user.instance.theme.install': payload => themeInfo(payload),
  'user.instance.plugin.activate': payload => pluginInfo(payload),
  'user.instance.plugin.deactivate': payload => pluginInfo(payload),
  'user.instance.plugin.update': payload => pluginInfo(payload),
  'user.instance.plugin.delete': payload => pluginInfo(payload),
  'user.instance.plugin.install': payload => pluginInfo(payload),
  'user.instance.wordpress_config.create': payload => wordPressConfigInfo(payload),
  'user.instance.wordpress_config.update': payload => wordPressConfigInfo(payload),
  'user.instance.wordpress_config.delete': payload => wordPressConfigInfo(payload),
  'user.instance.wordpress_user.create': payload => wordpressUserInfo(payload),
  'user.instance.wordpress_user.update': payload => wordpressUserInfo(payload),
  'user.instance.wordpress_user.delete': payload => wordpressUserInfo(payload),
  'user.instance.wordpress_user.reset_password': payload => wordpressUserInfo(payload),
  'user.instance.cloudflare.security.update': (payload, t) => cloudflareInfo(payload, t),
  'user.instance.cloudflare.browser_check.update': (payload, t) => cloudflareInfo(payload, t),
  'user.instance.cloudflare.development_mode.update': (payload, t) => cloudflareInfo(payload, t),
  'user.instance.edge_cache.update': (payload, t) => cloudflareInfo(payload, t),
}

/** The 39 actions as a map. Unknown action gives `''`. A missing class or a wrong shape gives `''` too. */
export function actionInformation (row: InstanceLogRow, t: LogTranslate): string {
  const build = Object.prototype.hasOwnProperty.call(INFO_BY_ACTION, row.action) ? INFO_BY_ACTION[row.action] : undefined
  return build ? build(row.payload, t) : ''
}
