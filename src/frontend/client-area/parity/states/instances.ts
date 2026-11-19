import type { Handler, HandlerContext, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { expect } from '@playwright/test'
import { readParityClipboard, settled, tr } from './auth'
import { inDays, isDesktop, isMobile, NOW, shellHandlers, shellHome } from './shell'

// Shared building blocks of the S-09 instance list states. Not a spec file (testMatch is `*.parity.ts`).
//
// Legacy locators prefer role / text, then the legacy class names next copied. Next locators use the `instances-*` /
// `instance-card-*` data-testid vocabulary: `instances-title`, `instances-style-switch`, `instances-filter-controls`,
// `instances-content`, `instance-card`, `instance-card-title`, `instance-card-url`, `instance-card-skeleton`,
// `instances-no-data`, `instances-no-data-card`, `instances-no-data-title`, `instances-no-data-create`; the table adds
// `instance-table` (the card), `instance-table-sort`, `instance-table-row`, `instance-table-subrow`, `instance-table-title`,
// `instance-table-url` and `instance-table-skeleton`.

const SCREENSHOT = readFileSync(new URL('../fixtures/screenshot.png', import.meta.url))

const UNIX_NOW = Math.floor(Date.parse(NOW) / 1000)

/** The privileges a full owner gets from the API; the list reads `manage_labels`, `manage_shared_access` and `collaboration`. */
export const OWNER_PRIVILEGES = [
  'general.manage_labels',
  'general.manage_shared_access',
  'general.refresh_thumbnail',
  'general.create_staging',
  'general.push_to_live',
  'general.copy_instance',
  'general.delete_instance',
  'general.preview_instance',
  'wordpress.create_sso_link',
  'wordpress.update',
  'wordpress.clear_cache',
]

/** A raw `GET /instances` item in the legacy API shape (research §2.3). `overrides` replace fields one level deep. */
export function rawInstance (id: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    type: 'wordpress',
    name: `Site ${id}`,
    url: `https://site-${id}.example.com`,
    domain: `site-${id}.example.com`,
    service_id: 1,
    service_status: 'active',
    service_created_at: inDays(-120),
    staging: false,
    staging_apps: [],
    parent_app: null,
    labels: [],
    screenshot_time: null,
    stats: {
      visitors: { unique: 1280, unique_lastmonth: 1000 },
      bandwidth: { usage: 5_368_709_120, maximum: 107_374_182_400 },
      storage: { usage: 1_073_741_824, maximum: -1 },
    },
    created_at: inDays(-40),
    version: '6.5.0',
    update_details: { available_updates: [] },
    backup_details: [{ id: 1, type: 'automatic', date: UNIX_NOW - 3600, async_status: { create: 'finished', restore: null } }],
    plugin_details: [],
    has_automatic_backup: true,
    status: 'active',
    import_details: null,
    install_details: null,
    async_status: { installation: 'finished', update: null, push_to_live: null, pull_from_staging: null, push_to_staging: null },
    privileges: OWNER_PRIVILEGES,
    shared_access: [],
    owner: { name: 'Jane Doe', email: 'jane@example.com' },
    owned: true,
    server_account_id: 1,
    server_account_status: 'active',
    hosting_server_type: 'cpanel',
    host_ip_address: null,
    host_ipv4_addresses: [],
    host_c_names: [],
    dns_nameservers: [],
    dns_settings: { verification_methods: ['resolve_a_record'], verification_mode: 'any' },
    domain_ssl_details: null,
    details: { dns_alerts_enabled: true },
    plan_settings: {},
    server_settings: { uses_own_backup_system: false },
    onboarding_subdomain: null,
    ...overrides,
  }
}

/** A card with a fresh detected certificate: no `GET .../ssl/certificate/detected` and no DNS lookup, the lock is green. */
const secured = {
  host_ip_address: '203.0.113.10',
  host_ipv4_addresses: ['203.0.113.10'],
  domain_ssl_details: {
    detected_ssl_cert: { not_before: inDays(-30), self_signed: false, name_match: true, issuer_name: 'Example CA' },
    detected_ssl_cert_checked_time: UNIX_NOW - 60,
    installed_ssl_cert: null,
    installed_ssl_cert_checked_time: 0,
  },
}

/** The base set of the default grid: with and without screenshot, suspended, staging parent, status issues, labels. */
export function gridInstances (): Array<Record<string, unknown>> {
  return [
    rawInstance(1, { name: 'Acme Blog', url: 'https://acme-blog.example.com', domain: 'acme-blog.example.com', screenshot_time: UNIX_NOW - 7200, ...secured }),
    rawInstance(2, { name: 'Portfolio', url: 'https://portfolio.example.com', domain: 'portfolio.example.com', created_at: inDays(-3) }),
    rawInstance(3, { name: 'Old Shop', url: 'https://old-shop.example.com', domain: 'old-shop.example.com', service_status: 'suspended', screenshot_time: UNIX_NOW - 86_400 }),
    rawInstance(4, {
      name: 'Studio',
      url: 'https://studio.example.com',
      domain: 'studio.example.com',
      screenshot_time: UNIX_NOW - 3600,
      staging_apps: [rawInstance(41, { name: 'Studio staging', url: 'https://staging.studio.example.com', domain: 'staging.studio.example.com', staging: true, screenshot_time: UNIX_NOW - 3600 })],
    }),
    rawInstance(5, { name: 'Needs Attention', url: 'https://attention.example.com', domain: 'attention.example.com', has_automatic_backup: false, backup_details: [], version: '6.4.0', update_details: { available_updates: ['6.5.0'] } }),
    rawInstance(6, {
      name: 'Client Site',
      url: 'https://client-site.example.com',
      domain: 'client-site.example.com',
      labels: [{ title: 'Production', color: '#07C07E' }, { title: 'Client', color: '#2F80ED' }],
      shared_access: [{ email: 'a@example.com', name: 'A', role: 'view_only' }, { email: 'b@example.com', name: 'B', role: 'developer' }],
    }),
  ]
}

/** One screenshot answer per instance that has `screenshot_time` (the handler key is the path without the query). */
export function screenshotHandlers (items: Array<Record<string, unknown>>, segment: 'instances' | 'projects' = 'instances'): Record<string, Handler> {
  const handlers: Record<string, Handler> = {}
  const add = (item: Record<string, unknown>) => {
    if (item.screenshot_time) {
      handlers[`GET /${segment}/${item.id}/screenshot.jpg`] = { headers: { 'content-type': 'image/png' }, body: SCREENSHOT }
    }
    for (const child of (item.staging_apps ?? []) as Array<Record<string, unknown>>) {
      add(child)
    }
  }
  for (const item of items) {
    add(item)
  }
  return handlers
}

/**
 * The base set seen as a table: a negative visitors delta, a zero bandwidth ("No data"), the suspended row and the staging
 * sub-row. Items 1, 3 and 4 keep their grid fixtures; 2 and 5 change their stats.
 */
export function listInstances (): Array<Record<string, unknown>> {
  const items = gridInstances()
  items[1] = rawInstance(2, {
    name: 'Portfolio',
    url: 'https://portfolio.example.com',
    domain: 'portfolio.example.com',
    created_at: inDays(-3),
    stats: {
      visitors: { unique: 340, unique_lastmonth: 900 },
      bandwidth: { usage: 0, maximum: 107_374_182_400 },
      storage: { usage: 524_288_000, maximum: 5_368_709_120 },
    },
  })
  return items
}

/** Page-sized fixtures for the footer states: `count` plain instances with a screenshot each. */
export function pageInstances (count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, index) => rawInstance(index + 1, {
    name: `Site ${index + 1}`,
    url: `https://site-${index + 1}.example.com`,
    domain: `site-${index + 1}.example.com`,
    screenshot_time: UNIX_NOW - 3600,
    created_at: inDays(-(index + 1)),
    ...secured,
  }))
}

export interface InstancesStateOptions {
  items?: Array<Record<string, unknown>>
  /** Replaces the `GET /instances` answer (a hold, an error, an empty list). */
  instances?: Handler
  total?: number
  clock?: string
  handlers?: Record<string, Handler>
  external?: ParityState['external']
  legacy?: StateAction[]
  next?: StateAction[]
  probes?: Probe[]
  pointer?: ParityState['pointer']
  keepScroll?: ParityState['keepScroll']
  masks?: ParityState['masks']
  /** Switch to the table through the style switch once the grid has loaded. */
  list?: boolean
  /**
   * app-lite: measured against the lite legacy (`target: 'lite'`) on `/projects` with the single-server `/home`; the API paths
   * read `projects` (the legacy interceptor and next's client rewrite `instances`).
   */
  lite?: boolean
  /** Replaces the default `/home` (`shellHome()`, or `liteShellHome()` with `lite`), e.g. the Atarim integration of the collaborate states. */
  home?: Record<string, unknown>
}

/**
 * A card image sits behind the spinner placeholder until it has loaded. Legacy `v-img` starts loading from an intersection
 * observer, after the harness has seen no pending request, so without this wait the legacy shot races the image.
 */
function waitForScreenshots (placeholder: string, cards: number): StateAction {
  return async page => {
    // The cards first: before the list answers there is no placeholder either, and the shell alone would be captured.
    await page.waitForFunction(count => document.querySelectorAll('.data-iterator-card').length >= count, cards)
    // Only a placeholder in the viewport loads: the intersection observer never fires for a card below the fold (375px
    // tall phones show two or three of eight), so waiting for every placeholder would time out on mobile.
    await page.waitForFunction(selector => [...document.querySelectorAll(selector)].every(element => {
      const box = element.getBoundingClientRect()
      return box.top >= window.innerHeight || box.bottom <= 0 || box.width === 0
    }), placeholder)
  }
}

/**
 * The table avatar loads its screenshot like the grid card (legacy `v-img`, intersection observer), so the table states wait
 * until no avatar placeholder is in the viewport. Counting loaded avatars would wait forever on a phone, where only the rows in
 * view load (same reason as `waitForScreenshots`). Placeholders: `.v-image__placeholder` in legacy, `.v-img__placeholder` in next.
 */
function waitForAvatars (placeholder: string): StateAction {
  return async page => {
    await page.waitForFunction(selector => [...document.querySelectorAll(selector)].every(element => {
      const box = element.getBoundingClientRect()
      return box.top >= window.innerHeight || box.bottom <= 0 || box.width === 0
    }), placeholder)
  }
}

/** Switch to the table through the style switch (both apps keep the choice in `localStorage.instancesListStyle`). */
const switchToList: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('h1 + div button').nth(1).click()
    await settled(page.locator('.v-card.table'))
  },
  next: async page => {
    await page.getByTestId('instances-style-switch').getByRole('button').nth(1).click()
    await settled(page.getByTestId('instance-table'))
  },
}

/** Everything an instance list state shares: signed in, `/instances`, the shell fixtures, a fixed clock, one screenshot handler per item. */
export function instancesState (options: InstancesStateOptions = {}): Omit<ParityState, 'id'> {
  const items = options.items ?? []
  const segment = options.lite ? 'projects' : 'instances'
  return {
    path: `/${segment}`,
    ...(options.lite ? { target: 'lite' as const } : {}),
    signedIn: true,
    clock: options.clock ?? NOW,
    home: options.home ?? (options.lite ? liteShellHome() : shellHome()),
    handlers: {
      ...shellHandlers([], segment),
      [`GET /${segment}`]: options.instances ?? { json: { data: items, meta: { total: options.total ?? items.length } } },
      ...screenshotHandlers(items, segment),
      ...options.handlers,
    },
    ...(options.external === undefined ? {} : { external: options.external }),
    actions: {
      legacy: [
        waitForScreenshots('.v-image__placeholder', items.length),
        ...(options.list ? [switchToList.legacy, waitForAvatars('.table-row .v-avatar .v-image__placeholder')] : []),
        ...(options.legacy ?? []),
      ],
      next: [
        waitForScreenshots('.v-img__placeholder', items.length),
        ...(options.list ? [switchToList.next, waitForAvatars('.table-row .v-avatar .v-img__placeholder')] : []),
        ...(options.next ?? []),
      ],
    },
    ...(options.pointer === undefined ? {} : { pointer: options.pointer }),
    ...(options.keepScroll === undefined ? {} : { keepScroll: options.keepScroll }),
    ...(options.masks === undefined ? {} : { masks: options.masks }),
    probes: options.probes ?? [],
  }
}

// ---------------------------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------------------------

export const titleProbe: Probe = {
  key: 'title',
  legacy: page => page.getByRole('heading', { level: 1 }),
  next: page => page.getByTestId('instances-title'),
}

export const styleSwitchProbe: Probe = {
  key: 'style-switch',
  legacy: page => page.locator('h1 + div'),
  next: page => page.getByTestId('instances-style-switch'),
}

export const filterControlsProbe: Probe = {
  key: 'filter-controls',
  legacy: page => page.locator('.data-iterator-filter-controls'),
  next: page => page.getByTestId('instances-filter-controls'),
}

/** The toolbar and the heading, which every list state with items shows. */
export const headerProbes: Probe[] = [titleProbe, styleSwitchProbe, filterControlsProbe]

export function cardProbes (index: number, prefix = `card-${index + 1}`): Probe[] {
  return [
    {
      key: prefix,
      legacy: page => page.locator('.data-iterator-card').nth(index),
      next: page => page.getByTestId('instance-card').nth(index),
    },
    {
      key: `${prefix}-title`,
      legacy: page => page.locator('.data-iterator-card__title').nth(index),
      next: page => page.getByTestId('instance-card-title').nth(index),
    },
    {
      key: `${prefix}-url`,
      legacy: page => page.locator('.instance-domain-link').nth(index),
      next: page => page.getByTestId('instance-card-url').nth(index),
    },
  ]
}

export const skeletonCardProbe: Probe = {
  key: 'skeleton-card',
  legacy: page => page.locator('.responsive-card .v-card').first(),
  next: page => page.getByTestId('instance-card-skeleton').first(),
}

export const noDataProbes: Probe[] = [
  {
    key: 'no-data',
    legacy: page => page.locator('.no-data--instances'),
    next: page => page.getByTestId('instances-no-data'),
  },
  {
    key: 'no-data-card',
    legacy: page => page.locator('.no-data--instances .v-card'),
    next: page => page.getByTestId('instances-no-data-card'),
  },
  {
    key: 'no-data-title',
    legacy: page => page.locator('.nodata-container__title'),
    next: page => page.getByTestId('instances-no-data-title'),
  },
  {
    key: 'no-data-create',
    legacy: page => page.locator('.no-data--instances .v-btn'),
    next: page => page.getByTestId('instances-no-data-create'),
  },
]

/** The empty dashed frame legacy shows when the load fails (`DataIteratorNoResultsContainer` without its content). */
export const loadErrorFrameProbe: Probe = {
  key: 'error-frame',
  legacy: page => page.locator('.no-results-container'),
  next: page => page.getByTestId('instances-content').locator('.no-results-container'),
  internal: true,
}

/** The table card, its sort header and the first rows; `rows` main rows and `subrows` sub-rows are probed. */
export const tableCardProbe: Probe = {
  key: 'table',
  legacy: page => page.locator('.v-card.table'),
  next: page => page.getByTestId('instance-table'),
}

export const tableSortProbe: Probe = {
  key: 'table-sort',
  legacy: page => page.locator('.custom-sort'),
  next: page => page.getByTestId('instance-table-sort'),
}

export function tableRowProbes (index: number, prefix = `row-${index + 1}`): Probe[] {
  return [
    {
      key: prefix,
      legacy: page => page.locator('.table-row').nth(index),
      next: page => page.getByTestId('instance-table-row').nth(index),
    },
    {
      key: `${prefix}-title`,
      legacy: page => page.locator('.table-row .item__title').nth(index),
      next: page => page.getByTestId('instance-table-title').nth(index),
    },
    {
      key: `${prefix}-url`,
      legacy: page => page.locator('.table-row .instance-domain-link').nth(index),
      next: page => page.getByTestId('instance-table-url').nth(index),
    },
  ]
}

/** The avatar of row `index` (row 2 has no screenshot: the "not available" icon), its kebab and, for a suspended row, the chip. */
export function tableCellProbes (index: number): Probe[] {
  return [
    {
      key: `avatar-${index + 1}`,
      legacy: page => page.locator('.table-row .v-avatar').nth(index),
      next: page => page.getByTestId('instance-table-avatar').nth(index),
    },
    {
      key: `menu-${index + 1}`,
      legacy: page => page.locator('.table-row .instance-item__more-button').nth(index),
      next: page => page.getByTestId('instance-table-menu').nth(index),
    },
  ]
}

export const tableSuspendChipProbe: Probe = {
  key: 'suspend-chip',
  legacy: page => page.locator('.suspend-chip'),
  next: page => page.getByTestId('instance-table-suspend-chip'),
}

export const tableSubLabelProbe: Probe = {
  key: 'sub-label',
  legacy: page => page.locator('.subinstance-label'),
  next: page => page.getByTestId('instance-table-sub-label'),
}

export const tableSubrowProbe: Probe = {
  key: 'subrow',
  legacy: page => page.locator('.table-subrow').first(),
  next: page => page.getByTestId('instance-table-subrow').first(),
}

export const tableSkeletonRowProbe: Probe = {
  key: 'skeleton-row',
  legacy: page => page.locator('.skeleton-row').first(),
  next: page => page.getByTestId('instance-table-skeleton').first(),
}

/** The pagination footer (shared `DataIteratorFooter`, so it has no screen test id: it is found inside the content). */
export const footerProbe: Probe = {
  key: 'footer',
  legacy: page => page.locator('.data-iterator-footer'),
  next: page => page.getByTestId('instances-content').locator('.data-iterator-footer'),
  internal: true,
}

// ---------------------------------------------------------------------------------------------
// Toolbar (S-09 Phase 3)
// ---------------------------------------------------------------------------------------------

/** Waits until the list shows exactly `count` cards (a search or filter answer replaced the first page). */
export function waitForCardCount (count: number): StateAction {
  return async page => {
    await page.waitForFunction(expected => document.querySelectorAll('.data-iterator-card').length === expected, count)
  }
}

/**
 * Types the search term and waits for the answer to show `cards` cards. Legacy debounces twice with lodash (the field and the
 * view), which measures the wait with `Date.now()`: under the frozen `clock` it never sees 300 ms pass and the search never
 * fires. So the frozen time is moved on by a second between short in-page sleeps (timers keep running) until the list changes.
 */
export function searchAction (term: string, cards: number): StateAction {
  return async page => {
    // Below `md` the search is a 38px icon that opens the field on click (`DataIteratorSearch`, `smAndDown`).
    if ((page.viewportSize()?.width ?? 1440) < 768) {
      // Vue 3 skips a bubbling listener whose `attached` time is not before the event's `Date.now()`; the frozen clock makes
      // them equal, so only the innermost handler (not the wrapper's `@click="openInput"`) would run. Move the time on first.
      await page.clock.setFixedTime(new Date(Date.parse(NOW) + 500))
      await page.locator('.data-iterator-filter-controls__item').last().locator('.v-input').click()
    }
    await page.getByPlaceholder(tr('form.placeholder.search')).fill(term)
    const base = Date.parse(NOW)
    for (let step = 1; step <= 20; step++) {
      await page.clock.setFixedTime(new Date(base + step * 1000))
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 350)))
      if (await page.locator('.data-iterator-card').count() === cards) {
        return
      }
    }
  }
}

export const toolbarSearchProbe: Probe = {
  key: 'search',
  legacy: page => page.locator('.data-iterator-filter-controls__item').last().locator('.v-input__slot'),
  next: page => page.getByTestId('instances-filter-controls').locator('.data-iterator-filter-controls__item').last().locator('.v-field'),
  internal: true,
}

export const toolbarFilterProbe: Probe = {
  key: 'filter-button',
  legacy: page => page.locator('.filter-menu .custom-menu'),
  next: page => page.getByTestId('instances-filter-controls').locator('.filter-menu .custom-menu'),
  internal: true,
}

export const toolbarSortProbe: Probe = {
  key: 'sort-select',
  legacy: page => page.locator('.data-iterator-filter-controls__item--sort-instances .v-input__slot'),
  next: page => page.getByTestId('instances-filter-controls').locator('.data-iterator-filter-controls__item--sort-instances .v-field'),
  internal: true,
}

export const toolbarFilterCountProbe: Probe = {
  key: 'filter-count',
  legacy: page => page.locator('.filter-number'),
  next: page => page.getByTestId('instances-filter-controls').locator('.filter-number'),
  internal: true,
}

export const toolbarClearFilterProbe: Probe = {
  key: 'clear-filter-link',
  legacy: page => page.locator('.filter-menu .clear-filter'),
  next: page => page.getByTestId('instances-filter-controls').locator('.filter-menu .clear-filter'),
  internal: true,
}

/** The "no results" frame legacy and next render when search or labels leave nothing (`DataIteratorNoResultsContainer`). */
export const noResultsProbes: Probe[] = [
  loadErrorFrameProbe,
  {
    key: 'no-results-text',
    legacy: page => page.locator('.no-results-container span.gray--text'),
    next: page => page.getByTestId('instances-content').locator('.no-results-container span.text--gray-darken1'),
    internal: true,
  },
  {
    key: 'no-results-clear',
    legacy: page => page.locator('.no-results-container .v-btn'),
    next: page => page.getByTestId('instances-content').locator('.no-results-container .v-btn'),
    internal: true,
  },
]

export const noResultsButtonPartProbes: Probe[] = [
  {
    key: 'no-results-clear-icon',
    legacy: page => page.locator('.no-results-container .v-btn .v-icon'),
    next: page => page.getByTestId('instances-content').locator('.no-results-container .v-btn .v-icon'),
    internal: true,
  },
  {
    key: 'no-results-clear-label',
    legacy: page => page.locator('.no-results-container .v-btn span.p-2'),
    next: page => page.getByTestId('instances-content').locator('.no-results-container .v-btn span.p-2'),
    internal: true,
  },
]

/** The open filter menu (legacy `.menuable__content__active`, V4 overlay content) and its parts. */
export const filterMenuProbes: Probe[] = [
  {
    key: 'filter-menu',
    legacy: page => page.locator('.v-menu__content.menuable__content__active'),
    next: page => page.locator('.v-overlay--active > .v-overlay__content').filter({ has: page.locator('.label-list') }),
    internal: true,
  },
  {
    key: 'filter-menu-list',
    legacy: page => page.locator('.v-menu__content.menuable__content__active .label-list'),
    next: page => page.locator('.v-overlay--active .label-list'),
    internal: true,
  },
  {
    key: 'filter-menu-apply',
    // By name: with a label picked, the first button of the legacy menu is the chip's close button.
    legacy: page => page.locator('.v-menu__content.menuable__content__active').getByRole('button', { name: tr('button.apply'), exact: true }),
    next: page => page.locator('.v-overlay--active .label-list ~ .d-flex .v-btn').first(),
    internal: true,
  },
]

/** The picked label in the filter field: a removable `LabelChip` and its close icon (colour under the pixel threshold). */
export const filterSelectedChipProbes: Probe[] = [
  {
    key: 'filter-selected-chip',
    legacy: page => page.locator('.v-menu__content.menuable__content__active .v-autocomplete .label-chip'),
    next: page => page.locator('.v-overlay--active .v-autocomplete .label-chip'),
  },
  {
    key: 'filter-selected-chip-icon',
    legacy: page => page.locator('.v-menu__content.menuable__content__active .v-autocomplete .label-chip .v-icon'),
    next: page => page.locator('.v-overlay--active .v-autocomplete .label-chip .v-icon'),
    internal: true,
  },
]

export const sortMenuProbe: Probe = {
  key: 'sort-menu',
  legacy: page => page.locator('.custom-dropdown-select.menuable__content__active'),
  next: page => page.locator('.v-overlay--active .custom-dropdown-select'),
  internal: true,
}

export const filterLabels = [
  { title: 'Production', color: '#07C07E' },
  { title: 'Client', color: '#2F80ED' },
  { title: 'Staging', color: '#F2994A' },
]

// ---------------------------------------------------------------------------------------------
// Labels menu (S-09c phase 1): the menu behind a card's or a table row's labels
// ---------------------------------------------------------------------------------------------

/**
 * The account list the menu reads. `Production` and `Client` are on the labelled card, so the Assign list leaves them out;
 * `Staging` is in use by another instance (its "Remove" is disabled with a tooltip), `Archive` is free.
 */
export const labelAccountList = [
  { id: 1, title: 'Production', color: '#07C07E', in_use: false },
  { id: 2, title: 'Client', color: '#2F80ED', in_use: false },
  { id: 3, title: 'Staging', color: '#F2994A', in_use: true },
  { id: 4, title: 'Archive', color: '#44B3D6', in_use: false },
]

/** The menu states only read the account list; none of them assigns, creates or deletes, so no POST / DELETE handler. */
export const labelHandlers: Record<string, Handler> = { 'GET /labels': { json: { data: labelAccountList } } }

/** The `+` button after a label list (`$circlePlus`, shown with the manage-labels privilege). */
export const LABEL_ADD_BUTTON = '.label-list__items-remaining--add'

/** "Add tags", the activator of a host without labels. */
export const LABEL_ADD_TAGS = '.label-bar-empty'

/**
 * The overlay of the open labels menu: the V2 `menuable` content in legacy, the `v-menu` overlay content in next. Legacy also marks
 * the open autocomplete list and tooltip with `menuable__content__active`; the panel is the first one in document order.
 */
export const labelMenuProbe: Probe = {
  key: 'label-menu',
  legacy: page => page.locator('.menuable__content__active').first(),
  next: page => page.locator('.v-menu > .v-overlay__content').first(),
  internal: true,
}

export const labelAssignPanelProbe: Probe = {
  key: 'label-assign',
  legacy: page => page.locator('.assign-existing-label'),
  next: page => page.getByTestId('label-assign'),
}

export const labelAddPanelProbe: Probe = {
  key: 'label-add',
  legacy: page => page.locator('.add-new-label'),
  next: page => page.getByTestId('label-add'),
}

/** The "No tags assigned" line of the Assign panel (`message.tag.noAssigned`). */
export const labelEmptyProbe: Probe = {
  key: 'label-empty',
  legacy: page => page.locator('.assign-existing-label .labels-list .gray--text'),
  next: page => page.getByTestId('label-assign').locator('.labels-list .no-tags-text'),
  internal: true,
}

/** The open autocomplete list (`menu-props` content class `label-autocomplete` in both apps). */
export const labelDropdownProbe: Probe = {
  key: 'label-dropdown',
  legacy: page => page.locator('.label-autocomplete'),
  next: page => page.locator('.label-autocomplete'),
  internal: true,
}

/** The "Remove" of an in-use label: disabled, with the `tooltip.label.remove` tooltip on hover. */
export const labelRemoveDisabledProbe: Probe = {
  key: 'label-remove-disabled',
  legacy: page => page.locator('.instance-label-list__remove--disabled').first(),
  next: page => page.locator('.instance-label-list__remove--disabled').first(),
  internal: true,
}

export const labelTooltipProbe: Probe = {
  key: 'label-tooltip',
  legacy: page => page.locator('.instance-label-list__tooltip'),
  next: page => page.locator('.instance-label-list__tooltip'),
  internal: true,
  when: isDesktop,
}

/** The inline validation message of the Add panel (`p.error--text`). */
export const labelErrorProbe: Probe = {
  key: 'label-error',
  legacy: page => page.locator('.add-new-label p.error--text'),
  next: page => page.getByTestId('label-add').locator('p.text-error'),
  internal: true,
}

type LabelHost = 'card' | 'row'

function labelHostLocator (page: Page, app: 'legacy' | 'next', host: LabelHost, index: number): Locator {
  if (host === 'card') {
    return app === 'legacy' ? page.locator('.data-iterator-card').nth(index) : page.getByTestId('instance-card').nth(index)
  }
  return app === 'legacy' ? page.locator('.table-row').nth(index) : page.getByTestId('instance-table-row').nth(index)
}

/** Clicks `trigger` inside grid card or table row `index`, then waits for the Assign panel. */
export function openLabelMenu (host: LabelHost, index: number, trigger: string): { legacy: StateAction, next: StateAction } {
  const open = (app: 'legacy' | 'next'): StateAction => async page => {
    await labelHostLocator(page, app, host, index).locator(trigger).click()
    await settled(page.locator('.assign-existing-label'))
  }
  return { legacy: open('legacy'), next: open('next') }
}

/**
 * Clicks a button of the label menu. On a phone the menu of card 1 opens at the bottom of the viewport, where the fixed "Add
 * Instance" FAB covers its right-hand buttons in both apps, so a pointer click lands on the FAB. There the click event goes to the
 * button directly; desktop keeps the real click.
 */
async function clickLabelMenuButton (page: Page, button: Locator): Promise<void> {
  await (isDesktopViewport(page) ? button.click() : button.dispatchEvent('click'))
}

/** Clicks the "Add New" button of the Assign panel and waits for the Add panel. */
export const openAddNewLabel: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await clickLabelMenuButton(page, page.locator('.assign-existing-label').getByRole('button', { name: tr('button.addNew'), exact: true }))
    await settled(page.locator('.add-new-label'))
  },
  next: async page => {
    await clickLabelMenuButton(page, page.locator('.assign-existing-label').getByRole('button', { name: tr('button.addNew'), exact: true }))
    await settled(page.locator('.add-new-label'))
  },
}

/** Submits the empty Add panel (`button.label.add`) and waits for the validation message. */
export const submitEmptyLabel: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await clickLabelMenuButton(page, page.locator('.add-new-label').getByRole('button', { name: tr('button.label.add'), exact: true }))
    await settled(page.locator('.add-new-label p.error--text'))
  },
  next: async page => {
    await clickLabelMenuButton(page, page.locator('.add-new-label').getByRole('button', { name: tr('button.label.add'), exact: true }))
    await settled(page.getByTestId('label-add').locator('p.text-error'))
  },
}

/** Opens the Assign autocomplete (the field root is `.custom-input` in both apps). */
export const openLabelAutocomplete: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.assign-existing-label .custom-input').click()
    await settled(page.locator('.label-autocomplete'))
  },
  next: async page => {
    await page.locator('.assign-existing-label .custom-input').click()
    await settled(page.locator('.label-autocomplete'))
  },
}

/** Hovers the disabled "Remove" for the tooltip. Desktop only: a touch viewport has no hover, so the tooltip never opens there. */
async function hoverDisabledRemove (page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 0) < 976) {
    return
  }
  await page.locator('.instance-label-list__remove--disabled').first().hover()
  await settled(page.locator('.instance-label-list__tooltip'))
}

export const hoverLabelRemove: { legacy: StateAction, next: StateAction } = {
  legacy: hoverDisabledRemove,
  next: hoverDisabledRemove,
}

// ---------------------------------------------------------------------------------------------
// Selection, mass actions, card variants (S-09 Phase 4)
// ---------------------------------------------------------------------------------------------

/** Clicks the checkbox of each listed card (the cards show it on hover or once selected) and waits for the selection bar. */
export function selectCards (indices: number[]): { legacy: StateAction, next: StateAction } {
  const select = (snackbar: string): StateAction => async page => {
    for (const index of indices) {
      await page.locator('.data-iterator-card').nth(index).locator('.data-iterator-card__checkbox-container .checkbox').click()
    }
    await page.waitForFunction(count => document.querySelectorAll('.data-iterator-card--selected').length === count, indices.length)
    await settled(page.locator(snackbar))
  }
  return {
    legacy: select('.snackbar .v-snack__wrapper'),
    next: select('.snackbar .v-snackbar__wrapper'),
  }
}

/** Hovers the card (`pointer: 'keep'` leaves the pointer there) and waits for its overlay to show. */
export function hoverCard (index: number): { legacy: StateAction, next: StateAction } {
  const hover: StateAction = async page => {
    // Top-left of the image area, away from the buttons: the buttons move under the pointer when the overlay slides in, and the
    // legacy page may or may not have recomputed `:hover` for them when the shot is taken.
    await page.locator('.data-iterator-card').nth(index).hover({ position: { x: 20, y: 20 } })
    await page.waitForFunction(i => {
      const overlay = document.querySelectorAll('.data-iterator-card')[i]?.querySelector('.instance-actions')
      return overlay !== null && overlay !== undefined && getComputedStyle(overlay).opacity === '1'
    }, index)
  }
  return { legacy: hover, next: hover }
}

/** The selection bar: the bar, its counter and its buttons (desktop row) or its close / more buttons (compact bar). */
export const snackbarProbes: Probe[] = [
  {
    key: 'snackbar',
    legacy: page => page.locator('.snackbar .v-snack__wrapper'),
    next: page => page.getByTestId('instances-snackbar').locator('.v-snackbar__wrapper'),
    internal: true,
  },
  {
    key: 'snackbar-count',
    legacy: page => page.locator('.snackbar__item-number'),
    next: page => page.getByTestId('select-snackbar-count'),
    when: isDesktop,
  },
  {
    key: 'snackbar-clear-cache',
    legacy: page => page.locator('.snackbar .btn-icon-horizontal').first(),
    next: page => page.getByTestId('instances-snackbar-clear-cache'),
    when: isDesktop,
  },
  {
    key: 'snackbar-share',
    legacy: page => page.locator('.snackbar__row .v-btn').first(),
    next: page => page.getByTestId('instances-snackbar-share'),
    when: isDesktop,
  },
  {
    key: 'snackbar-remove',
    legacy: page => page.locator('.snackbar__row .v-btn').nth(1),
    next: page => page.getByTestId('instances-snackbar-remove'),
    when: isDesktop,
  },
  {
    key: 'snackbar-close',
    legacy: page => page.locator('.snackbar .snackbar-button'),
    next: page => page.getByTestId('instances-snackbar').locator('.snackbar-button'),
    internal: true,
    when: isMobile,
  },
  {
    key: 'snackbar-more',
    legacy: page => page.locator('.snackbar .v-btn.ml-auto'),
    next: page => page.getByTestId('select-snackbar-more'),
    when: isMobile,
  },
]

/** Opens a dialog of the mass actions from the selection bar (desktop button or the compact "more" menu). */
function openFromSnackbar (
  name: string,
  menuItem: number,
  ready?: { legacy: string, next: string },
): { legacy: StateAction, next: StateAction } {
  const target = ready ?? { legacy: '.v-dialog--active .v-card', next: 'instances-modal' }
  return {
    legacy: async page => {
      if ((page.viewportSize()?.width ?? 1440) > 966) {
        await page.locator('.snackbar__row').getByText(name, { exact: true }).click()
      } else {
        await page.locator('.snackbar .v-btn.ml-auto').click()
        await page.locator('.v-menu__content.menuable__content__active .v-list-item').nth(menuItem).click()
      }
      await settled(page.locator(target.legacy).first())
    },
    next: async page => {
      if ((page.viewportSize()?.width ?? 1440) > 966) {
        await page.locator('.snackbar__row').getByText(name, { exact: true }).click()
      } else {
        await page.getByTestId('select-snackbar-more').click()
        await page.locator('.v-overlay--active .v-list-item').nth(menuItem).click()
      }
      await settled(page.getByTestId(target.next))
    },
  }
}

export const openClearCache = openFromSnackbar(tr('button.clearCache'), 0)
export const openShare = openFromSnackbar(tr('button.share'), 1, { legacy: '.v-dialog--active .share-instance-modal', next: 'share-modal' })
export const openRemove = openFromSnackbar(tr('button.remove'), 2)

/** The `BasicModal` dialog of the mass actions: card, title, icon, message and the two buttons. */
export const modalProbes: Probe[] = [
  {
    key: 'modal',
    legacy: page => page.locator('.v-dialog--active .v-card'),
    next: page => page.getByTestId('instances-modal'),
  },
  {
    key: 'modal-title',
    legacy: page => page.locator('.v-dialog--active .v-card__title'),
    next: page => page.getByTestId('instances-modal').locator('.v-card-title'),
    internal: true,
  },
  {
    key: 'modal-icon',
    legacy: page => page.locator('.v-dialog--active .v-card__title .v-icon').first(),
    next: page => page.getByTestId('instances-modal').locator('.v-card-title .v-icon').first(),
    internal: true,
  },
  {
    key: 'modal-close',
    legacy: page => page.locator('.v-dialog--active .v-card__title .v-btn .v-icon'),
    next: page => page.getByTestId('instances-modal').locator('.v-card-title .v-btn .v-icon'),
    internal: true,
  },
  {
    key: 'modal-message',
    legacy: page => page.locator('.v-dialog--active .v-card__text p').first(),
    next: page => page.getByTestId('instances-modal').locator('.v-card-text p').first(),
    internal: true,
  },
  {
    key: 'modal-submit',
    legacy: page => page.locator('.v-dialog--active .v-card__actions .v-btn').first(),
    next: page => page.getByTestId('instances-modal').locator('.v-card-actions .v-btn').first(),
    internal: true,
  },
  {
    key: 'modal-cancel',
    legacy: page => page.locator('.v-dialog--active .v-card__actions .v-btn').nth(1),
    next: page => page.getByTestId('instances-modal').locator('.v-card-actions .v-btn').nth(1),
    internal: true,
  },
  {
    key: 'modal-cancel-label',
    legacy: page => page.locator('.v-dialog--active .v-card__actions .v-btn').nth(1).locator('.p-2'),
    next: page => page.getByTestId('instances-modal').locator('.v-card-actions .v-btn').nth(1).locator('.p-2'),
    internal: true,
  },
  {
    key: 'modal-submit-label',
    legacy: page => page.locator('.v-dialog--active .v-card__actions .v-btn').first().locator('.p-2'),
    next: page => page.getByTestId('instances-modal').locator('.v-card-actions .v-btn').first().locator('.p-2'),
    internal: true,
  },
]

/** The checkboxes of the delete dialog (data, database, confirm) and the confirm text. */
export const deleteFormProbes: Probe[] = [
  {
    key: 'modal-checkbox-1',
    legacy: page => page.locator('.v-dialog--active .v-card__text .checkbox').first(),
    next: page => page.getByTestId('instances-modal').locator('.v-card-text .checkbox').first(),
    internal: true,
  },
  {
    key: 'modal-checkbox-3',
    legacy: page => page.locator('.v-dialog--active .v-card__text .checkbox').nth(2),
    next: page => page.getByTestId('instances-modal').locator('.v-card-text .checkbox').nth(2),
    internal: true,
  },
  {
    key: 'modal-confirm-message',
    legacy: page => page.locator('.v-dialog--active .v-card__text form p').first(),
    next: page => page.getByTestId('instances-modal').locator('.v-card-text form p').first(),
    internal: true,
  },
]

/** A card in the pending / failed variants: the image block and its text, and the hover overlay. */
export function pendingProbes (index: number, prefix: string): Probe[] {
  return [
    {
      key: `${prefix}-image`,
      legacy: page => page.locator('.data-iterator-card').nth(index).locator('.v-card__img'),
      next: page => page.getByTestId('instance-card').nth(index).locator('.v-card__img'),
      internal: true,
    },
    {
      key: `${prefix}-text`,
      legacy: page => page.locator('.data-iterator-card').nth(index).locator('.installation-pending__text, .import-pending__text, .import-pending__step'),
      next: page => page.getByTestId('instance-card').nth(index).locator('.installation-pending__text, .import-pending__text, .import-pending__step'),
      internal: true,
    },
  ]
}

export function overlayProbes (index: number, prefix = 'overlay'): Probe[] {
  return [
    {
      key: prefix,
      legacy: page => page.locator('.data-iterator-card').nth(index).locator('.instance-actions'),
      next: page => page.getByTestId('instance-card').nth(index).getByTestId('instance-overlay'),
    },
    {
      key: `${prefix}-content`,
      legacy: page => page.locator('.data-iterator-card').nth(index).locator('.instance-actions__content'),
      next: page => page.getByTestId('instance-card').nth(index).getByTestId('instance-actions'),
    },
    {
      key: `${prefix}-button-1`,
      legacy: page => page.locator('.data-iterator-card').nth(index).locator('.instance-actions__content .v-btn').first(),
      next: page => page.getByTestId('instance-card').nth(index).locator('.instance-actions__content .v-btn').first(),
      internal: true,
    },
    {
      key: `${prefix}-button-last`,
      legacy: page => page.locator('.data-iterator-card').nth(index).locator('.instance-actions__content .v-btn').last(),
      next: page => page.getByTestId('instance-card').nth(index).locator('.instance-actions__content .v-btn').last(),
      internal: true,
    },
  ]
}

/** `instanceResource` fixtures of the pending and failed variants (`async_status.installation`, `import_details`). */
export function pendingInstance (id: number, name: string, installation: 'in_progress' | 'failed', importDetails: unknown = null): Record<string, unknown> {
  return rawInstance(id, {
    name,
    url: `https://${name.toLowerCase().replaceAll(' ', '-')}.example.com`,
    domain: `${name.toLowerCase().replaceAll(' ', '-')}.example.com`,
    async_status: { installation, update: null, push_to_live: null, pull_from_staging: null, push_to_staging: null },
    import_details: importDetails,
    backup_details: [],
    has_automatic_backup: false,
  })
}

// ---------------------------------------------------------------------------------------------
// app-lite (S-09 Phase 5): `/projects` on the lite target
// ---------------------------------------------------------------------------------------------

/** The single-server `/home` of the lite states (the same flags as `shell-lite-*`: `beta_mode` off, no running tasks). */
export function liteShellHome (): Record<string, unknown> {
  return shellHome({
    app: { beta_mode: false, single_server: { active: true, has_running_tasks: false, has_uncompleted_imports: false } },
    user: { is_ss_default: true, has_hosting_access: true },
    admin: { app_url: 'https://admin.example.com' },
  })
}

/** The privileges of a project owner: the list ones plus `redeploy` (the "upload archive" solution is hidden without it) and `manage_users`. */
const PROJECT_PRIVILEGES = [...OWNER_PRIVILEGES, 'general.redeploy', 'general.manage_users']

/** A `type === 'custom'` project (`app_type` in the lite API). It always carries two deploy issues in the status menu. */
export function liteProject (id: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const slug = String(overrides.name ?? `Project ${id}`).toLowerCase().replaceAll(' ', '-')
  return rawInstance(id, {
    type: 'custom',
    name: `Project ${id}`,
    url: `https://${slug}.example.com`,
    domain: `${slug}.example.com`,
    privileges: PROJECT_PRIVILEGES,
    ...overrides,
  })
}

/** A project whose deploy is running or has failed (`async_status.installation`). */
export function deployingProject (id: number, name: string, installation: 'in_progress' | 'failed'): Record<string, unknown> {
  return liteProject(id, {
    name,
    async_status: { installation, update: null, push_to_live: null, pull_from_staging: null, push_to_staging: null },
  })
}

/** A project with a screenshot, so an open dialog or menu above it never flaps the "preview not available" backdrop. */
export function shotProject (id: number, name: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return liteProject(id, { name, screenshot_time: UNIX_NOW - 3600, ...overrides })
}

/** The deploy image of a custom card (the animated terminal) and its caption. */
export function deployPendingProbes (index: number, prefix: string): Probe[] {
  return [
    {
      key: `${prefix}-image`,
      legacy: page => page.locator('.data-iterator-card').nth(index).locator('.v-card__img'),
      next: page => page.getByTestId('instance-card').nth(index).locator('.v-card__img'),
      internal: true,
    },
    {
      key: `${prefix}-terminal`,
      legacy: page => page.locator('.data-iterator-card').nth(index).locator('.deploy-pending__terminal'),
      next: page => page.getByTestId('instance-card').nth(index).getByTestId('deploy-pending').locator('.deploy-pending__terminal'),
      internal: true,
    },
    {
      key: `${prefix}-text`,
      legacy: page => page.locator('.data-iterator-card').nth(index).locator('.deploy-pending__text'),
      next: page => page.getByTestId('instance-card').nth(index).getByTestId('deploy-pending-text'),
    },
  ]
}

/** The deploy overlay of card `index`: its message and the two buttons of the row (Show logs, then Cancel deploy or the download icon). */
export function deployOverlayProbes (index: number, prefix: string, second: 'cancel-deploy' | 'download-logs'): Probe[] {
  return [
    ...overlayProbes(index, prefix).slice(0, 2),
    {
      key: `${prefix}-message`,
      legacy: page => page.locator('.data-iterator-card').nth(index).locator('.instance-actions__content .p2'),
      next: page => page.getByTestId('instance-card').nth(index).getByTestId('instance-actions-message'),
    },
    {
      key: `${prefix}-show-logs`,
      legacy: page => page.locator('.data-iterator-card').nth(index).locator('.instance-actions__row .v-btn').first(),
      next: page => page.getByTestId('instance-card').nth(index).getByTestId('instance-show-logs'),
    },
    {
      key: `${prefix}-${second}`,
      legacy: page => page.locator('.data-iterator-card').nth(index).locator('.instance-actions__row .v-btn').nth(1),
      next: page => page.getByTestId('instance-card').nth(index).getByTestId(`instance-${second}`),
    },
  ]
}

/** Hovers card `index` and clicks "Show logs" of its overlay; waits for the deploy logs dialog. */
export function openDeployLogs (index: number, ready: 'dialog' | 'loader' | 'console' = 'console'): { legacy: StateAction, next: StateAction } {
  const waitFor = (page: Page): Locator => {
    const dialog = page.locator('.deploy-logs-modal')
    return ready === 'dialog' ? dialog : (ready === 'loader' ? dialog.locator('.loader') : dialog.locator('.deploy-console'))
  }
  // Next shows the steps and console skeleton in place of the legacy spinner (user request 2026-11-09).
  const waitForNext = (page: Page): Locator => ready === 'loader' ? page.getByTestId('deploy-logs-skeleton') : waitFor(page)
  const open = (button: (page: Page) => Locator, target: (page: Page) => Locator): StateAction => async page => {
    await page.locator('.data-iterator-card').nth(index).hover({ position: { x: 20, y: 20 } })
    await button(page).click()
    await settled(target(page))
  }
  return {
    legacy: open(page => page.locator('.data-iterator-card').nth(index).locator('.instance-actions__row .v-btn').first(), waitFor),
    next: open(page => page.getByTestId('instance-card').nth(index).getByTestId('instance-show-logs'), waitForNext),
  }
}

/** The deploy logs dialog: card, title and its live badge, the steps, the console, and the action row. */
export const deployLogsProbes: Probe[] = [
  {
    key: 'logs-modal',
    legacy: page => page.locator('.v-dialog--active .deploy-logs-modal'),
    next: page => page.getByTestId('deploy-logs-modal'),
  },
  {
    key: 'logs-title',
    legacy: page => page.locator('.v-dialog--active .deploy-logs-modal .v-card__title h6'),
    next: page => page.getByTestId('deploy-logs-title'),
  },
  {
    key: 'logs-actions',
    legacy: page => page.locator('.v-dialog--active .deploy-logs-modal .v-card__actions'),
    next: page => page.getByTestId('deploy-logs-modal').locator('.v-card-actions'),
    internal: true,
  },
  {
    key: 'logs-close',
    legacy: page => page.locator('.v-dialog--active .deploy-logs-modal .v-card__actions .v-btn').last(),
    next: page => page.getByTestId('deploy-logs-close'),
  },
]

export const deployLogsConsoleProbes: Probe[] = [
  {
    key: 'logs-steps',
    legacy: page => page.locator('.v-dialog--active .deploy-steps'),
    next: page => page.getByTestId('deploy-logs-modal').locator('.deploy-steps'),
    internal: true,
  },
  {
    key: 'logs-console',
    legacy: page => page.locator('.v-dialog--active .deploy-console'),
    next: page => page.getByTestId('deploy-logs-modal').locator('.deploy-console'),
    internal: true,
  },
  {
    key: 'logs-first-line',
    legacy: page => page.locator('.v-dialog--active .deploy-console__line').first(),
    next: page => page.getByTestId('deploy-logs-modal').locator('.deploy-console__line').first(),
    internal: true,
  },
]

export const deployLogsLoaderProbe: Probe = {
  key: 'logs-loader',
  legacy: page => page.locator('.v-dialog--active .deploy-logs-modal .v-card__text .loader'),
  // Next: the steps and console skeleton in place of the spinner (user request 2026-11-09).
  next: page => page.getByTestId('deploy-logs-skeleton'),
}

const LOG_STAGES = [
  { name: 'preparing', started_at: UNIX_NOW - 900, finished_at: UNIX_NOW - 880 },
  { name: 'cloning', started_at: UNIX_NOW - 880, finished_at: UNIX_NOW - 850 },
]

const LOG_LINES = [
  { ts: UNIX_NOW - 899, stage: 'preparing', msg: 'Preparing environment', level: 'info' },
  { ts: UNIX_NOW - 870, stage: 'cloning', msg: 'Cloning repository', level: 'info' },
  { ts: UNIX_NOW - 850, stage: 'cloning', msg: 'warning: redirecting to the new repository url', level: 'warn' },
  { ts: UNIX_NOW - 849, stage: 'cloning', msg: 'fatal: repository not found', level: 'error' },
]

/** `GET /projects/:id/deploy-logs` (history list) and `GET .../:logId` of a failed deploy. */
export function deployHistoryHandlers (id: number, logId: number): Record<string, Handler> {
  return {
    [`GET /projects/${id}/deploy-logs`]: { json: { data: [{ id: logId, status: 'failed', started_at: inDays(0), finished_at: inDays(0) }] } },
    [`GET /projects/${id}/deploy-logs/${logId}`]: {
      json: { data: { id: logId, status: 'failed', stages: LOG_STAGES, lines: LOG_LINES, error: 'Clone failed: repository not found.' } },
    },
  }
}

/**
 * `GET /projects/:id/deploy-logs/live`: the first poll carries the lines so far; every next poll (both apps poll every 2 s) answers
 * the same offset with no new lines, so the console never grows between two shots.
 */
export function deployLiveHandlers (id: number): Record<string, Handler> {
  const stages = [LOG_STAGES[0]!, { name: 'cloning', started_at: UNIX_NOW - 880, finished_at: null }]
  const engine = (lines: unknown[]) => ({ status: 'running', stage: 'cloning', stages, lines, next_offset: 2 })
  return {
    [`GET /projects/${id}/deploy-logs/live`]: [
      { json: { data: { panel: { id: 32 }, engine: engine(LOG_LINES.slice(0, 2)) } } },
      { json: { data: { panel: { id: 32 }, engine: engine([]) } } },
    ],
  }
}

/** Drags a file over the list: `dragenter` on the drop zone with a `Files` data transfer (both apps listen on the zone element). */
export const dragFilesOver: StateAction = async page => {
  await page.evaluate(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['x'], 'site.zip', { type: 'application/zip' }))
    const zone = document.querySelector('.instances-drop-zone')!
    zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  })
  await settled(page.locator('.instances-drop-overlay'))
}

export const dropZoneProbes: Probe[] = [
  {
    key: 'drop-zone',
    legacy: page => page.locator('.instances-drop-zone'),
    next: page => page.getByTestId('instances-drop-zone'),
  },
  {
    key: 'drop-overlay',
    legacy: page => page.locator('.instances-drop-overlay'),
    next: page => page.getByTestId('instances-drop-overlay'),
  },
  {
    key: 'drop-overlay-title',
    legacy: page => page.locator('.instances-drop-overlay__title'),
    next: page => page.getByTestId('instances-drop-overlay-title'),
  },
  {
    key: 'drop-overlay-icon',
    legacy: page => page.locator('.instances-drop-overlay .v-icon'),
    next: page => page.getByTestId('instances-drop-overlay').locator('.v-icon'),
    internal: true,
  },
]

/** Hovers the status indicator of card `index` and waits for the issues menu (both apps open it on hover). */
export function openIssueMenu (index: number): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      await page.locator('.data-iterator-card').nth(index).locator('.status-indicator-container').hover()
      await page.locator('.v-menu__content.menuable__content__active').waitFor()
      await settled(page.locator('.v-menu__content.menuable__content__active .status-list__issue-action').first())
    },
    next: async page => {
      await page.locator('.data-iterator-card').nth(index).locator('.status-indicator-container').first().hover()
      await page.locator('.status-indicator-menu').waitFor()
      await settled(page.locator('.status-indicator-menu .status-list__issue-action').first())
    },
  }
}

/** Opens the issues menu of card `index`, then the resolve dialog of its `issue`-th issue (0 missing index, 1 wrong port). */
export function openResolveModal (index: number, issue: number): { legacy: StateAction, next: StateAction } {
  const menu = openIssueMenu(index)
  return {
    legacy: async page => {
      await menu.legacy(page)
      await page.locator('.v-menu__content.menuable__content__active .status-list__issue-action').nth(issue).click()
      await settled(page.locator('.v-dialog--active .basic-modal'))
    },
    next: async page => {
      await menu.next(page)
      await page.locator('.status-indicator-menu .status-list__issue-action').nth(issue).click()
      await settled(page.getByTestId('issue-resolve-modal'))
    },
  }
}

/** The resolve dialog: card, titles, the solution list and the widget below the selected one, and the Resolve button. */
export const resolveModalProbes: Probe[] = [
  {
    key: 'resolve-modal',
    legacy: page => page.locator('.v-dialog--active .basic-modal'),
    next: page => page.getByTestId('issue-resolve-modal'),
  },
  {
    key: 'resolve-title',
    legacy: page => page.locator('.v-dialog--active .basic-modal .v-card__title h5'),
    next: page => page.getByTestId('issue-resolve-modal').locator('.v-card-title h5'),
    internal: true,
  },
  {
    key: 'resolve-radio-1',
    legacy: page => page.locator('.v-dialog--active .basic-modal .radio-container').first(),
    next: page => page.getByTestId('issue-resolve-modal').locator('.radio-container').first(),
    internal: true,
  },
  {
    key: 'resolve-radio-2',
    legacy: page => page.locator('.v-dialog--active .basic-modal .radio-container').nth(1),
    next: page => page.getByTestId('issue-resolve-modal').locator('.radio-container').nth(1),
    internal: true,
  },
  {
    key: 'resolve-widget',
    legacy: page => page.locator('.v-dialog--active .basic-modal .option-sub'),
    next: page => page.getByTestId('issue-resolve-modal').locator('.option-sub'),
    internal: true,
  },
  {
    key: 'resolve-submit',
    legacy: page => page.locator('.v-dialog--active .basic-modal .v-card__actions .v-btn').last(),
    next: page => page.getByTestId('issue-resolve-submit'),
  },
  {
    key: 'resolve-submit-label',
    legacy: page => page.locator('.v-dialog--active .basic-modal .v-card__actions .v-btn').last().locator('.v-btn__content > span'),
    next: page => page.getByTestId('issue-resolve-submit').locator('.v-btn__content > span'),
    internal: true,
  },
  {
    key: 'resolve-cancel',
    legacy: page => page.locator('.v-dialog--active .basic-modal .v-card__actions .v-btn').first(),
    next: page => page.getByTestId('issue-resolve-modal').locator('.v-card-actions .v-btn').first(),
    internal: true,
  },
]

/** The archive drop area of the "upload a new version" solution (icon, title, hint). */
export const resolveUploadWidgetProbes: Probe[] = [
  {
    key: 'resolve-widget-title',
    legacy: page => page.locator('.v-dialog--active .basic-modal .option-sub .drop-zone__title'),
    next: page => page.getByTestId('issue-resolve-modal').locator('.option-sub .drop-zone__title'),
    internal: true,
  },
  {
    key: 'resolve-widget-hint',
    legacy: page => page.locator('.v-dialog--active .basic-modal .option-sub .drop-zone p').last(),
    next: page => page.getByTestId('issue-resolve-modal').locator('.option-sub .drop-zone p').last(),
    internal: true,
  },
  {
    key: 'resolve-widget-icon',
    legacy: page => page.locator('.v-dialog--active .basic-modal .option-sub .drop-zone .v-icon'),
    next: page => page.getByTestId('issue-resolve-modal').locator('.option-sub .drop-zone .v-icon'),
    internal: true,
  },
]

/** Picks the second solution of the open resolve dialog (its radio), and waits for the widget below it. */
export const pickSecondSolution: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.v-dialog--active .basic-modal .radio-container').nth(1).click()
    await settled(page.locator('.v-dialog--active .basic-modal .option-sub'))
  },
  next: async page => {
    await page.getByTestId('issue-resolve-modal').locator('.radio-container').nth(1).click()
    await settled(page.getByTestId('issue-resolve-modal').locator('.option-sub'))
  },
}

const ARCHIVE = { name: 'site.zip', mimeType: 'application/zip', buffer: Buffer.from('PK') }

/** Chooses an archive in the upload widget of the open dialog and clicks Resolve; `after` waits for what the answer shows. */
export function resolveWithArchive (after: StateAction): { legacy: StateAction[], next: StateAction[] } {
  return {
    legacy: [
      async page => {
        await page.locator('.v-dialog--active .basic-modal input[type=file]').setInputFiles(ARCHIVE)
        // On mobile the hover menu of the issue stays under the pointer in next and covers Resolve (V2 closed it): leave it first.
        await page.mouse.move(0, 0)
        await page.locator('.v-dialog--active .basic-modal .v-card__actions .v-btn').last().click()
      },
      after,
    ],
    next: [
      async page => {
        await page.getByTestId('issue-resolve-modal').locator('input[type=file]').setInputFiles(ARCHIVE)
        await page.mouse.move(0, 0)
        await page.getByTestId('issue-resolve-submit').click()
      },
      after,
    ],
  }
}

/** The error alert of the shell: it closes itself after 5 s unless the pointer is over it, so the action hovers it and the state keeps the pointer. */
export const hoverErrorAlert: StateAction = async page => {
  const alert = page.locator('.alert-manager .alert--error')
  await settled(alert)
  await alert.locator('.alert__text-box').hover()
}

export const errorAlertProbes: Probe[] = [
  { key: 'alert', legacy: page => page.locator('.alert-manager .alert--error'), next: page => page.locator('.alert-manager .alert--error') },
  {
    key: 'alert-text',
    legacy: page => page.locator('.alert-manager .alert--error .alert__text-box p').nth(1),
    next: page => page.locator('.alert-manager .alert--error .alert__text-box p').nth(1),
    internal: true,
  },
]

// ---------------------------------------------------------------------------------------------
// Row kebab and its simple actions (S-09b Phase 1)
// ---------------------------------------------------------------------------------------------

/** Gives every item (and its staging apps) the plan flag the Copy item reads (`plan_settings.copy_instance_allowed`). */
export function withCopyAllowed (items: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const allow = (item: Record<string, unknown>): Record<string, unknown> => ({
    ...item,
    plan_settings: { copy_instance_allowed: true },
    staging_apps: ((item.staging_apps ?? []) as Array<Record<string, unknown>>).map(child => allow(child)),
  })
  return items.map(item => allow(item))
}

/** The table set (item 4 `Studio` has the staging sub-row 41) with the Copy flag on: every kebab item shows for the owner. */
export function menuInstances (): Array<Record<string, unknown>> {
  return withCopyAllowed(listInstances())
}

/** An instance whose installation failed: the menu offers Try again and Cancel installation only. */
export function failedInstance (id: number, name = 'Install Failed'): Record<string, unknown> {
  return pendingInstance(id, name, 'failed')
}

/** An instance the user may only see and manage: no WP Admin, staging, copy, update, clear cache or delete. */
export function limitedInstance (id: number, name = 'Limited Access'): Record<string, unknown> {
  const slug = name.toLowerCase().replaceAll(' ', '-')
  return rawInstance(id, {
    name,
    url: `https://${slug}.example.com`,
    domain: `${slug}.example.com`,
    privileges: ['general.manage_labels'],
    plan_settings: { copy_instance_allowed: true },
  })
}

const LEGACY_MENU = '.v-menu__content.menuable__content__active'
const NEXT_MENU = 'instance-item-menu'

/** Clicks the kebab of table row `id` (`#instance-item-<id>` in both apps) and waits for the menu. */
export function openRowMenu (id: number): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      await page.locator(`#instance-item-${id}`).click()
      await settled(page.locator(LEGACY_MENU))
    },
    next: async page => {
      await page.locator(`#instance-item-${id}`).click()
      await settled(page.getByTestId(NEXT_MENU))
    },
  }
}

/**
 * Opens the kebab of row `id`, picks the item `label` and waits for the dialog of the mass actions kit (`.v-dialog--active .v-card` /
 * `instances-modal`). E1: legacy never closes the menu, so it stays under the scrim; next closes it once the dialog opens. The legacy
 * side hides the stale menu, so the shot compares the dialog only.
 */
export function openRowAction (id: number, label: string): { legacy: StateAction, next: StateAction } {
  const menu = openRowMenu(id)
  return {
    legacy: async page => {
      await menu.legacy(page)
      await page.locator(LEGACY_MENU).getByText(label, { exact: true }).click()
      await settled(page.locator('.v-dialog--active .v-card').first())
      await page.evaluate(() => {
        for (const element of document.querySelectorAll<HTMLElement>('.menuable__content__active')) {
          element.style.display = 'none'
        }
      })
    },
    next: async page => {
      await menu.next(page)
      await page.getByTestId(NEXT_MENU).getByText(label, { exact: true }).click()
      await settled(page.getByTestId('instances-modal'))
    },
  }
}

/** The open row menu: the content, its list and the first, second and last item. */
export const rowMenuProbes: Probe[] = [
  {
    key: 'row-menu',
    legacy: page => page.locator(LEGACY_MENU),
    next: page => page.getByTestId(NEXT_MENU),
  },
  {
    key: 'row-menu-list',
    legacy: page => page.locator(`${LEGACY_MENU} .v-list`),
    next: page => page.getByTestId(NEXT_MENU).locator('.v-list'),
    internal: true,
  },
  {
    key: 'row-menu-item-1',
    legacy: page => page.locator(`${LEGACY_MENU} .v-list-item`).first(),
    next: page => page.getByTestId(NEXT_MENU).locator('.v-list-item').first(),
    internal: true,
  },
  {
    key: 'row-menu-item-2',
    legacy: page => page.locator(`${LEGACY_MENU} .v-list-item`).nth(1),
    next: page => page.getByTestId(NEXT_MENU).locator('.v-list-item').nth(1),
    internal: true,
  },
  {
    key: 'row-menu-item-last',
    legacy: page => page.locator(`${LEGACY_MENU} .v-list-item`).last(),
    next: page => page.getByTestId(NEXT_MENU).locator('.v-list-item').last(),
    internal: true,
  },
]

// ---------------------------------------------------------------------------------------------
// Update and copy (S-09b Phase 2)
// ---------------------------------------------------------------------------------------------

/** `GET /instances/<id>/wordpress/updates`: the versions the update dialog offers (the first one is preselected). */
export function updatesHandler (id: number, availableUpdates: string[]): Record<string, Handler> {
  return {
    [`GET /instances/${id}/wordpress/updates`]: { json: { data: { wp_version: '6.4.0', available_updates: availableUpdates } } },
  }
}

/** The `/home` services of the copy states: a plain plan and one with a user configurable option (region). */
export const copyServices = [
  {
    id: 10,
    plan_name: 'Starter',
    instance_count: 1,
    instance_limit: 5,
    hosting_accounts: [{ domain: 'starter.example.com' }],
    onboarding: { user_configurable_options: [] },
  },
  {
    id: 11,
    plan_name: 'Pro',
    instance_count: 2,
    instance_limit: 9,
    hosting_accounts: [{ domain: 'pro.example.com' }],
    onboarding: { user_configurable_options: [{ name: 'region', type: 'select' }] },
  },
]

/** `home` with the copy services (arrays replace the base ones). */
export function copyHome (): Record<string, unknown> {
  return shellHome({ user: { services: copyServices } })
}

/** `GET /services/11/instance-options`: the values of the `region` option (step 2 of the copy dialog). */
export const copyOptionsHandler: Record<string, Handler> = {
  'GET /services/11/instance-options': {
    json: { data: { user_configurable_options: { region: [{ text: 'Europe', value: 'eu' }, { text: 'United States', value: 'us' }] } } },
  },
}

/** The first select and the first checkbox of the dialog form (the update and copy dialogs). */
export const modalFormProbes: Probe[] = [
  {
    key: 'modal-select',
    legacy: page => page.locator('.v-dialog--active .v-card__text .v-select').first(),
    next: page => page.getByTestId('instances-modal').locator('.v-card-text .v-select').first(),
    internal: true,
  },
  {
    key: 'modal-checkbox-1',
    legacy: page => page.locator('.v-dialog--active .v-card__text .checkbox').first(),
    next: page => page.getByTestId('instances-modal').locator('.v-card-text .checkbox').first(),
    internal: true,
  },
]

/** Step 1 of the copy dialog -> choose the service `label` in the select and press Copy; waits for step 2 (the region value). */
export function chooseCopyService (label: string): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      await page.locator('.v-dialog--active .v-card__text .v-select').first().click({ timeout: 8000 })
      await page.locator('.menuable__content__active .v-list-item').filter({ hasText: label }).first().click({ timeout: 8000 })
      await page.locator('.v-dialog--active .v-card__actions .v-btn').first().click({ timeout: 8000 })
      await page.locator('.v-dialog--active .v-card__text .v-select', { hasText: 'Europe' }).first().waitFor({ timeout: 8000 })
    },
    next: async page => {
      await page.getByTestId('instances-modal').locator('.v-card-text .v-select').first().click({ timeout: 8000 })
      await page.locator('.v-overlay-container .v-list-item').filter({ hasText: label }).first().click({ timeout: 8000 })
      await page.getByTestId('instances-modal').locator('.v-card-actions .v-btn').first().click({ timeout: 8000 })
      await page.getByTestId('instances-modal').locator('.v-card-text .v-select', { hasText: 'Europe' }).first().waitFor({ timeout: 8000 })
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Push to live (S-09b Phase 3)
// ---------------------------------------------------------------------------------------------

/**
 * Legacy cannot open the push dialog from its list (the kebab item is a no-op), only from the instance page of the staging
 * instance (top bar `button.pushToLive`). So the legacy side opens `/instances/41/general`, and next opens the same dialog from the
 * kebab of the staging sub-row (D7, exception E7). Both sides then hide the page behind the dialog (the page differs), and the
 * shot compares the dialog on a bare background.
 */
export const pushStaging = rawInstance(41, {
  name: 'Studio staging',
  url: 'https://staging.studio.example.com',
  domain: 'staging.studio.example.com',
  staging: true,
  // The legacy mapper builds the parent resource too (`instanceResource(app.parent_app)`), so it needs the full item.
  parent_app: rawInstance(4, { name: 'Studio', url: 'https://studio.example.com', domain: 'studio.example.com' }),
  privileges: OWNER_PRIVILEGES,
})

/** `GET /instances/41` (the legacy instance page) and the diff of the push dialog. */
export function pushHandlers (diff: Handler): Record<string, Handler> {
  return {
    'GET /instances/41': { json: { data: pushStaging } },
    'GET /instances/41/push-to-live': diff,
    // The legacy instance page reads the automatic backup flag of the staging instance.
    'GET /instances/41/wordpress/automatic-backup': { json: { data: { enabled: false } } },
  }
}

export const pushDiff: Handler = {
  json: { data: { tables_structure_diff: ['wp_options', 'wp_postmeta'], tables_data_diff: ['wp_posts', 'wp_comments', 'wp_users'] } },
}

/** Hides everything but the open dialog: legacy keeps the page in `.v-application--wrap`, next in `.v-application__wrap`. */
async function hidePageBehindDialog (page: Page, selector: string): Promise<void> {
  await page.addStyleTag({ content: `${selector} { display: none !important; }` })
}

export function openPushDialog (until: 'loading' | 'form'): { legacy: StateAction, next: StateAction } {
  const ready = (modal: Locator) => until === 'loading'
    ? modal.getByText(tr('heading.instance.pushToLoadingState.messageTitle'))
    : modal.locator('.checkbox').first()
  return {
    legacy: async page => {
      await page.locator('a[href="/instances/41/general"]').first().click()
      await page.waitForURL(/\/instances\/41\/general/)
      await page.getByRole('button', { name: tr('button.pushToLive') }).locator('visible=true').first().click({ timeout: 15_000 })
      await settled(ready(page.locator('.v-dialog--active .v-card')))
      await hidePageBehindDialog(page, '.v-application--wrap')
    },
    next: async page => {
      await openRowMenu(41).next(page)
      await page.getByTestId(NEXT_MENU).getByText(tr('button.pushToLive'), { exact: true }).click()
      await settled(ready(page.getByTestId('instances-modal')))
      await hidePageBehindDialog(page, '.v-application__wrap')
    },
  }
}

/** The push dialog without a form: the card, title, icon, close and buttons. */
export const pushLoadingProbes: Probe[] = [
  ...modalProbes.filter(probe => probe.key !== 'modal-message'),
  {
    key: 'modal-text',
    legacy: page => page.locator('.v-dialog--active .v-card__text'),
    next: page => page.getByTestId('instances-modal').locator('.v-card-text'),
    internal: true,
  },
]

/** The push dialog with its form: the loading probes and the first checkbox. */
export const pushProbes: Probe[] = [...pushLoadingProbes, modalFormProbes[1]!]

// ---------------------------------------------------------------------------------------------
// WP Admin SSO (S-09b Phase 4)
// ---------------------------------------------------------------------------------------------

/** `GET /instances/<id>/wordpress/users?role=administrator&for_sso=1` (the query string is not part of the handler key). */
export function ssoUsersHandler (id: number, users: Array<Record<string, unknown>>): Record<string, Handler> {
  return { [`GET /instances/${id}/wordpress/users`]: { json: { data: users } } }
}

export const ssoUsers = [
  { id: 11, display_name: 'Jane Doe', user_email: 'jane@example.com' },
  { id: 12, display_name: 'John Roe', user_email: 'john@example.com' },
]

/** The table set with the url of row `id` an IP: legacy and next skip the DNS check for it (`hasIpAddressInUrl`), so no mismatch. */
export function ssoInstances (id: number): Array<Record<string, unknown>> {
  return menuInstances().map(item => item.id === id ? { ...item, url: 'https://203.0.113.20' } : item)
}

/** Replaces `window.open` with a popup blocker (answers `null`) before the click that submits; both apps call the global. */
export const blockPopups: StateAction = async page => {
  await page.evaluate(() => {
    window.open = () => null
  })
}

export const SSO_LEGACY = '.v-dialog--active .basic-modal'

/**
 * Opens the kebab of row `id`, picks WP Admin and waits for the SSO dialog (`ready` is a selector inside the card on each side).
 * E1: legacy never closes the menu, so the stale one is hidden and the shot compares the dialog only.
 */
export function openWpAdminSso (id: number, ready: { legacy: string, next: string }): { legacy: StateAction, next: StateAction } {
  const menu = openRowMenu(id)
  return {
    legacy: async page => {
      await menu.legacy(page)
      await page.locator(LEGACY_MENU).getByText(tr('button.wpAdmin'), { exact: true }).click()
      await settled(page.locator(`${SSO_LEGACY} ${ready.legacy}`).first())
      await page.evaluate(() => {
        for (const element of document.querySelectorAll<HTMLElement>('.menuable__content__active')) {
          element.style.display = 'none'
        }
      })
    },
    next: async page => {
      await menu.next(page)
      await page.getByTestId(NEXT_MENU).getByText(tr('button.wpAdmin'), { exact: true }).click()
      await settled(page.getByTestId('sso-modal').locator(ready.next).first())
    },
  }
}

/** Clicks the first action button of the open SSO dialog (Generate link, or the temporary URL one). */
export const submitSso: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator(`${SSO_LEGACY} .v-card__actions .v-btn`).first().click()
  },
  next: async page => {
    await page.getByTestId('sso-modal').locator('.v-card-actions .v-btn').first().click()
  },
}

function ssoProbe (key: string, legacy: string, next: string): Probe {
  return {
    key,
    legacy: page => page.locator(`${SSO_LEGACY} ${legacy}`).first(),
    next: page => page.getByTestId('sso-modal').locator(next).first(),
    internal: true,
  }
}

/** The SSO dialog card, its title, icon, close button and the Cancel button (the last of the action row). */
export const ssoBaseProbes: Probe[] = [
  {
    key: 'sso-modal',
    legacy: page => page.locator(SSO_LEGACY),
    next: page => page.getByTestId('sso-modal'),
  },
  ssoProbe('sso-title', '.v-card__title', '.v-card-title'),
  ssoProbe('sso-title-icon', '.v-card__title .v-icon', '.v-card-title .v-icon'),
  ssoProbe('sso-close', '.v-card__title .v-btn .v-icon', '.v-card-title .v-btn .v-icon'),
  {
    key: 'sso-cancel',
    legacy: page => page.locator(`${SSO_LEGACY} .v-card__actions .v-btn`).last(),
    next: page => page.getByTestId('sso-modal').locator('.v-card-actions .v-btn').last(),
    internal: true,
  },
]

/** The user select with its label (more than one user). */
export const ssoSelectProbes: Probe[] = [
  ssoProbe('sso-label', 'label.base--text', 'label.base--text'),
  ssoProbe('sso-select', '.v-select', '.v-select'),
]

export const ssoAlertProbe: Probe = ssoProbe('sso-alert', '.warning-box', '.warning-box')

export const ssoMessageProbe: Probe = ssoProbe('sso-message', '.v-card__text p', '.v-card-text p')

/** The `index`-th button of the action row (0 = the primary one). */
export function ssoButtonProbe (index: number): Probe {
  return {
    key: `sso-button-${index + 1}`,
    legacy: page => page.locator(`${SSO_LEGACY} .v-card__actions .v-btn`).nth(index),
    next: page => page.getByTestId('sso-modal').locator('.v-card-actions .v-btn').nth(index),
    internal: true,
  }
}

// ---------------------------------------------------------------------------------------------
// Create staging (S-09b Phase 5)
// ---------------------------------------------------------------------------------------------

/** The table set with the staging settings of row `id` (`plan_settings` / `server_settings` replace the item's own). */
export function stagingInstances (
  id: number,
  settings: { plan?: Record<string, unknown>, server?: Record<string, unknown> } = {},
): Array<Record<string, unknown>> {
  return menuInstances().map(item => item.id === id
    ? {
        ...item,
        plan_settings: { copy_instance_allowed: true, domain_for_staging: { type: 'same_domain' }, ...settings.plan },
        server_settings: { uses_own_backup_system: false, ...settings.server },
      }
    : item)
}

const GB = 1024 ** 3
const MB = 1024 ** 2

/** `GET /instances/<id>/staging/pre-check-disk-usage`: room for everything, or (`low`) too little for the WordPress files. */
export function stagingUsageHandler (id: number, low = false): Record<string, Handler> {
  return {
    [`GET /instances/${id}/staging/pre-check-disk-usage`]: {
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
 * Opens the kebab of row `id`, picks Staging and waits for the dialog (`ready` is a selector inside the card on each side).
 * E1: legacy keeps the menu under the scrim, so the stale one is hidden and the shot compares the dialog only.
 */
export function openStagingModal (id: number, ready: { legacy: string, next: string }): { legacy: StateAction, next: StateAction } {
  const menu = openRowMenu(id)
  return {
    legacy: async page => {
      await menu.legacy(page)
      await page.locator(LEGACY_MENU).getByText(tr('button.staging'), { exact: true }).click()
      await settled(page.locator(`${SSO_LEGACY} ${ready.legacy}`).first())
      await page.evaluate(() => {
        for (const element of document.querySelectorAll<HTMLElement>('.menuable__content__active')) {
          element.style.display = 'none'
        }
      })
    },
    next: async page => {
      await menu.next(page)
      await page.getByTestId(NEXT_MENU).getByText(tr('button.staging'), { exact: true }).click()
      await settled(page.getByTestId('staging-modal').locator(ready.next).first())
    },
  }
}

function stagingProbe (key: string, legacy: string, next: string): Probe {
  return {
    key,
    legacy: page => page.locator(`${SSO_LEGACY} ${legacy}`).first(),
    next: page => page.getByTestId('staging-modal').locator(next).first(),
    internal: true,
  }
}

/** The card, its h5 title with the icon and the close button, the domain label and the two action buttons. */
export const stagingBaseProbes: Probe[] = [
  {
    key: 'staging-modal',
    legacy: page => page.locator(SSO_LEGACY),
    next: page => page.getByTestId('staging-modal'),
  },
  stagingProbe('staging-title', '.v-card__title', '.v-card-title'),
  stagingProbe('staging-title-icon', '.v-card__title .v-icon', '.v-card-title .v-icon'),
  stagingProbe('staging-close', '.v-card__title .v-btn .v-icon', '.v-card-title .v-btn .v-icon'),
  stagingProbe('staging-label', 'label.base--text', 'label.base--text'),
  stagingProbe('staging-submit', '.v-card__actions .v-btn', '.v-card-actions .v-btn'),
  {
    key: 'staging-cancel',
    legacy: page => page.locator(`${SSO_LEGACY} .v-card__actions .v-btn`).last(),
    next: page => page.getByTestId('staging-modal').locator('.v-card-actions .v-btn').last(),
    internal: true,
  },
]

export const stagingSelectInputProbe: Probe = stagingProbe('staging-domain', '.text-select-input', '.text-select-input')

export const stagingTextFieldProbe: Probe = stagingProbe('staging-domain', '.v-text-field', '.v-text-field')

/** The disk list (three rows) and the skip-uploads checkbox. */
export const stagingDiskProbes: Probe[] = [
  stagingProbe('staging-disk-list', '.v-card__text ul', '.v-card-text ul'),
  stagingProbe('staging-disk-item', '.v-card__text li', '.v-card-text li'),
  stagingProbe('staging-skip-uploads', '.v-card__text .checkbox', '.v-card-text .checkbox'),
]

export const stagingBillableProbe: Probe = stagingProbe('staging-billable', '.alert', '.alert')

export const stagingSkeletonProbe: Probe = stagingProbe('staging-skeleton', '.v-skeleton-loader', '.v-skeleton-loader')

// ---------------------------------------------------------------------------------------------
// Installation flows (S-09b Phase 6): cancel installation / import and the import details
// ---------------------------------------------------------------------------------------------

/** `import_details` of a running or failed import: three steps in three statuses and the current step. */
export function importDetails (failed: boolean): Record<string, unknown> {
  return {
    message: 'The migration plugin lost the connection to the source site.',
    steps: {
      installNewInstance: 'completed',
      migrateFilesUsingPlugin: failed ? 'failed' : 'in-progress',
      migrateDatabaseUsingPlugin: 'not-started',
    },
    current_step: { name: 'migrateFilesUsingPlugin', percent: 40, current_item: 'wp-content/uploads/2026/archive.zip' },
  }
}

const CARD_DIALOG_LEGACY = '.v-dialog--active .v-card'

/**
 * Hovers the first card, clicks the overlay button labelled `label` and waits for the dialog (the cancel dialog or the import details).
 * The legacy dialog sits in the card's own component (`.v-dialog--active`); next hosts one in the view.
 */
export function openCardDialog (label: string, nextTestId: string): { legacy: StateAction, next: StateAction } {
  const hover = hoverCard(0)
  return {
    legacy: async page => {
      await hover.legacy(page)
      await page.locator('.data-iterator-card').nth(0).locator('.instance-actions__content').getByText(label, { exact: true }).click()
      await settled(page.locator(CARD_DIALOG_LEGACY))
    },
    next: async page => {
      await hover.next(page)
      await page.getByTestId('instance-card').nth(0).getByTestId('instance-actions').getByText(label, { exact: true }).click()
      await settled(page.getByTestId(nextTestId))
    },
  }
}

function cardDialogProbe (key: string, legacy: string, next: string, nextTestId: string): Probe {
  return {
    key,
    legacy: page => page.locator(`${CARD_DIALOG_LEGACY} ${legacy}`).first(),
    next: page => page.getByTestId(nextTestId).locator(next).first(),
    internal: true,
  }
}

/** The cancel dialog: card, title with its icon, X, description, "Confirm action" heading, checkbox row, red button and resume button. */
export const cancelDialogProbes: Probe[] = [
  {
    key: 'cancel-dialog',
    legacy: page => page.locator(CARD_DIALOG_LEGACY),
    next: page => page.getByTestId('cancel-install-dialog'),
  },
  cardDialogProbe('cancel-title', '.v-card__title', '.v-card-title', 'cancel-install-dialog'),
  cardDialogProbe('cancel-title-icon', '.v-card__title .v-icon', '.v-card-title .v-icon', 'cancel-install-dialog'),
  cardDialogProbe('cancel-close', '.v-card__title .v-btn', '.v-card-title .v-btn', 'cancel-install-dialog'),
  cardDialogProbe('cancel-desc', '.v-card__text p', '.v-card-text p', 'cancel-install-dialog'),
  cardDialogProbe('cancel-confirm-heading', '.v-card__text h4', '.v-card-text h4', 'cancel-install-dialog'),
  cardDialogProbe('cancel-checkbox', '.v-card__text .checkbox', '.v-card-text .checkbox', 'cancel-install-dialog'),
  cardDialogProbe('cancel-submit', '.v-card__actions .v-btn', '.v-card-actions .v-btn', 'cancel-install-dialog'),
  {
    key: 'cancel-resume',
    legacy: page => page.locator(`${CARD_DIALOG_LEGACY} .v-card__actions .v-btn`).last(),
    next: page => page.getByTestId('cancel-install-dialog').locator('.v-card-actions .v-btn').last(),
    internal: true,
  },
]

/** The import details: card, title with its icon, X, the progress well or the error alert, the step table and its buttons. */
export function importDetailsProbes (failed: boolean): Probe[] {
  const id = 'import-details-modal'
  return [
    {
      key: 'import-modal',
      legacy: page => page.locator(CARD_DIALOG_LEGACY),
      next: page => page.getByTestId(id),
    },
    cardDialogProbe('import-title', '.v-card__title', '.v-card-title', id),
    cardDialogProbe('import-title-icon', '.v-card__title .v-icon', '.v-card-title .v-icon', id),
    cardDialogProbe('import-close', '.v-card__title .v-btn', '.v-card-title .v-btn', id),
    failed
      ? cardDialogProbe('import-error', '.alert', '.alert', id)
      : cardDialogProbe('import-well', '.well', '.well', id),
    ...(failed ? [] : [cardDialogProbe('import-progress', '.well .v-progress-linear', '.well .v-progress-linear', id)]),
    cardDialogProbe('import-table', '.v-data-table', '.v-data-table', id),
    cardDialogProbe('import-row', 'tbody tr', 'tbody tr', id),
    cardDialogProbe('import-chip', '.v-chip', '.v-chip', id),
    cardDialogProbe('import-primary', '.v-card__actions .v-btn', '.v-card-actions .v-btn', id),
    {
      key: 'import-last-button',
      legacy: page => page.locator(`${CARD_DIALOG_LEGACY} .v-card__actions .v-btn`).last(),
      next: page => page.getByTestId(id).locator('.v-card-actions .v-btn').last(),
      internal: true,
    },
  ]
}

// ---------------------------------------------------------------------------------------------
// S-09c phase 4: preview site, collaborate, the DNS / SSL indicator and its Fix DNS dialog
// ---------------------------------------------------------------------------------------------

/** `dns_settings` of a card that checks DNS: the A record must match, and `DnsOptions` lists the A record panel. */
export const DNS_SETTINGS = { verification_methods: ['resolve_a_record'], verification_mode: 'any', display_options: ['a_records'], valid_cname_addresses: [] }

/** `dns.google` has no record for the query: the default answer of every host, written out where a state relies on it. */
export const NO_DNS_RECORD: Handler = { json: { Status: 3 } }

/** `dns.google` answers the A query with `ip` and every other query with no record, so the card's A record check passes. */
export function aRecordAnswer (ip: string): Handler {
  return (context: HandlerContext) => context.query.get('type') === '1'
    ? { json: { Status: 0, Answer: [{ name: `${context.query.get('name') ?? ''}.`, type: 1, data: ip }] } }
    : { json: { Status: 3 } }
}

/** The menu and copy states are measured on desktop (hover); on a touch viewport their steps do nothing, so the probes skip too. */
export function isDesktopViewport (page: Page): boolean {
  return (page.viewportSize()?.width ?? 1440) >= 976
}

// Preview site (`PreviewSiteButton` and `PreviewSiteModal`)

export const PREVIEW_URL = 'https://acme-blog-preview.example.com/?token=a1b2c3'

/**
 * Acme Blog as a live site: an IP host and no certificate, so the card checks DNS, the check fails (no record) and the card shows
 * "Preview site" (`dns-propagation-in-progress`). The screenshot keeps the card from flapping behind the modal.
 */
export function previewItem (): Record<string, unknown> {
  return rawInstance(1, {
    name: 'Acme Blog',
    url: 'https://acme-blog.example.com',
    domain: 'acme-blog.example.com',
    screenshot_time: UNIX_NOW - 7200,
    host_ip_address: '203.0.113.10',
    host_ipv4_addresses: ['203.0.113.10'],
    domain_ssl_details: null,
    dns_settings: DNS_SETTINGS,
  })
}

/** `POST /instances/1/preview`: the temporary URL, answered as `data.preview_site` (the legacy modal reads it so). */
export const previewHandlers: Record<string, Handler> = {
  'POST /instances/1/preview': { json: { data: { preview_site: { url: PREVIEW_URL, valid_until: inDays(1) } } } },
}

export const previewExternal = { 'dns.google': NO_DNS_RECORD }

export const previewButtonProbe: Probe = {
  key: 'preview-button',
  legacy: page => page.locator('.preview-btn'),
  next: page => page.locator('.preview-btn'),
  internal: true,
}

/** A probe inside the preview modal: the legacy dialog card, or the next card with `preview-site-modal`. */
function previewProbe (key: string, find: (modal: Locator) => Locator, internal = false): Probe {
  return {
    key,
    internal,
    legacy: page => find(page.locator('.v-dialog--active .v-card')),
    next: page => find(page.getByTestId('preview-site-modal')),
  }
}

/** The modal before the temporary URL is requested: the card, its title, the message and the get button. */
export const previewBaseProbes: Probe[] = [
  previewProbe('preview-modal', modal => modal),
  previewProbe('preview-title', modal => modal.getByRole('heading', { name: tr('heading.instance.modal.previewSite.title'), exact: true }), true),
  previewProbe('preview-message', modal => modal.getByText(tr('heading.instance.modal.previewSite.message'), { exact: true })),
]

export const previewGetProbe: Probe = previewProbe('preview-get', modal => modal.getByRole('button', { name: tr('button.temporaryUrl.get'), exact: true }))

/** The modal once the URL is there: the URL box, "Copy URL" and "Visit site". The get button is gone by then. */
export const previewUrlProbes: Probe[] = [
  previewProbe('preview-url', modal => modal.locator('.temporary-url'), true),
  previewProbe('preview-copy', modal => modal.getByRole('button', { name: tr('button.copyUrl'), exact: true })),
  previewProbe('preview-visit', modal => modal.getByRole('link', { name: tr('button.visitSite'), exact: true })),
]

/** Clicks "Preview site" under the card (it shows once the card has checked DNS) and waits for the modal. */
export const openPreviewSite: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.getByText(tr('button.previewSite'), { exact: true }).click()
    await settled(page.locator('.v-dialog--active .v-card'))
  },
  next: async page => {
    await page.getByText(tr('button.previewSite'), { exact: true }).click()
    await settled(page.getByTestId('preview-site-modal'))
  },
}

/** Clicks "Get temporary URL" in the modal and waits for the URL box. */
export const requestPreviewUrl: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.v-dialog--active .v-card').getByRole('button', { name: tr('button.temporaryUrl.get'), exact: true }).click()
    // "Copy URL" appears with the URL box in both apps; the URL span itself is hidden at the mobile width in one of them.
    await settled(page.locator('.v-dialog--active .v-card').getByRole('button', { name: tr('button.copyUrl'), exact: true }))
  },
  next: async page => {
    await page.getByTestId('preview-site-modal').getByRole('button', { name: tr('button.temporaryUrl.get'), exact: true }).click()
    await settled(page.getByTestId('preview-site-modal').getByRole('button', { name: tr('button.copyUrl'), exact: true }))
  },
}

// The copy tooltip: legacy `CopyTextCustomButton` hardcodes its English strings, next reads `tooltip.copy` / `tooltip.copied`.
const COPY_TOOLTIP = { legacy: { idle: 'Click to copy', copied: 'Copied' }, next: { idle: tr('tooltip.copy'), copied: tr('tooltip.copied') } }
const copyButtonName = tr('button.copyUrl')

/** The copy tooltip: the `v-menu` both kits open from `CopyTextCustomButton` (content class `menu-tooltip`). */
export const copyMenuProbe: Probe = {
  key: 'copy-menu',
  legacy: page => page.locator('.menu-tooltip'),
  next: page => page.locator('.menu-tooltip'),
  internal: true,
  when: isDesktop,
}

/** Hovers "Copy URL" and waits for the tooltip. The DOM is awaited, not visibility: the deployed legacy hides `.v-tooltip` menus (login states). */
export const hoverCopyUrl: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    if (!isDesktopViewport(page)) {
      return
    }
    await page.getByRole('button', { name: copyButtonName, exact: true }).hover()
    await expect(page.locator('.menu-tooltip')).toHaveClass(/menuable__content__active/)
    await expect(page.locator('.menu-tooltip')).toHaveText(COPY_TOOLTIP.legacy.idle)
  },
  next: async page => {
    if (!isDesktopViewport(page)) {
      return
    }
    await page.getByRole('button', { name: copyButtonName, exact: true }).hover()
    await expect(page.locator('.menu-tooltip').getByText(COPY_TOOLTIP.next.idle, { exact: true })).toBeVisible()
    await settled(page.locator('.menu-tooltip'))
  },
}

/**
 * Clicks "Copy URL": the tooltip says "Copied" and the clipboard stub holds the URL. Vue 3 skips a parent's listener when the event
 * stamp (`Date.now()` at the first Vue handler, here the `v-btn`) is not later than the moment the listener was attached. Under the
 * frozen `clock` both are the same, so the activator's click never ran. The frozen time moves on by a second before the click.
 */
export const clickCopyUrl: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    if (!isDesktopViewport(page)) {
      return
    }
    await page.getByRole('button', { name: copyButtonName, exact: true }).click()
    await expect(page.locator('.menu-tooltip')).toHaveText(COPY_TOOLTIP.legacy.copied)
    await expect.poll(() => readParityClipboard(page), { message: 'legacy clipboard stub did not receive the preview url' }).toBe(PREVIEW_URL)
  },
  next: async page => {
    if (!isDesktopViewport(page)) {
      return
    }
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + 1000))
    await page.getByRole('button', { name: copyButtonName, exact: true }).click()
    // Clipboard first: it tells a click that never reached the copy handler from a tooltip that did not switch to "Copied".
    await expect.poll(() => readParityClipboard(page), { message: 'next clipboard stub did not receive the preview url' }).toBe(PREVIEW_URL)
    await expect(page.locator('.menu-tooltip')).toContainText(COPY_TOOLTIP.next.copied)
    await settled(page.locator('.menu-tooltip'))
  },
}

/** Next resets its "Copied" text after 1.5 s and is captured after legacy: fail instead of recording the reset frame. */
export const copiedGuard: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [async page => {
    if (isDesktopViewport(page)) {
      await expect(page.locator('.menu-tooltip'), 'Harness error: legacy copied text changed during capture').toHaveText(COPY_TOOLTIP.legacy.copied)
    }
  }],
  next: [async page => {
    if (isDesktopViewport(page)) {
      await expect(page.locator('.menu-tooltip'), 'Harness error: next copied text changed during capture').toHaveText(COPY_TOOLTIP.next.copied)
    }
  }],
}

// Collaborate (`CollaborateLabel` on the card and in the table; `atarim_enabled` and `general.collaboration`)

/** Adds the collaboration privilege to every item (and keeps the rest of its privileges). */
export function withCollaboration (items: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return items.map(item => ({ ...item, privileges: [...((item.privileges as string[] | undefined) ?? []), 'general.collaboration'] }))
}

/** The shell `/home` of the collaborate states: the Atarim integration is on (the chip needs it). */
export const collaborateHome = shellHome({ app: { integrations: { atarim_enabled: true } } })

/** The collaborate chip of grid card `index`: the first chip of its action row (the shares chip comes after it). */
export function collaborateCardProbe (index: number): Probe {
  return {
    key: `collaborate-card-${index + 1}`,
    legacy: page => page.locator('.data-iterator-card').nth(index).locator('.v-card__actions .v-chip').first(),
    next: page => page.getByTestId('instance-card').nth(index).locator('.v-card-actions .v-chip').first(),
    internal: true,
  }
}

/** The collaborate chip of table row `index` (the `item--collaborate` column). */
export function collaborateRowProbe (index: number): Probe {
  return {
    key: `collaborate-row-${index + 1}`,
    legacy: page => page.locator('.table-row').nth(index).locator('.item--collaborate .v-chip').first(),
    next: page => page.getByTestId('instance-table-row').nth(index).locator('.item--collaborate .v-chip').first(),
    internal: true,
  }
}

/** The collaborate chip of the first staging sub-row (it follows the parent's gate). */
export const collaborateSubrowProbe: Probe = {
  key: 'collaborate-subrow',
  legacy: page => page.locator('.table-subrow').first().locator('.item--collaborate .v-chip').first(),
  next: page => page.getByTestId('instance-table-subrow').first().locator('.item--collaborate .v-chip').first(),
  internal: true,
}

// The DNS / SSL indicator (`DnsSslIndicator`) on card 1: the icon is the first `.d-flex.align-center` of its URL box in both apps.

/** Card 1 with no IP in the URL, no certificate and DNS alerts on or off: the indicator shows the DNS alert. */
export function dnsAlertItem (overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return rawInstance(1, {
    name: 'Acme Blog',
    url: 'https://acme-blog.example.com',
    domain: 'acme-blog.example.com',
    screenshot_time: UNIX_NOW - 7200,
    dns_settings: DNS_SETTINGS,
    ...overrides,
  })
}

/** Card 1 with a fresh valid certificate: the indicator shows the lock and its SSL text, and asks no DNS. */
export function sslItem (): Record<string, unknown> {
  return rawInstance(1, {
    name: 'Acme Blog',
    url: 'https://acme-blog.example.com',
    domain: 'acme-blog.example.com',
    screenshot_time: UNIX_NOW - 7200,
    dns_settings: DNS_SETTINGS,
    ...secured,
  })
}

/** The detected certificate of the card's server account (only asked when the cached one is stale; kept for the state that shows it). */
export const sslHandlers: Record<string, Handler> = {
  'GET /server-accounts/1/ssl/certificate/detected': { json: { data: secured.domain_ssl_details.detected_ssl_cert } },
}

/** Card 2 with a screenshot: an open menu next to a card without one flaps the "preview not available" backdrop. */
export const dnsNeighbour = rawInstance(2, {
  name: 'Portfolio',
  url: 'https://portfolio.example.com',
  domain: 'portfolio.example.com',
  screenshot_time: UNIX_NOW - 86_400,
})

/** The icon of grid card `index`. */
function dnsIconLocator (page: Page, index: number): Locator {
  return page.locator('.data-iterator-card').nth(index).locator('.data-iterator-card__url-box .d-flex.align-center').first()
}

export function dnsIconProbe (index: number): Probe {
  return {
    key: 'dns-icon',
    legacy: page => dnsIconLocator(page, index),
    next: page => dnsIconLocator(page, index),
    internal: true,
  }
}

// The menu overlay: the V2 `menuable` content in legacy, the `v-menu` overlay in next. Each app runs alone in its page, so one
// selector covers both sides; `dnsMenuWithin` scopes a part of the menu to either overlay.
const DNS_MENU = '.menuable__content__active, .v-menu > .v-overlay__content'

function dnsMenuWithin (inner: string): string {
  return `.menuable__content__active ${inner}, .v-menu > .v-overlay__content ${inner}`
}

export const dnsMenuProbe: Probe = {
  key: 'dns-menu',
  legacy: page => page.locator('.menuable__content__active').first(),
  next: page => page.locator('.v-menu > .v-overlay__content').first(),
  internal: true,
  when: isDesktop,
}

export const dnsMenuTextProbe: Probe = {
  key: 'dns-menu-text',
  legacy: page => page.locator(dnsMenuWithin('p')).first(),
  next: page => page.locator(dnsMenuWithin('p')).first(),
  when: isDesktop,
}

export function dnsMenuButtonProbe (index: number): Probe {
  return {
    key: `dns-menu-button-${index + 1}`,
    legacy: page => page.locator(dnsMenuWithin('.v-btn')).nth(index),
    next: page => page.locator(dnsMenuWithin('.v-btn')).nth(index),
    internal: true,
    when: isDesktop,
  }
}

/**
 * Hovers the DNS / SSL icon of card `index` and waits for its menu (open-on-hover in both apps). The menu states are desktop-only, so
 * the hover is skipped on a touch viewport; the Fix DNS dialog needs the menu on every viewport (`anyViewport`).
 */
export function hoverDnsIndicator (index: number, anyViewport = false): StateAction {
  return async page => {
    if (!anyViewport && !isDesktopViewport(page)) {
      return
    }
    await dnsIconLocator(page, index).hover()
    await settled(page.locator(DNS_MENU).first())
  }
}

const FIX_DNS_BUTTON = '.v-btn--fix-dns'
const DNS_OPTIONS = '.v-expansion-panels--dns'

/**
 * Hovers the icon of card `index`, clicks "Fix it now" and waits for the dialog's `DnsOptions` panels. Legacy keeps its menu open under
 * the dialog (exception E1), so the stale menu is hidden on that side; next closes the menu before the dialog opens.
 */
export function openFixDns (index = 0): { legacy: StateAction, next: StateAction } {
  const hover = hoverDnsIndicator(index, true)
  return {
    legacy: async page => {
      await hover(page)
      await page.locator('.menuable__content__active').first().locator(FIX_DNS_BUTTON).first().click()
      await settled(page.locator(`.v-dialog--active ${DNS_OPTIONS}`))
      await page.evaluate(() => {
        for (const element of document.querySelectorAll<HTMLElement>('.menuable__content__active')) {
          element.style.display = 'none'
        }
      })
    },
    next: async page => {
      await hover(page)
      await page.locator('.v-menu > .v-overlay__content').first().locator(FIX_DNS_BUTTON).first().click()
      await settled(page.locator(`.v-dialog.v-overlay--active ${DNS_OPTIONS}`))
    },
  }
}

/** The Fix DNS dialog card (legacy `.v-dialog--active`, next the `v-dialog` overlay). */
const dnsDialogCard: Probe = {
  key: 'dns-dialog',
  legacy: page => page.locator('.v-dialog--active .v-card'),
  next: page => page.locator('.v-dialog.v-overlay--active .v-card'),
}

function inDnsDialog (key: string, legacy: string, next: string = legacy): Probe {
  return {
    key,
    internal: true,
    legacy: page => page.locator('.v-dialog--active .v-card').locator(legacy).first(),
    next: page => page.locator('.v-dialog.v-overlay--active .v-card').locator(next).first(),
  }
}

/** The dialog of every Fix DNS state: card, title, the domain box, the `DnsOptions` panels and the Close button. */
export const dnsDialogProbes: Probe[] = [
  dnsDialogCard,
  inDnsDialog('dns-dialog-title', 'h4'),
  inDnsDialog('dns-dialog-domain', '.domain-container'),
  inDnsDialog('dns-dialog-options', DNS_OPTIONS),
  inDnsDialog('dns-dialog-close', '.v-card__actions .v-btn', '.v-card-actions .v-btn'),
]

/** The single-server box of the dialog: the second domain box and its "Generate URL" button (app-lite only). */
export const dnsDialogPreviewProbes: Probe[] = [
  {
    key: 'dns-dialog-preview',
    legacy: page => page.locator('.v-dialog--active .v-card .domain-container').nth(1),
    next: page => page.locator('.v-dialog.v-overlay--active .v-card .domain-container').nth(1),
    internal: true,
  },
  {
    key: 'dns-dialog-generate',
    legacy: page => page.locator('.v-dialog--active .v-card').getByRole('button', { name: tr('heading.instance.modal.setDomain.generateUrl'), exact: true }),
    next: page => page.locator('.v-dialog.v-overlay--active .v-card').getByRole('button', { name: tr('heading.instance.modal.setDomain.generateUrl'), exact: true }),
  },
]
