import type { Handler, Probe, StateAction } from './state'
import type { Page } from '@playwright/test'
import { settled } from './auth'
import { allHostingPrivileges, hostingService, waitFor } from './hosting'
import { ADVANCED_PRIVILEGES, ADVANCED_PROJECT_ID, advancedActiveItemProbe, advancedFrameHandlers, advancedInstance } from './instance-advanced-frame'
import { isDesktop } from './shell'

// S-41 hosting-containers / S-110 ui-containers: the probes, fixtures, builders and the shared steps of the Containers page, measured on
// app-lite (`target: 'lite'`) in two frames: `/hosting/containers` (My server, `hosting-containers.parity.ts`) and the Advanced tab of a
// project (`/projects/:id/advanced/containers`, `instance-advanced-containers.parity.ts`). The module is not a spec (`testMatch` is
// `*.parity.ts`), so both specs import it. Plan: context/changes/ui-containers/plan.md ("Phase 10").

// ---------------------------------------------------------------------------------------------
// Probes (legacy views/hosting/Containers.vue, next views/hosting/containers/ContainersView.vue)
// ---------------------------------------------------------------------------------------------

export const containersTitleProbe: Probe = {
  key: 'containers-title',
  legacy: page => page.locator('.v-main .title-row h4'),
  next: page => page.getByTestId('containers-title'),
}

export const containersTitleRowProbe: Probe = {
  key: 'containers-title-row',
  legacy: page => page.locator('.v-main .title-row').first(),
  next: page => page.locator('.title-row').first(),
}

export const containersRefreshProbe: Probe = {
  key: 'containers-refresh',
  legacy: page => page.locator('.v-main .title-row .v-btn').first(),
  next: page => page.getByTestId('containers-refresh'),
}

export const containersPortChipProbe: Probe = {
  key: 'containers-port-chip',
  legacy: page => page.locator('.v-main .v-data-table tbody tr').first().locator('td').nth(4).locator('.v-chip').first(),
  next: page => page.getByTestId('containers-table').first().locator('tbody tr').first().locator('td').nth(4).locator('.v-chip').first(),
}

export const containersGroupProbe: Probe = {
  key: 'containers-group',
  legacy: page => page.locator('.v-main div.mb-6').first(),
  next: page => page.getByTestId('containers-group').first(),
}

export const containersTableProbe: Probe = {
  key: 'containers-table',
  legacy: page => page.locator('.v-main .v-data-table').first(),
  next: page => page.getByTestId('containers-table').first(),
}

export const containersRowProbe: Probe = {
  key: 'containers-row',
  legacy: page => page.locator('.v-main .v-data-table').first().locator('tbody tr').first(),
  next: page => page.getByTestId('containers-table').first().locator('tbody tr').first(),
}

export const containersPortsProbe: Probe = {
  key: 'containers-ports',
  legacy: page => page.locator('.v-main .v-data-table').first().locator('tbody tr').first().locator('td').nth(4),
  next: page => page.getByTestId('containers-table').first().locator('tbody tr').first().locator('td').nth(4),
}

export const containersSpinnerProbe: Probe = {
  key: 'containers-spinner',
  legacy: page => page.locator('.v-main .py-12 > .v-progress-circular'),
  next: page => page.locator('.v-main .py-12 > .v-progress-circular'),
}

export const cardProbes: Probe[] = [containersTitleProbe, containersTitleRowProbe, containersRefreshProbe, containersGroupProbe, containersTableProbe, containersRowProbe, containersPortsProbe, containersPortChipProbe]

// Project frame (`LITE/views/instance/advanced/Containers.vue`): no title row and no group header, the header is `.page-title--advanced`
// and the card is `.data-table` (next `containers-card`). The Actions button is the shared `QuickActionsButton` (`containers-actions`).

const projectHeader = '.advanced-hosting-page .page-title--advanced'

export const containersProjectTitleProbe: Probe = {
  key: 'containers-title',
  legacy: page => page.locator(`${projectHeader} h4`),
  next: page => page.getByTestId('containers-title'),
}

export const containersProjectRefreshProbe: Probe = {
  key: 'containers-refresh',
  legacy: page => page.locator(`${projectHeader} .page-title__filter-controls .v-btn`).first(),
  next: page => page.getByTestId('containers-refresh'),
}

/** The label of the project Refresh button (desktop; on mobile the icon alone). */
export const containersProjectRefreshLabelProbe: Probe = {
  key: 'containers-refresh-label',
  legacy: page => page.locator(`${projectHeader} .page-title__filter-controls .v-btn`).first().locator('span').filter({ hasText: 'Refresh' }).last(),
  next: page => page.getByTestId('containers-refresh').locator('span').filter({ hasText: 'Refresh' }).last(),
  when: isDesktop,
}

/** The icon of the project Refresh button (`$restore`, inherits the button colour). */
export const containersProjectRefreshIconProbe: Probe = {
  key: 'containers-refresh-icon',
  legacy: page => page.locator(`${projectHeader} .page-title__filter-controls .v-btn`).first().locator('.v-icon').first(),
  next: page => page.getByTestId('containers-refresh').locator('.v-icon').first(),
}

export const containersProjectActionsProbe: Probe = {
  key: 'containers-actions',
  legacy: page => page.locator(`${projectHeader} .page-title__filter-controls .page-title__add-button`),
  next: page => page.getByTestId('containers-actions-button'),
}

/** The label span of the Actions button (desktop). */
export const containersProjectActionsLabelProbe: Probe = {
  key: 'containers-actions-label',
  legacy: page => page.locator(`${projectHeader} .page-title__add-button span`).filter({ hasText: 'Actions' }).last(),
  next: page => page.getByTestId('containers-actions-button').locator('span').filter({ hasText: 'Actions' }).last(),
  when: isDesktop,
}

/** The chevron icon of the Actions button (desktop). */
export const containersProjectActionsChevronProbe: Probe = {
  key: 'containers-actions-chevron',
  legacy: page => page.locator(`${projectHeader} .page-title__add-button .v-icon`).first(),
  next: page => page.getByTestId('containers-actions-button').locator('.v-icon').first(),
  when: isDesktop,
}

/** The loader of the Actions button while a project action runs (`.v-progress-circular` in both apps; Phase 13). */
export const containersProjectActionsLoaderProbe: Probe = {
  key: 'containers-actions-loader',
  legacy: page => page.locator(`${projectHeader} .page-title__add-button .v-progress-circular`),
  next: page => page.getByTestId('containers-actions-button').locator('.v-progress-circular'),
  internal: true,
}

/** One icon button of the first row's actions cell (0 start, 1 stop, 2 restart, 3 logs): disabled while a project action runs (Phase 13). */
export function containersRowActionProbe (index: number): Probe {
  return {
    key: `containers-row-action-${index}`,
    legacy: page => page.locator('.v-main .v-data-table').first().locator('tbody tr').first().locator('td').last().locator('button').nth(index),
    next: page => page.getByTestId('containers-table').first().locator('tbody tr').first().locator('td').last().locator('button').nth(index),
  }
}

/** The hover overlay of the Actions button (`.v-btn__overlay` in V4, the button's `::before` in V2). */
export const containersProjectActionsOverlayProbe: Probe = {
  key: 'containers-actions-overlay',
  legacy: containersProjectActionsProbe.legacy,
  next: page => containersProjectActionsProbe.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/** The open Actions menu: the teleported overlay content (next by the `containers-actions-menu` test id, 292 px wide). */
export const containersProjectActionsMenuProbe: Probe = {
  key: 'containers-actions-menu',
  legacy: page => page.locator('.menuable__content__active'),
  next: page => page.getByTestId('containers-actions-menu'),
}

/** One item of the open Actions menu in the project's order: up, restart, stop, pull, down (`index` 0 to 4). */
export function containersProjectActionsItemProbe (index: number): Probe {
  return {
    key: `containers-actions-item-${index}`,
    legacy: page => page.locator('.menuable__content__active .v-list-item').nth(index),
    next: page => page.getByTestId('containers-actions-item').nth(index),
  }
}

/** The icon of one item of the open Actions menu (the Down icon carries the error colour). */
export function containersProjectActionsIconProbe (index: number): Probe {
  return {
    key: `containers-actions-icon-${index}`,
    legacy: page => page.locator('.menuable__content__active .v-list-item').nth(index).locator('.v-icon').first(),
    next: page => page.getByTestId('containers-actions-item').nth(index).locator('.v-icon').first(),
  }
}

/** The clickable wrapper of the first Ports chip: the chip ignores the pointer, the wrapper takes the hover and the click. */
export const containersPortWrapperProbe: Probe = {
  key: 'containers-port-wrapper',
  legacy: page => containersPortChipProbe.legacy(page).locator('xpath=..'),
  next: page => containersPortChipProbe.next(page).locator('xpath=..'),
}

export const containersProjectCardProbe: Probe = {
  key: 'containers-card',
  legacy: page => page.locator('.v-main .data-table'),
  next: page => page.getByTestId('containers-card'),
}

/** The first header cell of the table (`text-transform`, `font-weight`, padding of the column header). */
export const containersProjectHeaderCellProbe: Probe = {
  key: 'containers-column-header',
  legacy: page => page.locator('.containers-table th').first(),
  next: page => page.getByTestId('containers-table').locator('th').first(),
}

export const containersProjectTableProbe: Probe = {
  key: 'containers-table',
  legacy: page => page.locator('.v-main .v-data-table.containers-table'),
  next: page => page.getByTestId('containers-table').first(),
}

/** The no-data text of the project table without a group (`no-data` slot in both apps; Phase 14). */
export const containersProjectEmptyProbe: Probe = {
  key: 'containers-no-data',
  legacy: page => page.locator('.v-main .v-data-table.containers-table .text-center'),
  next: page => page.getByTestId('containers-table').locator('.text-center'),
}

// ---------------------------------------------------------------------------------------------
// Fixtures (the contract of `LAPI/app/Http/Controllers/User/ServiceContainerController.php`)
// ---------------------------------------------------------------------------------------------

export const exampleAccount = { id: 11, username: 'example', domain: 'example.com' }

export function containerRow (overrides: Record<string, string> = {}) {
  return {
    Service: 'web',
    Image: 'nginx:1.27',
    State: 'running',
    Status: 'Up 2 hours',
    Ports: '0.0.0.0:8080->80/tcp, :::8080->80/tcp',
    ...overrides,
  }
}

export function containerGroup (containers: unknown[], account: Record<string, unknown> = exampleAccount) {
  return { account, containers }
}

export function containersBody (groups: unknown[]) {
  return { data: groups }
}

/** One container of each Ports kind: public (`web`), loopback (`db`), sensitive and range (`worker`). */
export const baseContainers = [
  containerRow(),
  containerRow({ Service: 'db', Image: 'postgres:16', State: 'exited', Status: 'Exited (0) 5 minutes ago', Ports: '127.0.0.1:5432->5432/tcp' }),
  containerRow({ Service: 'worker', Image: 'worker:latest', State: 'restarting', Status: 'Restarting (1) 3 seconds ago', Ports: '0.0.0.0:3306->3306/tcp, 9000-9002/tcp' }),
]

// The service has the containers and proxy routing privileges; `allHostingPrivileges` itself stays as it is (it shapes the sidebar of the
// other states).
export const containersService = hostingService({ privileges: [...allHostingPrivileges, 'hosting.manage_containers', 'hosting.manage_proxy_routing'] })

/** The My server frame: the service and the list handlers of every state (`target: 'lite'`, the sidebar of the hosting page). */
export const containersBase = {
  lite: true,
  path: '/hosting/containers',
  services: [containersService],
  ready: { legacy: (page: Page) => page.locator('.v-main .v-data-table tbody tr').first(), next: (page: Page) => page.getByTestId('containers-table').first().locator('tbody tr').first() },
  handlers: {
    'GET /services/1/proxy-rules': { json: { data: [] } },
  },
}

export function proxyRule (overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    transport: 'http',
    upstream_port: 8080,
    upstream_protocol: 'http',
    listen_port: 80,
    server_name: 'example.com',
    ...overrides,
  }
}

// `web` gets a public stream port (9090) on top of 8080, so the fixture has one external port per kind: http (proxied), http on the
// sensitive port 3306 (sensitive-proxied) and a stream rule (stream-proxied). Plan adaptation: the stream port lives on `web`.
export const proxiedContainers = [
  containerRow({ Ports: '0.0.0.0:8080->80/tcp, :::8080->80/tcp, 0.0.0.0:9090->9090/tcp' }),
  baseContainers[1],
  baseContainers[2],
]

export const proxiedRules = [
  proxyRule({ id: 1, upstream_port: 8080, listen_port: 80, server_name: 'example.com' }),
  proxyRule({ id: 2, upstream_port: 3306, listen_port: 8306, server_name: 'db.example.com' }),
  proxyRule({ id: 3, transport: 'tcp', upstream_port: 9090, upstream_protocol: 'tcp', listen_port: 9091, server_name: null }),
]

export const containersLogsPath = 'GET /services/1/containers/11/web/logs'

export const domainsHandler = { json: { data: [{ domain: 'example.com' }, { domain: null }, { domain: 'shop.example.com' }] } }

// ---------------------------------------------------------------------------------------------
// Project frame: the Advanced tab of a project (S-110). The instance is the one of `ADVANCED_PROJECT_ID`; its group is the first group of
// the service's list (`projectGroup`), so `server_account_id` names the group's account.
// ---------------------------------------------------------------------------------------------

/** The project's Advanced frame privileges plus the containers and proxy routing privileges (the Actions and the Manage URLs dialog). */
export const CONTAINERS_PROJECT_PRIVILEGES = [...ADVANCED_PRIVILEGES, 'hosting.manage_containers', 'hosting.manage_proxy_routing']

/** The `GET /projects/41` body of the project: a container project of the example account (`is_container`, `server_account_id` of the group). */
export const containersProjectInstance = advancedInstance(CONTAINERS_PROJECT_PRIVILEGES, {
  is_container: true,
  server_account_id: exampleAccount.id,
})

/** The same project without `hosting.manage_proxy_routing` (Phase 17): the Ports chips are not clickable. */
export const containersProjectInstanceNoProxy = advancedInstance(CONTAINERS_PROJECT_PRIVILEGES.filter(privilege => privilege !== 'hosting.manage_proxy_routing'), {
  is_container: true,
  server_account_id: exampleAccount.id,
})

/** The single-server `/home` without the `admin` key (as the FTP and SFTP project states): the style manager drawer would widen the shot. */
export { FTP_PROJECT_HOME as CONTAINERS_PROJECT_HOME } from './ftp'

/** Handlers of the project's Containers page: the Advanced frame plus the containers and the proxy rules of the service (id 1). */
export function containersProjectHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return advancedFrameHandlers({
    [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: containersProjectInstance } },
    'GET /services/1/containers': { json: containersBody([containerGroup(baseContainers)]) },
    'GET /services/1/proxy-rules': { json: { data: [] } },
    ...overrides,
  })
}

/** Ready when the Advanced sidebar and the first container row are both on the page (the title is the first probe). */
export const waitForContainersProject = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(page => page.locator('.v-main .v-data-table tbody tr').first()),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(page => page.getByTestId('containers-table').locator('tbody tr').first()),
  ],
}

/** The probes of the project's default state, the readiness anchor first (the title). */
export const containersProjectDefaultProbes: Probe[] = [
  containersProjectTitleProbe,
  containersProjectRefreshProbe,
  containersProjectActionsProbe,
  containersProjectActionsLabelProbe,
  containersProjectActionsChevronProbe,
  containersProjectCardProbe,
  containersProjectHeaderCellProbe,
  containersProjectTableProbe,
  containersRowProbe,
  containersPortsProbe,
  containersPortChipProbe,
  advancedActiveItemProbe,
]

// ---------------------------------------------------------------------------------------------
// Shared steps
// ---------------------------------------------------------------------------------------------

/**
 * A group header button by its position: 0 Start All, 1 Restart, 2 Stop All, 3 Pull & Redeploy, 4 Down. On mobile the buttons are
 * icon-only (no accessible name), so the position is the only handle that works for both widths.
 */
export function groupButton (index: number): StateAction {
  return async page => {
    await page.locator('.v-main .align-center.mb-2').first().locator('button').nth(index).click()
  }
}

/** An icon button of the actions cell of the first row: 0 start, 1 stop, 2 restart, 3 logs. Legacy and next tables differ in their hooks. */
export function rowAction (index: number, app: 'legacy' | 'next'): StateAction {
  return async page => {
    const table = app === 'legacy' ? page.locator('.v-main .v-data-table').first() : page.getByTestId('containers-table').first()
    await table.locator('tbody tr').first().locator('td').last().locator('button').nth(index).click()
  }
}

/**
 * The first Ports chip of the first row. The chip ignores pointer events on external ports, so the click lands on its clickable
 * wrapper (`force` keeps the hit test on the chip's box; the wrapper receives the click, as in the app).
 */
export function portChip (app: 'legacy' | 'next'): StateAction {
  return async page => {
    const table = app === 'legacy' ? page.locator('.v-main .v-data-table').first() : page.getByTestId('containers-table').first()
    // The chip of the published port 8080: the Ports cell is the only one with that text on desktop and on mobile.
    await table.locator('.v-chip').filter({ hasText: '8080' }).first().click({ force: true })
  }
}

/** Opens the project's Actions menu (next by its test id, legacy by the QuickActionsButton activator). */
export function openContainersActions (next: boolean): StateAction {
  return async page => {
    if (next) {
      await page.getByTestId('containers-actions-button').click()
      await settled(page.locator('.v-overlay--active .v-overlay__content.quick-actions-menu'))
      return
    }
    await page.locator(`${projectHeader} .page-title__filter-controls .page-title__add-button`).click()
    await settled(page.locator('.menuable__content__active'))
  }
}

/** Opens the project's Actions menu and clicks one item by its position (the menu order of the project's Actions in lite). */
export function clickContainersActionsItem (next: boolean, index: number): StateAction {
  return async page => {
    await openContainersActions(next)(page)
    await (next ? page.getByTestId('containers-actions-item') : page.locator('.menuable__content__active .v-list-item')).nth(index).click()
  }
}

/**
 * The Manage Public URLs dialog asks for the account domains after it opens. In next the preview under the form is the dash until the
 * primary domain is selected, so waiting for the domain keeps the capture off the loading select. The deployed lite legacy is older
 * than the source in the repo (it still offers "IP access (no hostname)" and previews the server address), so there it only waits
 * for a preview.
 */
export const domainsLoaded: StateAction = async page => {
  await page.locator('.v-dialog').getByText(/→\s*http:\/\/example\.com:8080\//).waitFor()
}

export const previewShown: StateAction = async page => {
  await page.locator('.v-dialog').getByText(/→\s*\S+/).waitFor()
}

export const containersDialogProbe: Probe = {
  key: 'containers-dialog',
  legacy: page => page.locator('.v-dialog .v-card').first(),
  next: page => page.locator('.v-dialog .v-card').first(),
}

/** The Down dialog (Phase 18): its title, its text, and the Cancel and Down buttons (the second action of the card's actions row). */
export const containersDialogTitleProbe: Probe = {
  key: 'containers-dialog-title',
  legacy: page => page.locator('.v-dialog .v-card__title'),
  next: page => page.locator('.v-dialog .v-card-title'),
}

export const containersDialogTextProbe: Probe = {
  key: 'containers-dialog-text',
  legacy: page => page.locator('.v-dialog .v-card__text'),
  next: page => page.locator('.v-dialog .v-card-text'),
}

/** The existing-URL list of the Manage URLs dialog: item, link, subtitle and the remove button. */
export const containersUrlsItemProbe: Probe = {
  key: 'containers-urls-item',
  legacy: page => page.locator('.v-dialog .v-list-item').first(),
  next: page => page.locator('.v-dialog .v-list-item').first(),
}

export const containersUrlsLinkProbe: Probe = {
  key: 'containers-urls-link',
  legacy: page => page.locator('.v-dialog .v-list-item a').first(),
  next: page => page.locator('.v-dialog .v-list-item a').first(),
}

export const containersUrlsSubtitleProbe: Probe = {
  key: 'containers-urls-subtitle',
  legacy: page => page.locator('.v-dialog .v-list-item__subtitle').first(),
  next: page => page.locator('.v-dialog .v-list-item-subtitle').first(),
}

export const containersUrlsRemoveProbe: Probe = {
  key: 'containers-urls-remove',
  legacy: page => page.locator('.v-dialog .v-list-item .v-btn').first(),
  next: page => page.locator('.v-dialog .v-list-item .v-btn').first(),
}

export const containersDialogCancelProbe: Probe = {
  key: 'containers-dialog-cancel',
  legacy: page => page.locator('.v-dialog .v-card__actions .v-btn').nth(0),
  next: page => page.locator('.v-dialog .v-card-actions .v-btn').nth(0),
}

export const containersDialogDownProbe: Probe = {
  key: 'containers-dialog-down',
  legacy: page => page.locator('.v-dialog .v-card__actions .v-btn').nth(1),
  next: page => page.locator('.v-dialog .v-card-actions .v-btn').nth(1),
}

/**
 * Opens the project's Actions menu and clicks the Down item (index 4) by a DOM click, without scrolling the page (the lesson "Modal w stanie
 * parity"): the menu closes and the Down dialog opens.
 */
export function openContainersDownDialog (next: boolean): StateAction {
  return async page => {
    await openContainersActions(next)(page)
    const item = (next ? page.getByTestId('containers-actions-item') : page.locator('.menuable__content__active .v-list-item')).nth(4)
    await item.evaluate(node => (node as HTMLElement).click())
    await settled(page.locator('.v-dialog .v-card').first())
  }
}

// ---------------------------------------------------------------------------------------------
// Logs dialog (Phase 19): the card of the service's log, its refresh button and the console block (`pre.logs-pre`) or the spinner.
// ---------------------------------------------------------------------------------------------

/** The console block of the Logs dialog (the text of the log, or the empty text when the log is empty). */
export const containersLogsPreProbe: Probe = {
  key: 'containers-logs-pre',
  legacy: page => page.locator('.v-dialog .logs-pre'),
  next: page => page.locator('.v-dialog .logs-pre'),
}

/** The refresh button of the Logs dialog title (its loader is on while the log is asked for). */
export const containersLogsRefreshProbe: Probe = {
  key: 'containers-logs-refresh',
  legacy: page => page.locator('.v-dialog .v-card__title .v-btn'),
  next: page => page.locator('.v-dialog .v-card-title .v-btn'),
}

/** The spinner of the Logs dialog body while the log request is pending. */
export const containersLogsSpinnerProbe: Probe = {
  key: 'containers-logs-spinner',
  legacy: page => page.locator('.v-dialog .v-card__text .v-progress-circular'),
  next: page => page.locator('.v-dialog .v-card-text .v-progress-circular'),
}

// ---------------------------------------------------------------------------------------------
// Manage Public URLs dialog (Phase 20): the card (540 px), the domain select, the listen port field and the preview line under the form.
// ---------------------------------------------------------------------------------------------

/** The domain select of the add form (the item of the account domains; disabled without domains). */
export const containersUrlsSelectProbe: Probe = {
  key: 'containers-urls-select',
  legacy: page => page.locator('.v-dialog .v-select'),
  next: page => page.locator('.v-dialog .v-select'),
}

/** The listen port field of the add form (the number input, the `aria-label` of next names it for assistive technology). */
export const containersUrlsPortProbe: Probe = {
  key: 'containers-urls-port',
  legacy: page => page.locator('.v-dialog input[type="number"]'),
  next: page => page.locator('.v-dialog input[type="number"]'),
}

/** The preview line `→ url` under the form: the last block of the card text in both apps. */
export const containersUrlsPreviewProbe: Probe = {
  key: 'containers-urls-preview',
  legacy: page => page.locator('.v-dialog .v-card__text > div').last(),
  next: page => page.locator('.v-dialog .v-card-text > div').last(),
}

/** The form's add button (the second action of the card's actions row, after Close). */
export const containersUrlsAddProbe: Probe = {
  key: 'containers-urls-add',
  legacy: page => page.locator('.v-dialog .v-card__actions .v-btn').nth(1),
  next: page => page.locator('.v-dialog .v-card-actions .v-btn').nth(1),
}

/** The 422 answer of `POST /services/1/proxy-rules` (a rule the proxy refuses). */
export const containersProxyRuleError: Handler = { status: 422, json: { message: 'The given data was invalid.', errors: { server_name: ['The server name is not valid.'] } } }
