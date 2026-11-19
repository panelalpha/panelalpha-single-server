import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The keys of the reseller frame and of the Users, Branding (with the CopyRecordItem kit) and Logs pages (as the code passes them to `t(...)`) must exist in the app and lite fixtures
// (the page is in both sources). Keys with a count (`count`) are in the fixtures as `_one` / `_other`; then one
// of the forms is enough.

const here = dirname(fileURLToPath(import.meta.url))
// From src/views/reseller to the package root: 3 levels up.
const fixtureRoot = join(here, '../../../parity/fixtures')

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

const PAGE_KEYS = [
  'heading.navbar.tab.resellerArea',
  'heading.reseller.page.users',
  'heading.reseller.page.branding',
  'heading.reseller.page.emailSettings',
  'heading.reseller.page.logs',
  'heading.reseller.page.api',
  'heading.instance.advanced.users.modal.delete.title',
  'heading.instance.advanced.users.modal.delete.message',
  'table.header.user',
  'table.header.email',
  'table.header.instances',
  'table.header.actions',
  'table.header.instance',
  'table.header.date',
  'table.footer.log',
  'form.placeholder.search',
  'message.emptyTable.instances.filter.title',
  'reseller.logs.noLogs',
  'reseller.logs.noLogsDesc',
  'reseller.user.sharedInstances',
  'reseller.user.created',
  'reseller.user.fullList',
  'button.deleteUser',
  'button.delete',
  'button.cancel',
  'button.clearFilter',
  'message.confirmAction',
  'message.status.suspended',
  'form.confirmDelete.user',
  'general.notSet',
  'tooltip.hosting.service.suspended',
  'heading.reseller.page.dnsrecord',
  'button.branding.manage',
  'button.saveChanges',
  'reseller.brandName',
  'reseller.brandName.placeholder',
  'reseller.domain',
  'reseller.domain.placeholder',
  'reseller.domain.dnsSetupInfo1',
  'reseller.domain.dnsSetupInfo2',
  'general.name',
  'general.type',
  'general.address',
  'tooltip.copy',
  'tooltip.copied',
  'message.alertManager.success',
]

// Keys of the API page, besides those already in `PAGE_KEYS` (that also holds `tooltip.copy` and `tooltip.copied` from Branding). Without the unused `reseller.apiTokens.{confirmDelete,documentationAt}`.
const API_PAGE_KEYS = [
  'reseller.apiTokens.name',
  'reseller.apiTokens.content',
  'reseller.apiTokens.savedToken',
  'reseller.apiTokens.removeToken',
  'reseller.apiTokens.noTokens',
  'reseller.apiTokens.noTokensDesc',
  'reseller.apiTokens.delete',
  'reseller.apiTokens.modal.create.title',
  'reseller.apiTokens.modal.created',
  'reseller.apiTokens.modal.delete.title',
  'button.apiToken.create',
  'button.create',
  'button.continue',
  'message.confirmBeforeProceedingAction',
  'table.header.name',
  'table.header.last_used_at',
  'table.header.created_at',
  'table.footer.items',
  'general.never',
]

describe('reseller users, branding, logs and api i18n keys', () => {
  it('lists each key used by the frame and page without duplicates', () => {
    expect(new Set([...PAGE_KEYS, ...API_PAGE_KEYS]).size).toBe(PAGE_KEYS.length + API_PAGE_KEYS.length)
  })

  describe.each(['app', 'lite'] as const)('%s fixture', target => {
    it.each([...PAGE_KEYS, ...API_PAGE_KEYS])('%s exists', key => {
      expect(hasKey(fixtures[target], key)).toBe(true)
    })
  })
})
