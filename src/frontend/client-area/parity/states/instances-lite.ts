import type { Handler, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { settled, tr } from './auth'
import { aRecordAnswer, DNS_SETTINGS, liteProject, openRowMenu, shotProject, SSO_LEGACY } from './instances'

// app-lite kebab, AppSsoModal and the custom staging / push variants (S-09b Phase 7), all on the lite target. Not a spec file.

/** The users of `GET /projects/<id>/users` (`AppSsoModal`): the label is `email ?? username ?? id`. */
export const liteAppUsers = [
  { id: 1, email: 'ann@example.com', username: 'ann' },
  { id: 2, email: null, username: 'bob' },
]

/** `GET /projects/<id>/users`: the users `AppSsoModal` offers. */
export function liteAppUsersHandler (id: number, users: Array<Record<string, unknown>>): Record<string, Handler> {
  return { [`GET /projects/${id}/users`]: { json: { data: users } } }
}

/** `GET /projects/<id>/wordpress/users?role=administrator&for_sso=1`: the administrators `WpAdminSsoModal` offers. */
export function liteWpUsersHandler (id: number, users: Array<Record<string, unknown>>): Record<string, Handler> {
  return { [`GET /projects/${id}/wordpress/users`]: { json: { data: users } } }
}

/** The deployed lite shows its SSO kebab item only for projects with `supports_admin_sso` (next reads it since ui-project-list-actions phase 2). */
const admin = { supports_admin_sso: true }

/** Two custom projects, a WordPress site and a project with a staging sub-row (41), each with a screenshot. */
export function liteMenuProjects (): Array<Record<string, unknown>> {
  return [
    shotProject(1, 'Node API', admin),
    shotProject(2, 'Static Site', admin),
    shotProject(3, 'WP Blog', { type: 'wordpress', ...admin }),
    shotProject(4, 'Studio', {
      ...admin,
      staging_apps: [shotProject(41, 'Studio staging', { staging: true, parent_app: liteProject(4, { name: 'Studio' }) })],
    }),
  ]
}

/** The same set with the url of project `id` an IP: neither app runs the DNS check for it, so no mismatch warning. */
export function liteIpProjects (id: number): Array<Record<string, unknown>> {
  return liteMenuProjects().map(item => item.id === id ? { ...item, url: 'https://203.0.113.20' } : item)
}

/**
 * Opens the kebab of row `id`, picks the SSO item and waits for the dialog (`ready` is a selector inside the card). The deployed
 * app-lite is newer than its pinned source: its kebab has a single "Admin Area" item (custom: `AppSsoModal`, WordPress:
 * `WpAdminSsoModal`) for a project with `supports_admin_sso`, and the card overlay's "Open Project" opens the project url. The source
 * has the "WP Admin" / "Log In" items; next follows the deploy since ui-project-list-actions phase 2 (`nextLabel` is "Admin Area" too, and so is the dialog title).
 */
export function openLiteKebabSso (id: number, nextLabel: string, ready: { legacy: string, next: string }): { legacy: StateAction, next: StateAction } {
  const menu = openRowMenu(id)
  return {
    legacy: async page => {
      await menu.legacy(page)
      await page.locator('.v-menu__content.menuable__content__active').getByText(tr('button.adminArea', 'lite'), { exact: true }).click()
      await settled(page.locator(`${SSO_LEGACY} ${ready.legacy}`).first())
      await page.evaluate(() => {
        for (const element of document.querySelectorAll<HTMLElement>('.menuable__content__active')) {
          element.style.display = 'none'
        }
      })
    },
    next: async page => {
      await menu.next(page)
      await page.getByTestId('instance-item-menu').getByText(nextLabel, { exact: true }).click()
      await settled(page.getByTestId('sso-modal').locator(ready.next).first())
    },
  }
}

/**
 * A custom project's staging instance (id 41, parent 4). The legacy lite instance page maps the parent too, so it carries the full item.
 */
export const litePushStaging = shotProject(41, 'Studio staging', {
  ...admin,
  staging: true,
  url: 'https://staging.studio.example.com',
  domain: 'staging.studio.example.com',
  parent_app: liteProject(4, { name: 'Studio', ...admin }),
})

/** `GET /projects/41` (the legacy instance page of the staging project). No `push-to-live` request exists for a custom project. */
export const litePushHandlers: Record<string, Handler> = {
  'GET /projects/41': { json: { data: litePushStaging } },
  // The legacy instance page reads the automatic backup flag and the detected certificate of the hosting account.
  'GET /projects/41/wordpress/automatic-backup': { json: { data: { enabled: false } } },
  'GET /server-accounts/1/ssl/certificate/detected': { json: { data: null } },
  // The deployed lite (newer than the kit pin) asks the instance tab alert for the app health; unavailable gives no deploy issues.
  'GET /projects/41/app-health': { json: { data: { available: false } } },
}

/**
 * Push to live of the custom staging project. As in the app (Phase 3), legacy cannot open the dialog from the list (the item is a
 * no-op): it opens `/projects/41/general` and clicks the top bar button; next opens it from the kebab of the staging sub-row (E7).
 * A custom project has no diff request and no loading state, so both dialogs show at once.
 */
export function openLitePushDialog (): { legacy: StateAction, next: StateAction } {
  const hide = async (page: Page, selector: string) => {
    await page.addStyleTag({ content: `${selector} { display: none !important; }` })
  }
  const ready = (modal: Locator) => modal.locator('.checkbox').first()
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
      await page.getByTestId('instance-item-menu').getByText(tr('button.pushToLive', 'lite'), { exact: true }).click()
      await settled(ready(page.getByTestId('instances-modal')))
      await hide(page, '.v-application__wrap')
    },
  }
}

// S-09c phase 4: the DNS / SSL indicator of app-lite (`/projects`, single server). Card 1 is a WordPress site with no IP in its URL.

/** The lite card whose DNS check fails (no record, DNS alerts on): the alert menu and the Fix DNS dialog with the single-server box. */
export const liteDnsItem = shotProject(1, 'WP Blog', { type: 'wordpress', dns_settings: DNS_SETTINGS })

/** The IP the SSL order's host answers on: the A record `dns.google` returns matches it, so the card's DNS check passes. */
export const LITE_SSL_IP = '203.0.113.20'

/** A WordPress site with an SSL order in `status` (`ssl_order_status`): the DNS check passes, so the order shows in the indicator. */
export function liteSslOrderItem (status: 'pending' | 'failed'): Record<string, unknown> {
  return shotProject(1, 'WP Blog', {
    type: 'wordpress',
    dns_settings: DNS_SETTINGS,
    host_ip_address: LITE_SSL_IP,
    host_ipv4_addresses: [LITE_SSL_IP],
    ssl_order_status: status,
  })
}

export const liteSslOrderExternal = { 'dns.google': aRecordAnswer(LITE_SSL_IP) }
