import type { Probe } from '../lib/probe'
import type { Handler, ParityState, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { settled, tr } from './auth'
import { framePageMasks, INSTANCE_PAGE_DNS, INSTANCE_PAGE_PRIVILEGES, instancePageRaw, waitForInstanceTitle } from './instance'
import {
  copyServices,
  liteProject,
  liteShellHome,
  openCardDialog,
  openRowMenu,
  PREVIEW_URL,
  shotProject,
  SSO_LEGACY,
  withCopyAllowed,
} from './instances'
import { liteMenuProjects, litePushStaging } from './instances-lite'
import { inDays, NOW, shellHandlers, shellHome } from './shell'

// Shared helpers of the S-70 modal states (`project-actions*.parity.ts`) on the lite target. Not a spec file.

const LEGACY_MENU = '.v-menu__content.menuable__content__active'

/** The lite project set with the plan flag the Copy item reads (row 3 is the WordPress site "WP Blog"). */
export function modalProjects (): Array<Record<string, unknown>> {
  return withCopyAllowed(liteMenuProjects())
}

/** `GET /projects/<id>/wordpress/updates`: the versions the update dialog offers (the first one is preselected). */
export function liteUpdatesHandler (id: number, availableUpdates: string[]): Record<string, Handler> {
  return {
    [`GET /projects/${id}/wordpress/updates`]: { json: { data: { wp_version: '6.4.0', available_updates: availableUpdates } } },
  }
}

/** The single-server `/home` of the lite states (`liteShellHome` of `instances.ts`) with the copy services (arrays replace the base ones). */
export function liteCopyHome (): Record<string, unknown> {
  return shellHome({
    app: { beta_mode: false, single_server: { active: true, has_running_tasks: false, has_uncompleted_imports: false } },
    user: { is_ss_default: true, has_hosting_access: true, services: copyServices },
    admin: { app_url: 'https://admin.example.com' },
  })
}

/**
 * Opens the kebab of row `id` and presses the item `label`; both sides click through `evaluate` (no scroll: V4 locks the page with
 * `html { position: fixed }`). With `waitForModal` it waits for the dialog of the action host (`.v-dialog--active .v-card` /
 * `instances-modal`); legacy never closes the menu, so that side hides it.
 */
export function openProjectAction (id: number, label: string, waitForModal = true): { legacy: StateAction, next: StateAction } {
  const menu = openRowMenu(id)
  return {
    legacy: async page => {
      await menu.legacy(page)
      await page.locator(LEGACY_MENU).getByText(label, { exact: true }).evaluate(element => (element as HTMLElement).click())
      if (waitForModal) {
        await settled(page.locator('.v-dialog--active .v-card').first())
        await page.evaluate(() => {
          for (const element of document.querySelectorAll<HTMLElement>('.menuable__content__active')) {
            element.style.display = 'none'
          }
        })
      }
    },
    next: async page => {
      await menu.next(page)
      await page.getByTestId('instance-item-menu').getByText(label, { exact: true }).evaluate(element => (element as HTMLElement).click())
      if (waitForModal) {
        await settled(page.getByTestId('instances-modal'))
      }
    },
  }
}

/** The lite set with the project "Studio" (4) and its staging sub-row (41) as WordPress sites: push to live offers the database diff. */
export function wordpressPushProjects (): Array<Record<string, unknown>> {
  return withCopyAllowed(liteMenuProjects().map(item => item.id === 4
    ? {
        ...item,
        type: 'wordpress',
        staging_apps: [shotProject(41, 'Studio staging', {
          type: 'wordpress',
          staging: true,
          supports_admin_sso: true,
          parent_app: liteProject(4, { name: 'Studio', type: 'wordpress' }),
        })],
      }
    : item))
}

/**
 * The legacy instance page of the WordPress staging project (`GET /projects/41`) and the diff of the push dialog. The next kebab and
 * the deployed lite read `GET /instances/41/push-to-live` (`OpenModalAction.js:143`).
 */
export function wordpressPushHandlers (diff: Handler): Record<string, Handler> {
  return {
    'GET /projects/41': { json: { data: { ...litePushStaging, type: 'wordpress', parent_app: liteProject(4, { name: 'Studio', type: 'wordpress', supports_admin_sso: true }) } } },
    'GET /projects/41/wordpress/automatic-backup': { json: { data: { enabled: false } } },
    'GET /server-accounts/1/ssl/certificate/detected': { json: { data: null } },
    'GET /projects/41/app-health': { json: { data: { available: false } } },
    'GET /instances/41/push-to-live': diff,
    'GET /projects/41/push-to-live': diff,
  }
}

/**
 * Push to live of staging sub-row 41. Legacy cannot open the dialog from the list (the item is a no-op), so it opens the project page
 * and presses the top bar button; next opens it from the kebab of the sub-row (exception E7). `until` waits for the loading message
 * (`'loading'`) or the first checkbox of the form (`'form'`); the page behind the dialog is hidden on both sides.
 */
export function openProjectPushDialog (until: 'loading' | 'form'): { legacy: StateAction, next: StateAction } {
  const hide = async (page: Page, selector: string) => {
    await page.addStyleTag({ content: `${selector} { display: none !important; }` })
  }
  const ready = (modal: Locator) => until === 'loading'
    ? modal.getByText(tr('heading.instance.pushToLoadingState.messageTitle', 'lite'))
    : modal.locator('.checkbox').first()
  return {
    legacy: async page => {
      await page.locator('a[href="/projects/41/general"]').first().click()
      await page.waitForURL(/\/projects\/41\/general/)
      await page.getByRole('button', { name: tr('button.pushToLive', 'lite') }).locator('visible=true').first().click({ timeout: 15_000 })
      await settled(ready(page.locator('.v-dialog--active .v-card')))
      await hide(page, '.v-application--wrap')
    },
    next: async page => {
      await openRowMenu(41).next(page)
      await page.getByTestId('instance-item-menu').getByText(tr('button.pushToLive', 'lite'), { exact: true }).evaluate(element => (element as HTMLElement).click())
      await settled(ready(page.getByTestId('instances-modal')))
      await hide(page, '.v-application__wrap')
    },
  }
}

/** The lite set with the Create staging settings of project `id` (`plan_settings` / `server_settings` replace the item's own). */
export function stagingProjects (
  id: number,
  settings: { plan?: Record<string, unknown>, server?: Record<string, unknown> } = {},
): Array<Record<string, unknown>> {
  return modalProjects().map(item => item.id === id
    ? {
        ...item,
        plan_settings: { copy_instance_allowed: true, domain_for_staging: { type: 'same_domain' }, ...settings.plan },
        server_settings: { uses_own_backup_system: false, ...settings.server },
      }
    : item)
}

/** `GET /projects/<id>/staging/pre-check-disk-usage` (the deployed lite is newer than its source, which reads `/instances/<id>/...`; next follows the deploy): room for everything, or (`low`) too little. */
export function stagingUsage (id: number, low = false): Record<string, Handler> {
  const GB = 1024 ** 3
  const MB = 1024 ** 2
  return {
    [`GET /projects/${id}/staging/pre-check-disk-usage`]: {
      json: {
        data: {
          account_usage: low ? 800 * MB : 2 * GB,
          account_limit: low ? GB : 10 * GB,
          wordpress_dir_usage: 500 * MB,
          uploads_dir_usage: 300 * MB,
          wordpress_db_usage: 50 * MB,
        },
      },
    },
  }
}

/**
 * Opens the kebab of project `id`, presses Staging and waits for an element of the dialog (`ready`, a selector inside the card on each
 * side). Both sides click through `evaluate` (no scroll); legacy keeps the menu under the scrim, so that side hides it.
 */
export function openProjectStaging (id: number, ready: { legacy: string, next: string }): { legacy: StateAction, next: StateAction } {
  const menu = openRowMenu(id)
  const label = tr('button.staging', 'lite')
  return {
    legacy: async page => {
      await menu.legacy(page)
      await page.locator(LEGACY_MENU).getByText(label, { exact: true }).evaluate(element => (element as HTMLElement).click())
      await settled(page.locator(`${SSO_LEGACY} ${ready.legacy}`).first())
      await page.evaluate(() => {
        for (const element of document.querySelectorAll<HTMLElement>('.menuable__content__active')) {
          element.style.display = 'none'
        }
      })
    },
    next: async page => {
      await menu.next(page)
      await page.getByTestId('instance-item-menu').getByText(label, { exact: true }).evaluate(element => (element as HTMLElement).click())
      await settled(page.getByTestId('staging-modal').locator(ready.next).first())
    },
  }
}

/**
 * The kebab "Admin Area" of project `id` (lite: one item for WP Admin and Log In) and the wait for the SSO dialog (`ready` is a selector
 * inside the card on each side). Both sides click through `evaluate` (no scroll); legacy keeps the menu open, so that side hides it.
 * With `ready: null` it only presses the item (the dialog states of a held request wait for the loader themselves).
 */
export function openProjectSso (id: number, ready: { legacy: string, next: string } | null): { legacy: StateAction, next: StateAction } {
  const menu = openRowMenu(id)
  const label = tr('button.adminArea', 'lite')
  return {
    legacy: async page => {
      await menu.legacy(page)
      await page.locator(LEGACY_MENU).getByText(label, { exact: true }).evaluate(element => (element as HTMLElement).click())
      if (ready) {
        await settled(page.locator(`${SSO_LEGACY} ${ready.legacy}`).first())
      }
      await page.evaluate(() => {
        for (const element of document.querySelectorAll<HTMLElement>('.menuable__content__active')) {
          element.style.display = 'none'
        }
      })
    },
    next: async page => {
      await menu.next(page)
      // Next says "WP Admin" for a WordPress project: the item is found by its testid.
      await page.getByTestId('instance-item-menu').getByTestId('instance-menu-admin-area').first().evaluate(element => (element as HTMLElement).click())
      if (ready) {
        await settled(page.getByTestId('sso-modal').locator(ready.next).first())
      }
    },
  }
}

/** Labels (S-70 phase 11): `Acme Blog` has no labels ("Add tags"), `Client Site` has two (the `+` button). Both have a screenshot: an open menu next to a card without one flaps. */
export const labelProjects = [
  shotProject(1, 'Acme Blog'),
  shotProject(2, 'Client Site', { labels: [{ title: 'Production', color: '#07C07E' }, { title: 'Client', color: '#2F80ED' }] }),
]

/** The chips of the labels (S-70 phase 11): the first chip of the open Assign panel and its remove button, and the first chip on card 2. */
export const labelChipProbes: Probe[] = [
  {
    key: 'label-chip',
    legacy: page => page.locator('.assign-existing-label .label-chip').first(),
    next: page => page.getByTestId('label-assign').locator('.label-chip').first(),
  },
  {
    key: 'label-chip-remove',
    legacy: page => page.locator('.assign-existing-label .label-chip .v-btn').first(),
    next: page => page.getByTestId('label-assign').locator('.label-chip .v-btn').first(),
  },
  {
    key: 'label-card-chip',
    legacy: page => page.locator('.data-iterator-card').nth(1).locator('.label-chip').first(),
    next: page => page.getByTestId('instance-card').nth(1).locator('.label-chip').first(),
  },
]

/** Project 1 for the preview states: a custom project on a host that is not `panelalpha.online`, so "Open Project" opens the preview modal. */
export const previewProjects = [shotProject(1, 'Acme Blog', { url: 'https://acme-blog.example.com', domain: 'acme-blog.example.com' })]

/**
 * `POST /projects/1/preview`: the whole project with its `preview_site` (the API answers the instance resource; the deployed list replaces
 * the card's item with it, so a partial answer would drop the screenshot and the card would load the slow "not available" logo).
 */
export const litePreviewHandlers: Record<string, Handler> = {
  'POST /projects/1/preview': { json: { data: { ...previewProjects[0], preview_site: { url: PREVIEW_URL, valid_until: inDays(1) } } } },
}

/**
 * After the temporary URL the deployed list loads a slow image (the 17 KB panel logo of the card fallback takes about 4 s from the
 * deploy, longer than the 5 s capture poll leaves after the dialog settles): wait for the network to go quiet on both sides.
 */
export const waitForNetworkIdle: StateAction = async page => {
  await page.waitForLoadState('networkidle')
}

/** Hovers the card of project 0 and presses "Open Project" of its overlay (single server): the host opens the preview modal. */
export const openPreviewModal = openCardDialog(tr('button.openProject', 'lite'), 'preview-site-modal')

/** The lite `/home` of the collaborate states: the Atarim integration is on (the chip needs it). */
export function liteCollaborateHome (): Record<string, unknown> {
  return shellHome({
    app: {
      beta_mode: false,
      single_server: { active: true, has_running_tasks: false, has_uncompleted_imports: false },
      integrations: { atarim_enabled: true },
    },
    user: { is_ss_default: true, has_hosting_access: true },
    admin: { app_url: 'https://admin.example.com' },
  })
}

/**
 * Deploy issues of project 1 (S-70 phase 13). The list no longer carries them: the card's `StatusIndicator` collects WordPress and
 * backup issues only (LITE `collectInstanceIssues.js:26-75`), and the deploy issues of a custom project come from
 * `GET /projects/1/app-health` into the status alert of the instance page (`InstanceStatusTabAlert`, S-71). The probe says the domain
 * root serves no page (a missing index file) and nothing answers on the routed port.
 */
const APP_HEALTH_ISSUES = {
  available: true,
  healthy: false,
  serving: 'missing_entry',
  ports: [{ port: 3000, status: 'refused' }],
  checks: [{ id: 'entry-served', title: 'No index file', detail: 'The domain root serves no page.' }],
}

/** The instance page (`/projects/1/general`, a custom project of the owner) whose status alert lists the two deploy issues. */
export function issuePageState (handlers: Record<string, Handler> = {}): Omit<ParityState, 'id' | 'probes'> {
  return {
    path: '/projects/1/general',
    target: 'lite',
    signedIn: true,
    clock: NOW,
    home: liteShellHome(),
    handlers: {
      ...shellHandlers([], 'projects'),
      'GET /projects/1': {
        json: {
          data: instancePageRaw(1, {
            name: 'Studio Blog',
            url: 'https://studio.example.com',
            app_type: 'custom',
            privileges: [...INSTANCE_PAGE_PRIVILEGES, 'general.redeploy', 'general.manage_users'],
          }),
        },
      },
      'GET /projects/1/app-health': { json: { data: APP_HEALTH_ISSUES } },
      'GET /projects/1/wordpress/maintenance-mode': { json: { status: false } },
      'GET /projects/1/wordpress/debug-mode': { json: { status: false } },
      'GET /projects/1/wordpress/automatic-backup': { json: { data: { enabled: false } } },
      'GET /server-accounts/1/ssl/certificate/detected': { json: { data: null } },
      'GET /projects/1/reporting/visitors/last-week': {
        json: { data: { visits: { records: [], total: 0, previous_total: 0 }, visits_length: { records: [], total: 0, previous_total: 0 } } },
      },
      'GET /projects/1/reporting/bandwidth/last-week': { json: { data: { records: [], total: 0 } } },
      ...handlers,
    },
    external: { 'dns.google': INSTANCE_PAGE_DNS },
    actions: waitForInstanceTitle,
    masks: framePageMasks,
    viewportOnly: true,
  }
}

/** Hovers the status alert chip next to Site details and waits for the issue menu; `issue` presses the Resolve button of that issue. */
export function openTabIssue (issue: number | null): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      await page.locator('.instance-status-tab-alert .v-chip').first().hover()
      await settled(page.locator('.v-menu__content.menuable__content__active .status-list__issue-action').first())
      if (issue !== null) {
        await page.locator('.v-menu__content.menuable__content__active .status-list__issue-action').nth(issue).click()
        await settled(page.locator('.v-dialog--active .basic-modal'))
      }
    },
    next: async page => {
      await page.getByTestId('instance-status-tab-alert').hover()
      await settled(page.locator('.v-overlay--active .status-list__issue-action').first())
      if (issue !== null) {
        await page.locator('.v-overlay--active .status-list__issue-action').nth(issue).click()
        await settled(page.getByTestId('issue-resolve-modal'))
      }
    },
  }
}

/** A failed upload / redeploy keeps the dialog open and the shell shows the error; the pointer stays over the alert (it closes by itself). */
export const afterResolveAlert: ParityState['afterCapture'] = {
  legacy: [async page => {
    await expect(page.locator('.alert-manager .alert--error'), 'Harness error: legacy error alert closed during capture').toBeVisible()
  }],
  next: [async page => {
    await expect(page.locator('.alert-manager .alert--error'), 'Harness error: next error alert closed during capture').toBeVisible()
  }],
}

/** The status alert chip and the open issue menu of the instance page. */
export const tabIssueProbes: Probe[] = [
  {
    key: 'status-tab-alert',
    legacy: page => page.locator('.instance-status-tab-alert .v-chip').first(),
    next: page => page.getByTestId('instance-status-tab-alert'),
  },
  {
    key: 'issue-menu',
    legacy: page => page.locator('.v-menu__content.menuable__content__active .status-list'),
    next: page => page.locator('.v-overlay--active .status-list'),
    internal: true,
  },
]
