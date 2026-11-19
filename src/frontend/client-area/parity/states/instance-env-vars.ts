import type { Handler, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { alertProbes, tr } from './auth'
import { waitFor } from './hosting'
import { INSTANCE_PAGE_PRIVILEGES, instancePageRaw } from './instance'
import { advancedActiveItemProbe, advancedSelectedTabProbe, advancedSidebarProbe, advancedTitleProbe } from './instance-advanced-frame'
import { screenshotHandlers } from './instances'
import { liteAppUsers, liteAppUsersHandler } from './instances-lite'
import { isDesktop, NOW, shellHandlers } from './shell'

// ui-instance-env-vars (S-129): the Env file page of a project inside the Advanced frame, measured on app-lite
// (`/projects/:id/advanced/env-file`, `target: 'lite'`; the page exists only in app-lite, `LITE/views/instance/advanced/EnvFile.vue`).
// Not a spec file (testMatch is `*.parity.ts`). States and their registration: `instance-env-vars.parity.ts`.
// Plan: context/changes/ui-instance-env-vars/plan.md. The S-103 editor states (`instance-env-file-*`) are gone with the editor (phase 5).

export const ENV_PROJECT_ID = 41

/** The privileges of the page: the instance page set plus `hosting.manage_env_file` (the sidebar item and the API middleware). */
const ENV_PRIVILEGES = [...INSTANCE_PAGE_PRIVILEGES, 'hosting.manage_env_file']

/** `GET /projects/41` of the page: a custom (non-WordPress) project, so the sidebar shows the Env file item. `overrides` add fields. */
export function envInstance (overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return instancePageRaw(ENV_PROJECT_ID, { type: 'custom', app_type: 'custom', privileges: ENV_PRIVILEGES, ...overrides })
}

/** A WordPress project: the page shows the notice and never loads the file (reachable only from a direct link). */
export const envWordpressInstance = envInstance({ type: 'wordpress', app_type: 'wordpress' })

export const ENV_PATH = '/home/app/project/.env'

/** `GET …/env-file/meta` of a container project that supports a restart. */
export const ENV_META = {
  is_git_repo: false,
  is_dind: true,
  supports_restart: true,
  default_env_dir: '/home/app/project',
  default_env_path: ENV_PATH,
  app_type: 'custom',
}

/** `GET …/env-file/meta` of a WordPress project: the page shows the notice and never reads the file (legacy `EF:265-267`). */
export const ENV_META_WORDPRESS = { ...ENV_META, app_type: 'wordpress' }

type EnvRowFixture = { type: 'variable', key: string, value: string }

/** The `{ path, exists, contents, parsed }` answer of `GET …/env-file` for KEY=value lines (no comments). */
export function envFileBody (lines: Array<[string, string]>): Record<string, unknown> {
  const parsed: EnvRowFixture[] = lines.map(([key, value]) => ({ type: 'variable', key, value }))
  return { path: ENV_PATH, exists: true, contents: lines.map(([key, value]) => `${key}=${value}`).join('\n') + '\n', parsed }
}

/** Six variables of a Laravel-like app and one empty value (the `---` cell). */
export const ENV_LINES: Array<[string, string]> = [
  ['APP_NAME', 'Studio'],
  ['APP_ENV', 'production'],
  ['APP_DEBUG', 'false'],
  ['APP_URL', 'https://studio.example.com'],
  ['DB_HOST', '127.0.0.1'],
  ['DB_DATABASE', 'studio'],
  ['MAIL_PASSWORD', ''],
]

/**
 * The default seven variables plus a multi-line quoted value last (`NOTES`, `EFU` `multilineEnd`): one readonly row, so no Edit and no
 * Delete in its actions cell. Eight rows fit on the first page (8 per page).
 */
export const ENV_MULTILINE_FILE: Handler = {
  json: {
    path: ENV_PATH,
    exists: true,
    contents: `${ENV_LINES.map(([key, value]) => `${key}=${value}`).join('\n')}\nNOTES="first line\nsecond line"\n`,
    parsed: [
      ...ENV_LINES.map(([key, value]) => ({ type: 'variable', key, value })),
      { type: 'variable', key: 'NOTES', value: 'first line\nsecond line' },
    ],
  },
}

/** No file at the default path (`exists: false`). */
export const ENV_FILE_MISSING: Handler = { json: { path: ENV_PATH, exists: false, contents: null, parsed: [] } }

/** A server error of the meta request (legacy `EF:344-348`: the alert `loadError + message`, the page stays empty). */
export const ENV_META_ERROR: Handler = { status: 500, json: { message: 'Server Error' } }

/**
 * Handlers of the page on lite: the shell, the project GET, the project calls the frame makes (as `advancedFrameHandlers`) and the two
 * env-file reads. The API layer of both apps maps `/instances/` to `/projects/` on single-server, also below `/server-accounts/1/`.
 * `overrides` replace any key, so a state changes one call without losing the rest.
 */
export function envHandlers (overrides: Record<string, Handler> = {}, instance: Record<string, unknown> = envInstance()): Record<string, Handler> {
  const base = `/projects/${ENV_PROJECT_ID}`
  return {
    ...shellHandlers([], 'projects'),
    [`GET ${base}`]: { json: { data: instance } },
    [`GET ${base}/app-health`]: { json: { data: { available: true, healthy: true, serving: 'ok', ports: [], checks: [] } } },
    ...screenshotHandlers([instance], 'projects'),
    [`GET ${base}/source`]: { json: { data: null } },
    [`GET ${base}/wordpress/maintenance-mode`]: { json: { status: false } },
    [`GET ${base}/wordpress/debug-mode`]: { json: { status: false } },
    [`GET ${base}/wordpress/automatic-backup`]: { json: { data: { enabled: false } } },
    'GET /server-accounts/1/ssl/certificate/detected': { json: { data: null } },
    ...liteAppUsersHandler(ENV_PROJECT_ID, liteAppUsers),
    [`GET /server-accounts/1${base}/env-file/meta`]: { json: ENV_META },
    [`GET /server-accounts/1${base}/env-file`]: { json: envFileBody(ENV_LINES) },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------------------------
// Probes. Both apps keep the legacy classes of the table (`custom-data-table`, `custom-sort`, `env-value`, `env-value__text`,
// `actions-row`, `data-iterator-footer`, `my-hostings-search`, `page-title__add-button`, `add-new-button`); the next table is
// `EnvVarsTable.vue` and carries the same classes.
// ---------------------------------------------------------------------------------------------

const both = (locator: (page: Page) => Locator): Pick<Probe, 'legacy' | 'next'> => ({ legacy: locator, next: locator })

/** The search field of the filter controls (legacy `:class="'my-hostings-search'"`). */
export const envSearchProbe: Probe = { key: 'env-search', ...both(page => page.locator('.my-hostings-search').first()) }

/** Import (outlined) is the first header button; Add carries `add-new-button` (legacy `EF:14-47`). */
export const envImportProbe: Probe = { key: 'env-import', ...both(page => page.locator('.page-title__add-button').first()) }
export const envAddProbe: Probe = { key: 'env-add', ...both(page => page.locator('.add-new-button').first()) }

/** The custom sort row of the table header (`TableCustomSort`, `tr.custom-sort`). */
export const envSortHeaderProbe: Probe = { key: 'env-sort-header', ...both(page => page.locator('.custom-sort').first()) }

/** The first key cell (bold) of the table. */
export const envKeyCellProbe: Probe = { key: 'env-key-cell', ...both(page => page.locator('.custom-data-table tbody tr td b').first()) }

/** The masked value of the first row (`••••••••`). */
/** The first body cell (the key column on desktop, the whole card on mobile): measures the column / card width. */
export const envFirstCellProbe: Probe = { key: 'env-first-cell', ...both(page => page.locator('tbody tr td').first()) }

export const envMaskProbe: Probe = { key: 'env-mask', ...both(page => page.locator('.env-value__text').first()) }

/** The eye button of the first row (the first value is not empty). */
export const envEyeProbe: Probe = { key: 'env-eye', ...both(page => page.locator('.env-value .v-btn').first()) }
export const envEyeIconProbe: Probe = { key: 'env-eye-icon', ...both(page => page.locator('.env-value .v-btn .v-icon').first()) }

/** Edit and Delete of the first row (`.actions-row`). */
// Mobile has no `.actions-row`: the buttons sit in the last row of the card (`.mobile-table-item__row:last-child`), the same order (Edit, Delete).
const ROW_ACTION_BUTTONS = '.actions-row .v-btn, .mobile-table-item__row:last-child .v-btn'
export const envEditProbe: Probe = { key: 'env-edit', ...both(page => page.locator(ROW_ACTION_BUTTONS).nth(0)) }
export const envDeleteProbe: Probe = { key: 'env-delete', ...both(page => page.locator(ROW_ACTION_BUTTONS).nth(1)) }

/** The hover overlay of the header's Add button: V2 paints it as `::before`, V4 as `.v-btn__overlay` (the Add button is filled, no border). */
export const envAddOverlayProbe: Probe = {
  key: 'env-add-overlay',
  legacy: envAddProbe.legacy,
  next: page => envAddProbe.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/** The header's Import button (outlined, first header button), located by its class: icon-only on mobile, so it has no accessible name. */
export const envImportButton = (page: Page): Locator => page.locator('.page-title__add-button').first()

/** The focus / hover overlay of the header's Import button: V2 paints it as `::before`, V4 as `.v-btn__overlay`. */
export const envImportOverlayProbe: Probe = {
  key: 'env-import-overlay',
  legacy: envImportButton,
  next: page => envImportButton(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/** The hover overlay of the first row's Edit icon. Desktop only (the mobile card has no hover). */
export const envEditOverlayProbe: Probe = {
  key: 'env-edit-overlay',
  legacy: envEditProbe.legacy,
  next: page => envEditProbe.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
  when: isDesktop,
}

/** The Edit tooltip of the first row (legacy `.menuable__content__active`, next `.v-overlay__content`). Desktop only (the mobile card has none). */
export const envEditTooltipProbe: Probe = {
  key: 'env-edit-tooltip',
  legacy: page => page.locator('.menuable__content__active').filter({ hasText: 'Edit' }),
  next: page => page.locator('.v-overlay--active .v-overlay__content').filter({ hasText: 'Edit' }),
  when: isDesktop,
}

/** The pagination footer (`DataIteratorFooter`, `data-iterator-footer`). */
export const envFooterProbe: Probe = { key: 'env-footer', ...both(page => page.locator('.data-iterator-footer').first()) }

/** The frame probes of the state: title (readiness anchor), sidebar, active item and tab. */
export const envFrameProbes: Probe[] = [
  advancedTitleProbe,
  advancedSidebarProbe,
  advancedActiveItemProbe,
  advancedSelectedTabProbe,
]

/** Default: the frame, the header controls (search, Import, Add), the table with its sort row, first row and footer. */
export const envDefaultProbes: Probe[] = [
  ...envFrameProbes,
  envSearchProbe,
  envImportProbe,
  envAddProbe,
  envSortHeaderProbe,
  envKeyCellProbe,
  envFirstCellProbe,
  envMaskProbe,
  envEyeProbe,
  envEyeIconProbe,
  envEditProbe,
  envDeleteProbe,
  envFooterProbe,
]

/** The first value once its eye is pressed (`.env-value__text` shows the text, not the mask). */
export const envRevealedValueProbe: Probe = { key: 'env-revealed-value', ...both(page => page.locator('.env-value__text').first()) }

/** The actions cell of the last row, the readonly multi-line value: empty in both apps (legacy `EVT:77,163`). */
export const envReadonlyActionsProbe: Probe = {
  key: 'env-readonly-actions',
  ...both(page => page.locator('.custom-data-table tbody tr').last().locator('td').last()),
}

/** Revealed: the default probes with the first value shown (the eye now carries `$eyeclosed`) and the readonly row's empty actions cell. */
export const envRevealedProbes: Probe[] = [
  ...envFrameProbes,
  envSearchProbe,
  envImportProbe,
  envAddProbe,
  envSortHeaderProbe,
  envKeyCellProbe,
  envRevealedValueProbe,
  envEyeProbe,
  envEyeIconProbe,
  envEditProbe,
  envDeleteProbe,
  envReadonlyActionsProbe,
  envFooterProbe,
]

/** The table container (`.data-table`, legacy `EVT` root; next `EnvVarsTable.vue` carries the `env-vars-table` test id). */
export const envTableProbe: Probe = {
  key: 'env-table',
  legacy: page => page.locator('.data-table').first(),
  next: page => page.getByTestId('env-vars-table'),
}

/** The skeleton bones of the loading table (`LogsTableSortSkeleton`, `LogsTableSkeletonItem`), masked: their shape is not the page's. */
export const envSkeletonMasks = {
  legacy: [(page: Page) => page.locator('.v-main .data-table .v-skeleton-loader')],
  next: [(page: Page) => page.getByTestId('env-vars-table').locator('.v-skeleton-loader')],
}

/** Waits for the skeleton, which renders from the first paint until the meta and the file are both in (the meta is held in the loading state). */
export const waitForSkeleton: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => page.locator('.v-main .data-table .v-skeleton-loader'))],
  next: [waitFor(page => page.getByTestId('env-vars-table').locator('.v-skeleton-loader'))],
}

/** The empty state (`TableFullScreenMessage`, legacy `EF:96-141`): the illustration, title, description and the two buttons in `.no-data__action`. */
export const envEmptyIllustrationProbe: Probe = { key: 'env-empty-illustration', ...both(page => page.locator('.no-data__img')) }
export const envEmptyTitleProbe: Probe = { key: 'env-empty-title', ...both(page => page.locator('.no-data__title')) }
export const envEmptyDescProbe: Probe = { key: 'env-empty-desc', ...both(page => page.locator('.no-data__desc')) }
export const envEmptyImportProbe: Probe = { key: 'env-empty-import', ...both(page => page.locator('.no-data__action .v-btn').nth(0)) }
export const envEmptyAddProbe: Probe = { key: 'env-empty-add', ...both(page => page.locator('.no-data__action .add-new-button')) }

/** The probes of the empty state: the frame, the table container and the `TableFullScreenMessage` parts. The header has no controls here. */
export const envEmptyProbes: Probe[] = [
  ...envFrameProbes,
  envTableProbe,
  envEmptyIllustrationProbe,
  envEmptyTitleProbe,
  envEmptyDescProbe,
  envEmptyImportProbe,
  envEmptyAddProbe,
]

/** The file at the default path with no content (`contents: ''`, `parsed: []`): the table shows the empty state. */
export const ENV_FILE_EMPTY: Handler = { json: { path: ENV_PATH, exists: true, contents: '', parsed: [] } }

/** The readiness anchor of the empty state: the `.no-data` block of `TableFullScreenMessage` (the table has no rows). */
export const waitForEmpty: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => page.locator('.no-data__title'))],
  next: [waitFor(page => page.locator('.no-data__title'))],
}

/** The WordPress notice card (`v-card` elevation 4, `text-center pa-6`, legacy `EF:68-75`) inside the page; both apps keep `.advanced-hosting-page`. */
export const envWordpressCardProbe: Probe = { key: 'env-wordpress-card', ...both(page => page.locator('.advanced-hosting-page .v-card').first()) }

/** The notice text inside the card (`wordpressNotice` in one `p` with no bottom margin). V2 names the card body `.v-card__text`, V4 `.v-card-text`. */
export const envWordpressTextProbe: Probe = { key: 'env-wordpress-text', ...both(page => page.locator('.advanced-hosting-page .v-card__text p, .advanced-hosting-page .v-card-text p').first()) }

/** Readiness anchor of the WordPress branch: the notice card (no table, no file read). */
export const waitForWordpressCard: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => page.locator('.advanced-hosting-page .v-card'))],
  next: [waitFor(page => page.locator('.advanced-hosting-page .v-card'))],
}

// ---------------------------------------------------------------------------------------------
// Actions.
// ---------------------------------------------------------------------------------------------

/** Waits until the first row is on the page (the file loads after the meta). */
export const waitForRows: StateAction = async page => {
  await page.locator('.env-value__text').first().waitFor({ state: 'visible', timeout: 20_000 })
}

// ---------------------------------------------------------------------------------------------
// Phase 12: the no-results state. Legacy `no-results` and next `EnvVarsTable` both render `DataIteratorNoResultsContainer` (`.no-results-container`).
// ---------------------------------------------------------------------------------------------

/** The no-results container of the table, with its Clear filter button (`.no-results-container .v-btn`). Both apps keep the class. */
export const envNoResultsProbe: Probe = { key: 'env-no-results', ...both(page => page.locator('.v-main .no-results-container').first()) }
export const envNoResultsClearProbe: Probe = { key: 'env-no-results-clear', ...both(page => page.locator('.v-main .no-results-container .v-btn').first()) }

/**
 * Types a phrase no key matches (the search filters the `key` column only). Legacy debounces with lodash, which reads `Date.now()`: the frozen
 * clock never reaches the 300 ms, so the clock moves on after the fill (as `searchNothing` in `cron.ts`). Then waits for the container.
 */
export const searchEnvNothing: StateAction = async page => {
  const input = page.locator('.v-main .my-hostings-search input')
  await input.fill('zzz-no-such-key')
  await page.clock.setFixedTime(new Date(Date.parse(NOW) + 1000))
  await waitFor(current => current.locator('.v-main .no-results-container'))(page)
}

// ---------------------------------------------------------------------------------------------
// Phase 13: the Add modal. Legacy `.v-dialog--active .basic-modal`, next the `env-modal` test id (`EnvFileView.vue`). The fields are the
// text inputs of the form in order (key, value), then the restart checkbox or the File Manager link.
// ---------------------------------------------------------------------------------------------

/** The modal dialog of the page (legacy `.v-dialog--active .basic-modal`, next the `env-modal` test id). */
export function envDialog (page: Page, app: 'legacy' | 'next'): Locator {
  return app === 'legacy' ? page.locator('.v-dialog--active .basic-modal') : page.getByTestId('env-modal')
}

export const envDialogProbes: Probe[] = [
  { key: 'env-dialog', legacy: page => envDialog(page, 'legacy'), next: page => envDialog(page, 'next') },
  {
    key: 'env-dialog-title',
    legacy: page => envDialog(page, 'legacy').locator('.v-card__title, .basic-modal__title').first(),
    next: page => envDialog(page, 'next').locator('.v-card-title, .basic-modal__title').first(),
    internal: true,
  },
  {
    key: 'env-dialog-body',
    legacy: page => envDialog(page, 'legacy').locator('.v-card__text, .v-card-text').first(),
    next: page => envDialog(page, 'next').locator('.v-card-text').first(),
    internal: true,
  },
  {
    key: 'env-dialog-actions',
    legacy: page => envDialog(page, 'legacy').locator('.v-card__actions'),
    next: page => envDialog(page, 'next').locator('.v-card-actions'),
    internal: true,
  },
]

/** The text input of the modal form at `index` (0 key, 1 value); the restart checkbox is not a text input. */
export function envDialogInput (app: 'legacy' | 'next', index: number): (page: Page) => Locator {
  return page => envDialog(page, app).locator('input[type="text"], input:not([type])').nth(index)
}

/**
 * The visible frame of the modal's text field at `index` (the outlined box the user sees): V2 `.v-input__slot`, V4 `.v-field`. The inner `input`
 * is not measured here: V2 gives it 8 px of padding top and bottom inside the frame (41 px box), V4 gives none (25 px); the frames match.
 */
export function envDialogField (app: 'legacy' | 'next', index: number): (page: Page) => Locator {
  return page => envDialog(page, app).locator(app === 'legacy' ? '.v-input__slot' : '.v-field').nth(index)
}

/** The Add modal's probes: the frame and the page controls behind the dialog, then the dialog itself. */
export const envAddModalProbes: Probe[] = [
  ...envDefaultProbes,
  ...envDialogProbes,
  { key: 'env-dialog-key', legacy: envDialogField('legacy', 0), next: envDialogField('next', 0), internal: true },
  { key: 'env-dialog-value', legacy: envDialogField('legacy', 1), next: envDialogField('next', 1), internal: true },
]

/** Clicks the header's Add button (`.add-new-button`, the first one) and waits for the dialog. */
export function openAddModal (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await page.locator('.add-new-button').first().click()
    await expect(envDialog(page, app), `${app}: env dialog`).toBeVisible()
  }
}

/** Fills the Add modal's key and value (the restart checkbox keeps its default). */
export function fillAddModal (key: string, value: string): { legacy: StateAction, next: StateAction } {
  const run = (app: 'legacy' | 'next'): StateAction => async page => {
    await envDialogInput(app, 0)(page).fill(key)
    await envDialogInput(app, 1)(page).fill(value)
  }
  return { legacy: run('legacy'), next: run('next') }
}

/** The modal's Save button (translated label, as `button.save`); both apps carry the label as text. */
export function saveModalButton (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await envDialog(page, app).getByRole('button', { name: tr('button.save', 'lite'), exact: true }).click()
    await leaveButton(page)
  }
}

/**
 * Moves the pointer off the button just clicked and gives the browser time to drop its `:hover` (V4 keeps a white overlay of ~24 % on the
 * primary Save, 7,192,126 -> 68,207,157, until it re-evaluates the hover; under load the two identical shots were taken before it did).
 */
async function leaveButton (page: Page): Promise<void> {
  await page.mouse.move(0, 0)
  await page.waitForTimeout(300)
}

/** The validation message under the key field (`validation.key`), shown after Save on a key that is not a valid env name. */
export const envKeyErrorProbe: Probe = {
  key: 'env-key-error',
  legacy: page => envDialog(page, 'legacy').locator('.v-messages__message').first(),
  next: page => envDialog(page, 'next').locator('.v-messages__message').first(),
  internal: true,
}

// Phase 14: the Edit modal of the first row, opened by a DOM click (the page does not scroll to the button). Desktop only: the mobile card
// has its own Edit icon (`.mobile-table-item__value`), which this probe does not reach.
export const envEditModalProbes: Probe[] = [
  ...envDefaultProbes,
  ...envDialogProbes,
  { key: 'env-dialog-key', legacy: envDialogField('legacy', 0), next: envDialogField('next', 0), internal: true },
  { key: 'env-dialog-value', legacy: envDialogField('legacy', 1), next: envDialogField('next', 1), internal: true },
  {
    key: 'env-dialog-save',
    legacy: page => envDialog(page, 'legacy').getByRole('button', { name: tr('button.save', 'lite'), exact: true }),
    next: page => envDialog(page, 'next').getByRole('button', { name: tr('button.save', 'lite'), exact: true }),
    internal: true,
  },
]

/** Clicks the first row's Edit button (`.actions-row`, the first button) by a DOM click and waits for the dialog. */
export function openEditModal (app: 'legacy' | 'next'): StateAction {
  return async page => {
    const edit = app === 'legacy' ? envEditProbe.legacy(page) : envEditProbe.next(page)
    await edit.evaluate(el => (el as HTMLElement).click())
    await expect(envDialog(page, app), `${app}: env dialog`).toBeVisible()
  }
}

type Target = (page: Page) => Locator

// Phase 15: the Delete modal of the first row (`APP_ENV`). Desktop: the second button of `.actions-row`; mobile: the second button of the last
// card row (`.mobile-table-item__row:last-child`), as the Edit locator. Opened by a DOM click, as the Edit modal.
function rowDeleteButton (app: 'legacy' | 'next'): Target {
  return page => {
    const rows = (app === 'next' ? page.getByTestId('env-vars-table') : page.locator('.data-table')).locator('tbody tr')
    return rows.first().locator('.actions-row .v-btn, .mobile-table-item__row:last-child .v-btn').nth(1)
  }
}

/** Clicks the first row's Delete button by a DOM click and waits for the dialog. */
export function openDeleteModal (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await rowDeleteButton(app)(page).evaluate(el => (el as HTMLElement).click())
    await expect(envDialog(page, app), `${app}: env dialog`).toBeVisible()
  }
}

/** The Delete button of the modal is disabled until the confirm checkbox is ticked (`confirmRequired`, `ui-buttons-tokens` disabled rule). */
export function expectDeleteDisabled (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await expect(envDialog(page, app).getByRole('button', { name: tr('button.delete', 'lite'), exact: true })).toBeDisabled()
  }
}

/** The message paragraph of the Delete modal (`mb-4 p-2`, both apps): the key sentence. */
export const envDeleteMessageProbe: Probe = {
  key: 'env-delete-message',
  legacy: page => envDialog(page, 'legacy').locator('.v-card__text p.mb-4, .v-card-text p.mb-4').first(),
  next: page => envDialog(page, 'next').locator('.v-card__text p.mb-4, .v-card-text p.mb-4').first(),
}

/** The confirm checkbox row of the Delete modal (`label.checkbox-label`, both apps). */
export const envDeleteCheckboxProbe: Probe = {
  key: 'env-delete-checkbox',
  legacy: page => envDialog(page, 'legacy').locator('label.checkbox-label').first(),
  next: page => envDialog(page, 'next').locator('label.checkbox-label').first(),
}

/** The Delete button of the modal (the first action button), disabled in both apps until the box is ticked. */
export const envDeleteButtonProbe: Probe = {
  key: 'env-delete-button',
  legacy: page => envDialog(page, 'legacy').getByRole('button', { name: tr('button.delete', 'lite'), exact: true }),
  next: page => envDialog(page, 'next').getByRole('button', { name: tr('button.delete', 'lite'), exact: true }),
  internal: true,
}

/** The Delete modal's probes: the default page behind the dialog, the dialog parts, the message, the checkbox and the Delete button. */
export const envDeleteModalProbes: Probe[] = [
  ...envDefaultProbes,
  ...envDialogProbes,
  envDeleteMessageProbe,
  envDeleteCheckboxProbe,
  envDeleteButtonProbe,
]

// Phase 16: the Import modal, opened from the header's Import button (`.page-title__add-button`, the first one) by a DOM click. The fields are the
// textarea (placeholder `KEY=value`) and the overwrite checkbox; with `supports_restart` (`ENV_META`) the form adds the restart checkbox.
/** Clicks the header's Import button by a DOM click and waits for the dialog. */
export function openImportModal (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await envImportButton(page).evaluate(el => (el as HTMLElement).click())
    await expect(envDialog(page, app), `${app}: env dialog`).toBeVisible()
  }
}

/** The Import button of the modal (translated label, `heading.instance.advanced.envFile.import`), inside the dialog only. */
export function importModalButton (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await envDialog(page, app).getByRole('button', { name: tr('heading.instance.advanced.envFile.import', 'lite'), exact: true }).click()
    await leaveButton(page)
  }
}

/** The Import modal's probes: the page behind the dialog, the dialog parts, the textarea frame and the overwrite checkbox (`label.checkbox-label`). */
export const envImportModalProbes: Probe[] = [
  ...envDefaultProbes,
  ...envDialogProbes,
  { key: 'env-dialog-contents', legacy: envDialogField('legacy', 0), next: envDialogField('next', 0), internal: true },
  {
    key: 'env-dialog-overwrite',
    legacy: page => envDialog(page, 'legacy').locator('label.checkbox-label').first(),
    next: page => envDialog(page, 'next').locator('label.checkbox-label').first(),
    internal: true,
  },
]

/** The validation message under the textarea after Import on an empty paste (`validation.importEmpty` or the required rule, as each app shows it). */
export const envImportErrorProbe: Probe = {
  key: 'env-import-error',
  legacy: page => envDialog(page, 'legacy').locator('.v-messages__message').first(),
  next: page => envDialog(page, 'next').locator('.v-messages__message').first(),
  internal: true,
}

// ---------------------------------------------------------------------------------------------
// Phase 17: the save is refused. The PUT of the file answers 500 `{ message }`; the Add modal stays open (legacy `mutate` `EF:520-529`
// leaves the dialog open, its `submittingError` line is commented out in `BasicModal.vue`), the Save button is back out of loading, and the
// error alert carries `saveError` with the message.
// ---------------------------------------------------------------------------------------------

/** The 500 body of the refused PUT (`getErrorMessage` reads `message`). */
export const ENV_SAVE_REFUSED_MESSAGE = 'The .env file could not be saved.'

/** The PUT of the file (`putEnvFile`) on the lite project, refused by the server. */
export const ENV_SAVE_FAILURE: Record<string, Handler> = {
  [`PUT /server-accounts/1/projects/${ENV_PROJECT_ID}/env-file`]: { status: 500, json: { message: ENV_SAVE_REFUSED_MESSAGE } },
}

/** The error alert of the alert stack (`.alert--error`), the same locator in both apps. */
export const envErrorAlert = (page: Page): Locator => page.locator('.alert-manager .alert--error')

/** The error alert probes (the alert, its icon, title and text). */
export const envErrorAlertProbes: Probe[] = alertProbes(envErrorAlert)
