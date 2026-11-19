import type { InstanceLogRow } from '@/entities/project/instance-logs.api'
import { describe, expect, it } from 'vitest'
import {
  actionChipClass,
  actionInformation,
  actionName,
  hasInformationTooltip,
  type LogTranslate,
  logUsername,
  logUserRole,
  payloadValue,
  payloadValues,
} from './instance-log'

// `t(key)` echoes the key with its options, so assertions read as "key(arguments)".
const t: LogTranslate = (key, options) => (options ? `${key}${JSON.stringify(options)}` : key)

function row (action: string, payload: InstanceLogRow['payload'], method = 'POST'): InstanceLogRow {
  return {
    user: { email: 'a@b.c' },
    action,
    request_method: method,
    payload,
    date: '2026-10-01',
  }
}

const ENABLED = '<b>message.status.enabled</b>'
const DISABLED = '<b>message.status.disabled</b>'

describe('payloadValue / payloadValues', () => {
  it('matches the base class name, ignoring namespace and :id suffix', () => {
    const payload = { 'App\\Models\\Application:42': { domain: 'x.test' }, 'Other:1': { x: 1 } }
    expect(payloadValue(payload, 'Application')).toEqual({ domain: 'x.test' })
    expect(payloadValue(payload, 'Other')).toEqual({ x: 1 })
  })

  it('returns null when the class is absent or the payload is null', () => {
    expect(payloadValue({ Foo: 1 }, 'Bar')).toBeNull()
    expect(payloadValue(null, 'Bar')).toBeNull()
    expect(payloadValue([], 'Bar')).toBeNull()
  })

  it('collects every match in payload order', () => {
    const payload = { 'NS\\User:1': 'a', 'User:2': 'b', 'Other': 'c' }
    expect(payloadValues(payload, 'User')).toEqual(['a', 'b'])
    expect(payloadValues(null, 'User')).toEqual([])
  })
})

describe('hasInformationTooltip', () => {
  it('is false for null and an empty array, true for an object', () => {
    expect(hasInformationTooltip(null)).toBe(false)
    expect(hasInformationTooltip([])).toBe(false)
    expect(hasInformationTooltip({})).toBe(true)
    expect(hasInformationTooltip([1])).toBe(true)
  })
})

describe('actionName', () => {
  // The real `t` returns `defaultValue` when the key is missing; the one in the test only returns it.
  const tDefault: LogTranslate = (key, options) => (
    key === 'activityLog.action.user.instance.theme.install' ? 'Installed Theme' : String(options?.defaultValue)
  )

  it('translates the activity log key', () => {
    expect(actionName('user.instance.theme.install', t)).toBe(
      'activityLog.action.user.instance.theme.install{"defaultValue":"User Instance Theme Install"}',
    )
    expect(actionName('user.instance.theme.install', tDefault)).toBe('Installed Theme')
  })

  it('falls back to the English name of an action the API does not translate', () => {
    expect(actionName('user.instance.git.deploy', tDefault)).toBe('Initiated Git Deploy')
    expect(actionName('user.hosting.file_manager.create-directory', tDefault)).toBe('Created Directory')
  })

  it('falls back to Title Case for an action nobody knows', () => {
    expect(actionName('user.instance.some_new-thing', tDefault)).toBe('User Instance Some New Thing')
  })
})

describe('actionChipClass', () => {
  it('maps POST, DELETE and other methods', () => {
    expect(actionChipClass('POST')).toBe('action-name--post')
    expect(actionChipClass('DELETE')).toBe('action-name--delete')
    expect(actionChipClass('PUT')).toBe('action-name--other')
    expect(actionChipClass('GET')).toBe('action-name--other')
  })
})

describe('logUsername', () => {
  it('joins first and last name, falls back to email', () => {
    expect(logUsername({ email: 'e', first_name: 'Ada', last_name: 'Lovelace' })).toBe('Ada Lovelace')
    expect(logUsername({ email: 'e', first_name: null, last_name: '' })).toBe('e')
    expect(logUsername({ email: 'e' })).toBe('e')
  })

  it('renders a missing half as "undefined" like legacy', () => {
    expect(logUsername({ email: 'e', first_name: 'Ada' })).toBe('Ada undefined')
  })
})

describe('logUserRole', () => {
  it('turns underscores into spaces and capitalises words', () => {
    expect(logUserRole('super_admin')).toBe('Super Admin')
    expect(logUserRole('editor')).toBe('Editor')
  })

  it('keeps null for owner and treats an empty role as owner too', () => {
    expect(logUserRole(null)).toBeNull()
    expect(logUserRole(undefined)).toBeNull()
    expect(logUserRole('')).toBe('')
  })
})

describe('actionInformation', () => {
  it('returns empty string for an unknown action', () => {
    expect(actionInformation(row('user.instance.unknown', { X: 1 }), t)).toBe('')
    expect(actionInformation(row('constructor', {}), t)).toBe('')
  })

  // One payload per action, expected HTML as in legacy.
  const table: Array<[string, InstanceLogRow['payload'], string]> = [
    ['user.instance.shared_access.resend_access', { User: { email: 'x@y.z' } }, '<b>x@y.z</b>'],
    ['user.instance.shared_access.create', { User: { email: 'x@y.z', first_name: 'A', last_name: 'B' } }, '<b>A B</b><br>'],
    ['user.instance.shared_access.update', { User: { email: 'x@y.z', first_name: 'A', last_name: 'B' } }, 'activityLog.suffix.toRole{"name":"<b>A B</b>"}<br>'],
    ['user.instance.shared_access.delete', { Resource: [{ email: 'x@y.z' }] }, '<b>x@y.z</b><br>'],
    ['user.instance.backup.update_automatic', { AutomaticBackup: { frequency: 'never' } }, `activityLog.suffix.toStatus{"status":"${DISABLED}"}`],
    ['user.instance.backup.restore', { Backup: { location_details: { filename: 'f.zip' } } }, '<b>f.zip</b>'],
    ['user.instance.backup.delete', { Backup: { location_details: { filename: 'f.zip' } } }, '<b>f.zip</b>'],
    ['user.instance.assign_label', { Label: { color: '#fff', title: 'Prod' } }, '<span style="background-color: #fff; color: white; padding: 1px 8px; border-radius: 15px;">Prod</span>'],
    ['user.instance.unassign_label', { Label: { color: '#fff', title: 'Prod' } }, '<span style="background-color: #fff; color: white; padding: 1px 8px; border-radius: 15px;">Prod</span>'],
    ['user.instance.domain.change_to_own_domain', { Application: { domain: 'a.test' } }, '<b>a.test</b>'],
    ['user.instance.domain.change_to_subdomain', { Application: { domain: 'a.test' } }, '<b>a.test</b>'],
    ['user.instance.staging.show_push_to_live', { Application: { domain: 'a.test' } }, '<b>a.test</b>'],
    ['user.instance.staging.create', { 'Application:1': { domain: 'a.test' }, 'Application:2': { domain: 'stg.test' } }, '<b>stg.test</b>'],
    ['user.instance.staging.retry_install', { 'NS\\Application:1': { domain: 'a.test' }, 'NS\\Application:2': { domain: 'stg.test' } }, '<b>stg.test</b>'],
    ['user.instance.wordpress.update', { Application: { version: '6.5' } }, '<b>6.5</b>'],
    ['user.instance.auto_update.update', { Resource: { auto_update: true, auto_update_plugins: false, auto_update_themes: true } },
      `activityLog.suffix.wordpressStatus{"status":"${ENABLED}"}activityLog.suffix.pluginStatus{"status":"${DISABLED}"}activityLog.suffix.themeStatus{"status":"${ENABLED}"}`],
    ['user.instance.update_site_name', { Application: { name: 'Shop' } }, '<b>Shop</b>'],
    ['user.instance.maintenance_mode.update', { Resource: true }, `activityLog.suffix.toStatus{"status":"${ENABLED}"}`],
    ['user.instance.debug_mode.update', { Resource: false }, `activityLog.suffix.toStatus{"status":"${DISABLED}"}`],
    ['user.instance.theme.activate', { Resource: { title: 'Twenty', name: 'twenty' } }, '<b>Twenty</b>'],
    ['user.instance.theme.update', { Resource: { name: 'twenty' } }, '<b>twenty</b>'],
    ['user.instance.theme.delete', { Resource: { title: 'Twenty' } }, '<b>Twenty</b>'],
    ['user.instance.theme.install', { Resource: { title: 'Twenty' } }, '<b>Twenty</b>'],
    ['user.instance.plugin.activate', { PluginResource: { title: 'Akismet' } }, '<b>Akismet</b>'],
    ['user.instance.plugin.deactivate', { PluginResource: { title: 'Akismet' } }, '<b>Akismet</b>'],
    ['user.instance.plugin.update', { PluginResource: { title: 'Akismet' } }, '<b>Akismet</b>'],
    ['user.instance.plugin.delete', { PluginResource: { title: 'Akismet' } }, '<b>Akismet</b>'],
    ['user.instance.plugin.install', { PluginResource: { title: 'Akismet' } }, '<b>Akismet</b>'],
    ['user.instance.wordpress_config.create', { Resource: 'WP_DEBUG' }, '<b>WP_DEBUG</b>'],
    ['user.instance.wordpress_config.update', { Resource: 'WP_DEBUG' }, '<b>WP_DEBUG</b>'],
    ['user.instance.wordpress_config.delete', { Resource: 'WP_DEBUG' }, '<b>WP_DEBUG</b>'],
    ['user.instance.wordpress_user.create', { Resource: { email: 'w@p.test' } }, '<b>w@p.test</b>'],
    ['user.instance.wordpress_user.update', { Resource: { email: 'w@p.test' } }, '<b>w@p.test</b>'],
    ['user.instance.wordpress_user.delete', { Resource: { email: 'w@p.test' } }, '<b>w@p.test</b>'],
    ['user.instance.wordpress_user.reset_password', { Resource: { email: 'w@p.test' } }, '<b>w@p.test</b>'],
    ['user.instance.cloudflare.security.update', { Resource: true }, `activityLog.suffix.toStatus{"status":"${ENABLED}"}`],
    ['user.instance.cloudflare.browser_check.update', { Resource: false }, `activityLog.suffix.toStatus{"status":"${DISABLED}"}`],
    ['user.instance.cloudflare.development_mode.update', { Resource: 'essentially_off' }, 'activityLog.suffix.toStatus{"status":"<b>Essentially_off</b>"}'],
    ['user.instance.edge_cache.update', { Resource: true }, `activityLog.suffix.toStatus{"status":"${ENABLED}"}`],
  ]

  it.each(table)('renders %s', (action, payload, expected) => {
    expect(actionInformation(row(action, payload), t)).toBe(expected)
  })

  it('covers 39 actions', () => {
    expect(table).toHaveLength(39)
  })

  describe('shape guards (D2)', () => {
    it('returns empty string when the payload class is missing', () => {
      expect(actionInformation(row('user.instance.plugin.install', { Other: 1 }), t)).toBe('')
      expect(actionInformation(row('user.instance.plugin.install', null), t)).toBe('')
    })

    it('returns empty string when Resource is not an array for shared_access.delete', () => {
      expect(actionInformation(row('user.instance.shared_access.delete', { Resource: { email: 'x' } }), t)).toBe('')
    })

    it('returns empty string when there is no second Application for staging.create', () => {
      expect(actionInformation(row('user.instance.staging.create', { Application: { domain: 'a.test' } }), t)).toBe('')
    })

    it('returns empty string for a Cloudflare value that is neither bool nor string', () => {
      expect(actionInformation(row('user.instance.edge_cache.update', { Resource: null }), t)).toBe('')
    })
  })

  it('keeps the legacy "[object Object]" in wordpress_config for object resources', () => {
    expect(actionInformation(row('user.instance.wordpress_config.update', { Resource: { a: 1 } }), t))
      .toBe('<b>[object Object]</b>')
  })
})
