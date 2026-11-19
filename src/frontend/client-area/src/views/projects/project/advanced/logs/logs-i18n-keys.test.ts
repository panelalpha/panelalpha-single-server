import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The keys of the instance Logs page must exist in the app fixture.
// The `deployLogs.*` keys (Deploy tab, app-lite only) must exist in the lite fixture.
// Keys with a count (`count`) are `_one` / `_other` in the fixtures; one of the forms is enough then.

const here = dirname(fileURLToPath(import.meta.url))
// From src/views/projects/project/advanced/logs up to the package root (6 levels).
const fixtureRoot = join(here, '../../../../../../parity/fixtures')

type Flat = Record<string, string>

function flatten (node: unknown, prefix = '', out: Flat = {}): Flat {
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out)
    }
  } else if (prefix) {
    out[prefix] = String(node)
  }
  return out
}

const load = (file: string): Flat => flatten(JSON.parse(readFileSync(join(fixtureRoot, file), 'utf8')))

const fixtures = {
  app: load('translation.en.json'),
  lite: load('lite/translation.en.json'),
}

const hasKey = (flat: Flat, key: string) => key in flat || `${key}_one` in flat || `${key}_other` in flat

/** Activity log actions (`user.instance.*`) used by `actionInformation` in `instance-log.ts`. */
const LOG_ACTIONS = [
  'user.instance.shared_access.resend_access',
  'user.instance.shared_access.create',
  'user.instance.shared_access.update',
  'user.instance.shared_access.delete',
  'user.instance.backup.update_automatic',
  'user.instance.backup.restore',
  'user.instance.backup.delete',
  'user.instance.assign_label',
  'user.instance.unassign_label',
  'user.instance.domain.change_to_own_domain',
  'user.instance.domain.change_to_subdomain',
  'user.instance.staging.show_push_to_live',
  'user.instance.staging.create',
  'user.instance.staging.retry_install',
  'user.instance.wordpress.update',
  'user.instance.auto_update.update',
  'user.instance.update_site_name',
  'user.instance.maintenance_mode.update',
  'user.instance.debug_mode.update',
  'user.instance.theme.activate',
  'user.instance.theme.update',
  'user.instance.theme.delete',
  'user.instance.theme.install',
  'user.instance.plugin.activate',
  'user.instance.plugin.deactivate',
  'user.instance.plugin.update',
  'user.instance.plugin.delete',
  'user.instance.plugin.install',
  'user.instance.wordpress_config.create',
  'user.instance.wordpress_config.update',
  'user.instance.wordpress_config.delete',
  'user.instance.wordpress_user.create',
  'user.instance.wordpress_user.update',
  'user.instance.wordpress_user.delete',
  'user.instance.wordpress_user.reset_password',
  'user.instance.cloudflare.security.update',
  'user.instance.cloudflare.browser_check.update',
  'user.instance.cloudflare.development_mode.update',
  'user.instance.edge_cache.update',
]

/** Keys of the Logs screen (app), as the code passes them to `t(...)`. */
const PAGE_KEYS = [
  'heading.instance.advanced.logs.instanceLogs.title',
  'heading.instance.advanced.logs.wordpressLogs.title',
  'heading.instance.advanced.logs.phpLogs.title',
  'heading.instance.advanced.logs.phpLogs.tooltip',
  'heading.instance.advanced.logs.webserverLogs.title',
  'heading.instance.advanced.logs.loader',
  'notification.instance.advanced.logs.maxEntries',
  'message.emptyTable.wpErrorLogs.title',
  'message.emptyTable.wpErrorLogs.description',
  'message.emptyTable.phpLogs.title',
  'message.emptyTable.phpLogs.description',
  'message.emptyTable.webserverLogs.title',
  'message.emptyTable.webserverLogs.description',
  'message.emptyTable.webserverLogs.downloadTitle',
  'message.emptyTable.webserverLogs.downloadDescription',
  'message.emptyTable.instances.filter.title',
  'table.footer.log',
  'table.header.user',
  'table.header.actions',
  'table.header.date',
  'form.placeholder.search',
  'general.owner',
  'button.download',
  'activityLog.suffix.toStatus',
  'activityLog.suffix.toRole',
  'activityLog.suffix.wordpressStatus',
  'activityLog.suffix.pluginStatus',
  'activityLog.suffix.themeStatus',
  'message.status.enabled',
  'message.status.disabled',
  ...LOG_ACTIONS.map(action => `activityLog.action.${action}`),
]

/**
 * Known gap in the app fixture: `activityLog.action.user.instance.staging.show_push_to_live` is missing
 * in `parity/fixtures/translation.en.json` (the `actionName` code then shows the raw key, as legacy does).
 * The key is not added to the fixture (fixtures are not edited here); the test skips it.
 */
const KNOWN_MISSING_APP = new Set([
  'activityLog.action.user.instance.staging.show_push_to_live',
])

/** Keys of the Deploy tab (app-lite, `custom`). */
const LITE_DEPLOY_KEYS = [
  'deployLogs.title',
  'deployLogs.live',
  'deployLogs.noDeploys',
  'deployLogs.noDeploysSubtitle',
  'deployLogs.noLines',
]

describe('logs page i18n keys', () => {
  it('lists 39 log actions without duplicates', () => {
    expect(LOG_ACTIONS).toHaveLength(39)
    expect(new Set(LOG_ACTIONS).size).toBe(LOG_ACTIONS.length)
  })

  it('lists each key used by the page without duplicates', () => {
    expect(new Set(PAGE_KEYS).size).toBe(PAGE_KEYS.length)
  })

  it.each(PAGE_KEYS.filter(key => !KNOWN_MISSING_APP.has(key)))('%s exists in the app fixture', key => {
    expect(hasKey(fixtures.app, key)).toBe(true)
  })

  it.each(LITE_DEPLOY_KEYS)('%s exists in the lite fixture', key => {
    expect(hasKey(fixtures.lite, key)).toBe(true)
  })
})
