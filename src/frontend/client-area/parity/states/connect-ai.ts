import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Page } from '@playwright/test'
import { settled, tr } from './auth'
import { isDesktop, isoFromNow, liteTabs, NOW, shellHandlers, shellState, singleServerHome } from './shell'

// Shared building blocks of the S-50 connect-ai states. Not a spec file (testMatch is `*.parity.ts`).
//
// The screen exists only in app-lite, so every state runs on the lite target on `/connect-ai` with the single-server shell.
// Legacy locators prefer role / text, then the legacy class names next copied. Next locators use the `connect-ai-*` data-testid
// vocabulary: `connect-ai-title`, `connect-ai-sidebar` / `connect-ai-sidebar-<key>`, `connect-ai-tabs` / `connect-ai-tab-<key>`,
// `connect-ai-panel-title`, `connect-ai-quick`, `connect-ai-step-num`, `connect-ai-step-title`, `connect-ai-code`, `connect-ai-copy`,
// `connect-ai-create-token`, `connect-ai-use-existing`, `connect-ai-docs`, `connect-ai-claude-notice`, `connect-ai-claude-code-instead`.

const HOUR = 3_600_000
const DAY = 86_400_000

/** A `GET /mcp-tokens` row (`McpTokenController`): ISO dates with a `Z` suffix, newest first. */
export interface McpTokenFixture {
  id: number
  name: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export function tokenFixture (id: number, overrides: Partial<McpTokenFixture> = {}): McpTokenFixture {
  return {
    id,
    name: `Token ${id}`,
    last_used_at: null,
    revoked_at: null,
    created_at: isoFromNow(-3 * DAY),
    ...overrides,
  }
}

/** An active token that was used recently. */
export const activeToken = tokenFixture(1, { name: 'Laptop', last_used_at: isoFromNow(-2 * HOUR), created_at: isoFromNow(-10 * DAY) })

/** An active token that never was used. */
export const neverUsedToken = tokenFixture(2, { name: 'CI runner', created_at: isoFromNow(-2 * DAY) })

/** A revoked token. */
export const revokedToken = tokenFixture(3, { name: 'Old phone', last_used_at: isoFromNow(-30 * DAY), revoked_at: isoFromNow(-20 * DAY), created_at: isoFromNow(-60 * DAY) })

export function tokensHandler (tokens: McpTokenFixture[]): Handler {
  return { json: { data: tokens } }
}

export function emptyLogsHandler (): Handler {
  return { json: { current_page: 1, data: [], last_page: 1, per_page: 20, total: 0 } }
}

export { DAY, HOUR }

// ---------------------------------------------------------------------------------------------
// Sidebar views
// ---------------------------------------------------------------------------------------------

/** Copy key of the sidebar entry of each view (what legacy shows in the list and in the tab strip). */
export const viewCopy = {
  'claudecode': 'heading.connectAi.toolNames.claudeCode',
  'chatgpt': 'heading.connectAi.toolNames.chatgpt',
  'codex': 'heading.connectAi.toolNames.codex',
  'claude': 'heading.connectAi.toolNames.claude',
  'cursor': 'heading.connectAi.toolNames.cursor',
  'windsurf': 'heading.connectAi.toolNames.windsurf',
  'vscode': 'heading.connectAi.toolNames.vscode',
  'other': 'heading.connectAi.toolNames.other',
  'tokens': 'heading.connectAi.tool.mcpUrlTokens',
  'capabilities': 'heading.connectAi.capabilities',
  'activity-log': 'heading.connectAi.activityLog',
} as const

export type ConnectAiView = keyof typeof viewCopy

/** The exact text of the entry: "Claude" is a prefix of "Claude Code", so a partial match would click the wrong one. */
export function selectView (view: ConnectAiView): StateAction {
  return async page => {
    const entry = page.locator('.sticky-sidebar').getByText(tr(viewCopy[view], 'lite'), { exact: true })
    // On mobile the entries are a scrolling tab strip; a tab past the fold is focused by a real click in legacy but never selected.
    if ((page.viewportSize()?.width ?? Infinity) < 768) {
      await entry.dispatchEvent('click')
      return
    }
    await entry.click()
  }
}

// ---------------------------------------------------------------------------------------------
// MCP URL normalisation
// ---------------------------------------------------------------------------------------------

/**
 * The MCP URL is derived from the API origin, which differs by design in the harness (legacy `//157.180.19.206:8444/mcp`,
 * next `//localhost:4174/mcp`). Both apps' text nodes get the same fixed host, so the well, the `url` step and the code snippets
 * compare with their real styles. It runs last: before that the DOM has no URL to rewrite.
 */
export const MCP_URL_PLACEHOLDER = '//app.example.com/mcp'

export function normaliseMcpOrigin (options: { waitForUrl?: boolean } = {}): StateAction {
  return async page => {
    if (options.waitForUrl ?? true) {
      await page.locator('.mcp-code').first().waitFor({ state: 'visible' })
    }
    // Legacy shows `//host/mcp`, next `https://host/mcp` (impl-review F5): the optional scheme is part of the match, so both
    // collapse to the same placeholder.
    await page.evaluate(placeholder => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const pattern = /(?:https?:)?\/\/[^\s"/]+\/mcp/g
      let node = walker.nextNode()
      while (node) {
        if (node.nodeValue && pattern.test(node.nodeValue)) {
          node.nodeValue = node.nodeValue.replaceAll(/(?:https?:)?\/\/[^\s"/]+\/mcp/g, placeholder)
        }
        pattern.lastIndex = 0
        node = walker.nextNode()
      }
    }, MCP_URL_PLACEHOLDER)
  }
}

// ---------------------------------------------------------------------------------------------
// State skeleton
// ---------------------------------------------------------------------------------------------

export interface ConnectAiStateOptions {
  /** The sidebar entry to open; Claude Code (the default view) when absent. */
  view?: ConnectAiView
  tokens?: Handler
  handlers?: Record<string, Handler>
  /** Steps after the view is selected (open a modal, expand a panel), before the origin is normalised. */
  legacy?: StateAction[]
  next?: StateAction[]
  /** The view shows the MCP URL (a tool panel with code or a `url` step, the tokens well). Default `true`. */
  waitForUrl?: boolean
  /** Whether to normalise the MCP URL at all. Default `true`. */
  normalise?: boolean
  probes?: Probe[]
  pointer?: ParityState['pointer']
}

/** Everything a Connect AI state shares: signed in, single server, `/connect-ai`, the shell fixtures, a fixed clock, the tokens and logs handlers. */
export function connectAiState (options: ConnectAiStateOptions = {}): Omit<ParityState, 'id'> {
  const base = shellState({
    target: 'lite',
    path: '/connect-ai',
    home: singleServerHome(),
    tabs: [...liteTabs],
    activeTab: 'connect-ai',
    clock: NOW,
    ...(options.pointer === undefined ? {} : { pointer: options.pointer }),
    probes: options.probes ?? [],
  })
  const select = options.view === undefined || options.view === 'claudecode' ? [] : [selectView(options.view)]
  const normalise = (options.normalise ?? true) ? [normaliseMcpOrigin({ waitForUrl: options.waitForUrl ?? true })] : []
  return {
    ...base,
    handlers: {
      ...shellHandlers([], 'projects'),
      'GET /mcp-tokens': options.tokens ?? tokensHandler([]),
      'GET /mcp-activity-logs': emptyLogsHandler(),
      ...options.handlers,
    },
    actions: {
      legacy: [...select, ...(options.legacy ?? []), ...normalise],
      next: [...select, ...(options.next ?? []), ...normalise],
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------------------------

export const titleProbe: Probe = {
  key: 'title',
  legacy: page => page.getByRole('heading', { level: 1 }),
  next: page => page.getByTestId('connect-ai-title'),
}

/** The active entry: a list item from `lg`, a tab below it (the variants are 1440 and 375 wide). */
export const sidebarActiveProbes: Probe[] = [
  {
    key: 'sidebar-active',
    legacy: page => page.locator('.sticky-sidebar .v-list-item--active'),
    next: page => page.locator('.sticky-sidebar .v-list-item--active'),
    when: isDesktop,
  },
  {
    key: 'sidebar-tab-active',
    legacy: page => page.locator('.sticky-sidebar [role=tab][aria-selected=true]'),
    next: page => page.locator('.sticky-sidebar [role=tab][aria-selected=true]'),
    when: variant => !isDesktop(variant),
  },
]

/** The first entry of the list or the tab strip, whether or not it is active. */
export const sidebarFirstProbe: Probe = {
  key: 'sidebar-first',
  legacy: page => page.locator('.sticky-sidebar').locator('.v-list-item, .v-tab').first(),
  next: page => page.locator('.sticky-sidebar').locator('.v-list-item, .v-tab').first(),
}

/** The title inside the active list item (desktop only; the tabs have no such element). */
export const sidebarTitleProbe: Probe = {
  key: 'sidebar-title',
  legacy: page => page.locator('.sticky-sidebar .v-list-item--active .v-list-item__title'),
  next: page => page.locator('.sticky-sidebar .v-list-item--active .v-list-item-title'),
  when: isDesktop,
}

export const panelTitleProbe: Probe = {
  key: 'panel-title',
  legacy: page => page.locator('.title-row h4').first(),
  next: page => page.getByTestId('connect-ai-panel-title'),
}

export const quickProbe: Probe = {
  key: 'quick',
  legacy: page => page.locator('.quick'),
  next: page => page.getByTestId('connect-ai-quick'),
}

export const quickIconProbe: Probe = {
  key: 'quick-icon',
  legacy: page => page.locator('.quick .v-icon'),
  next: page => page.getByTestId('connect-ai-quick').locator('.v-icon'),
  internal: true,
}

export const quickChipProbe: Probe = {
  key: 'quick-chip',
  legacy: page => page.locator('.quick .v-chip'),
  next: page => page.getByTestId('connect-ai-quick').locator('.v-chip'),
  internal: true,
}

export const copyButtonProbe: Probe = {
  key: 'copy-button',
  legacy: page => page.locator('.well .v-btn').first(),
  next: page => page.getByTestId('connect-ai-copy').first(),
}

export const stepNumProbe: Probe = {
  key: 'step-num',
  legacy: page => page.locator('.step__num').first(),
  next: page => page.getByTestId('connect-ai-step-num').first(),
}

export const stepTitleProbe: Probe = {
  key: 'step-title',
  legacy: page => page.locator('.step__title').first(),
  next: page => page.getByTestId('connect-ai-step-title').first(),
}

export const codeProbe: Probe = {
  key: 'code',
  legacy: page => page.locator('pre.mcp-code').first(),
  next: page => page.getByTestId('connect-ai-code').first(),
}

export const createTokenProbe: Probe = {
  key: 'create-token',
  legacy: page => page.getByRole('button', { name: tr('heading.connectAi.createToken', 'lite'), exact: true }).first(),
  next: page => page.getByTestId('connect-ai-create-token').first(),
}

export const createTokenIconProbe: Probe = {
  key: 'create-token-icon',
  legacy: page => page.getByRole('button', { name: tr('heading.connectAi.createToken', 'lite'), exact: true }).first().locator('.v-icon'),
  next: page => page.getByTestId('connect-ai-create-token').locator('.v-icon'),
  internal: true,
}

export const createTokenContentProbe: Probe = {
  key: 'create-token-content',
  legacy: page => page.getByRole('button', { name: tr('heading.connectAi.createToken', 'lite'), exact: true }).first().locator('.v-btn__content'),
  next: page => page.getByTestId('connect-ai-create-token').locator('.v-btn__content'),
  internal: true,
}

export const useExistingProbe: Probe = {
  key: 'use-existing',
  legacy: page => page.getByRole('link', { name: tr('heading.connectAi.tool.useExistingToken', 'lite'), exact: true }),
  next: page => page.getByTestId('connect-ai-use-existing'),
}

export const docsProbe: Probe = {
  key: 'docs',
  legacy: page => page.locator('a.v-btn', { hasText: tr('heading.connectAi.tool.readDocs', 'lite') }),
  next: page => page.getByTestId('connect-ai-docs'),
}

export const urlStepProbe: Probe = {
  key: 'url-well',
  legacy: page => page.locator('.well').filter({ has: page.locator('code.mcp-code') }).first(),
  next: page => page.locator('.well').filter({ has: page.locator('code.mcp-code') }).first(),
}

export const claudeNoticeProbe: Probe = {
  key: 'claude-notice',
  legacy: page => page.locator('.connect-ai-claude-notice'),
  next: page => page.getByTestId('connect-ai-claude-notice'),
}

export const claudeCodeInsteadProbe: Probe = {
  key: 'claude-code-instead',
  legacy: page => page.getByRole('button', { name: tr('heading.connectAi.instructions.claude.setUpCodeInstead', 'lite') }),
  next: page => page.getByTestId('connect-ai-claude-code-instead'),
}

export const claudeNoticeTitleProbe: Probe = {
  key: 'claude-notice-title',
  legacy: page => page.locator('.connect-ai-claude-notice .font-weight-600'),
  next: page => page.getByTestId('connect-ai-claude-notice').locator('.font-weight-600'),
  internal: true,
}

export const claudeNoticeBodyProbe: Probe = {
  key: 'claude-notice-body',
  legacy: page => page.locator('.connect-ai-claude-notice p').first(),
  next: page => page.getByTestId('connect-ai-claude-notice').locator('p').first(),
  internal: true,
}

export const claudeNoticeAltProbe: Probe = {
  key: 'claude-notice-alt',
  legacy: page => page.locator('.connect-ai-claude-notice p').nth(1),
  next: page => page.getByTestId('connect-ai-claude-notice').locator('p').nth(1),
  internal: true,
}

// ---------------------------------------------------------------------------------------------
// Tokens view and modals
// ---------------------------------------------------------------------------------------------

/** The tokens the table states start from. */
export const POPULATED_TOKENS = [activeToken, neverUsedToken, revokedToken]

/** The one-time value `POST /mcp-tokens` answers with. */
export const PLAIN_TEXT_TOKEN = 'pa_mcp_3f9c1d7a5b2e4c8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f'

/** Waits for the table to show the fixture rows (the empty state of the first tick and the skeleton both come before them). */
export const waitForTokenRows: StateAction = async page => {
  await page.locator('.data-table tbody tr', { hasText: activeToken.name }).waitFor({ state: 'visible' })
}

export const waitForNoTokens: StateAction = async page => {
  await page.getByText(tr('heading.connectAi.noTokens', 'lite'), { exact: true }).waitFor({ state: 'visible' })
}

/** `GET /mcp-tokens` answers 500 (phase 13): the tokens section alerts and the list stays empty (`connect-ai.store` `fetchTokens`). */
export const tokensListError: Handler = { status: 500, json: { message: 'Server Error' } }

/** The error alert of the alert stack; the transient element of the error states, captured only once it shows. */
export const errorAlert = (page: Page) => page.locator('.alert-manager .alert--error')

export const waitForErrorAlert: StateAction = async page => {
  await errorAlert(page).first().waitFor({ state: 'visible' })
}

const createTokenButton = (page: Page) => page.getByRole('button', { name: tr('heading.connectAi.createToken', 'lite'), exact: true })

/** The row of a token and one of its icon actions (revoke first, delete last); both apps keep the `.actions-row` class, and the mobile card its last row. */
function rowAction (name: string, which: 'first' | 'last'): StateAction {
  return async page => {
    const row = page.locator('.data-table tbody tr', { hasText: name }).first()
    const buttons = row.locator('.actions-row .v-btn, .mobile-table-item__row:last-child .v-btn')
    await (which === 'first' ? buttons.first() : buttons.last()).click()
  }
}

/** The dialog box of the open modal: legacy and next both give the card `.basic-modal`. */
export const modalBox = (page: Page) => page.locator('.basic-modal')

/** Opens the create modal from the tokens view, without typing a name. */
export const openCreateModal: StateAction = async page => {
  await createTokenButton(page).click()
  await settled(modalBox(page))
}

/** Opens the create modal from the tokens view and types a name. */
export const openCreateModalWithName: StateAction = async page => {
  await openCreateModal(page)
  await modalBox(page).getByPlaceholder(tr('heading.connectAi.tokenNamePlaceholder', 'lite')).fill('Laptop')
}

/** Submits the typed name and waits for the one-time token (step 2). */
export const submitCreateModal: StateAction = async page => {
  await modalBox(page).getByRole('button', { name: tr('button.create', 'lite'), exact: true }).click()
  await modalBox(page).getByText(PLAIN_TEXT_TOKEN).waitFor({ state: 'visible' })
  await settled(modalBox(page))
}

/** `POST /mcp-tokens` rejected on the name (Laravel `errors` bag: `getErrorMessage` prints `name: <message>`, legacy `Api.js` the same). */
export const createTokenNameTaken: Handler = {
  status: 422,
  json: { message: 'The given data was invalid.', errors: { name: ['The name has already been taken.'] } },
}

/** Submits the typed name and waits for the error alert of the alert stack; the modal stays on step 1 (`McpTokenCreateModal` `catch`). */
export const submitCreateModalFailing: StateAction = async page => {
  await modalBox(page).getByRole('button', { name: tr('button.create', 'lite'), exact: true }).click()
  await page.locator('.alert-manager .alert--error').first().waitFor({ state: 'visible' })
  await settled(modalBox(page))
}

/** Submits the typed name and waits for the spinner of the Create button; `POST /mcp-tokens` is held, so the request stays in flight (`submitting`). */
export const submitCreateModalHeld: StateAction = async page => {
  await modalBox(page).getByRole('button', { name: tr('button.create', 'lite'), exact: true }).click()
  await modalBox(page).locator('.v-progress-circular').first().waitFor({ state: 'visible' })
  await settled(modalBox(page))
}

export function openRevokeModal (name: string): StateAction {
  return async page => {
    await rowAction(name, 'first')(page)
    await settled(modalBox(page))
  }
}

export function openDeleteModal (name: string): StateAction {
  return async page => {
    await rowAction(name, 'last')(page)
    await settled(modalBox(page))
  }
}

/** Ticks the confirmation checkbox of the open revoke / delete modal (`.checkbox`, both apps), then clears the hover and waits for the box to settle. */
export const tickModalConfirm: StateAction = async page => {
  await modalBox(page).locator('.checkbox').click()
  await page.mouse.move(0, 0)
  await settled(modalBox(page))
}

export const serverUrlTitleProbe: Probe = {
  key: 'server-url-title',
  legacy: page => page.locator('.title-row h4').nth(0),
  next: page => page.getByTestId('connect-ai-server-url-title'),
}

export const tokensTitleProbe: Probe = {
  key: 'tokens-title',
  legacy: page => page.locator('.title-row h4').nth(1),
  next: page => page.getByTestId('connect-ai-tokens-title'),
}

export const tokensCardProbe: Probe = {
  key: 'tokens-card',
  legacy: page => page.locator('.data-table'),
  next: page => page.getByTestId('connect-ai-tokens'),
}

export const tokensEmptyProbe: Probe = {
  key: 'tokens-empty',
  legacy: page => page.locator('.data-table .v-card__text'),
  next: page => page.getByTestId('connect-ai-tokens-empty'),
}

export const tokensSortRowProbe: Probe = {
  key: 'tokens-sort-row',
  legacy: page => page.locator('tr.custom-sort'),
  next: page => page.locator('tr.custom-sort'),
  when: isDesktop,
}

function tableRow (page: Page, index: number) {
  return page.locator('.data-table tbody tr').nth(index)
}

export const tokenRowProbes: Probe[] = [
  { key: 'row-1', legacy: page => tableRow(page, 0), next: page => tableRow(page, 0) },
  { key: 'row-3', legacy: page => tableRow(page, 2), next: page => tableRow(page, 2) },
]

/** The cells of the first and third row (active used, revoked): name, last used, status chip, actions. Desktop only. */
export const tokenCellProbes: Probe[] = [
  { key: 'row-1-name', legacy: page => tableRow(page, 0).locator('td').nth(0).locator('span'), next: page => tableRow(page, 0).locator('td').nth(0).locator('span'), when: isDesktop },
  { key: 'row-1-last-used', legacy: page => tableRow(page, 0).locator('td').nth(2).locator('span').first(), next: page => tableRow(page, 0).locator('td').nth(2).locator('span').first(), when: isDesktop },
  { key: 'row-1-status', legacy: page => tableRow(page, 0).locator('.v-chip'), next: page => tableRow(page, 0).locator('.v-chip'), when: isDesktop },
  { key: 'row-1-actions', legacy: page => tableRow(page, 0).locator('.actions-row'), next: page => tableRow(page, 0).locator('.actions-row'), when: isDesktop },
  { key: 'row-3-name', legacy: page => tableRow(page, 2).locator('td').nth(0).locator('span'), next: page => tableRow(page, 2).locator('td').nth(0).locator('span'), when: isDesktop },
  { key: 'row-3-status', legacy: page => tableRow(page, 2).locator('.v-chip'), next: page => tableRow(page, 2).locator('.v-chip'), when: isDesktop },
]

export const modalProbes: Probe[] = [
  { key: 'modal', legacy: modalBox, next: modalBox },
  { key: 'modal-icon', legacy: page => modalBox(page).locator('h6 .v-icon'), next: page => modalBox(page).locator('h6 .v-icon'), internal: true },
  { key: 'modal-title-text', legacy: page => modalBox(page).locator('h6 > span').last(), next: page => modalBox(page).locator('h6 > span').last(), internal: true },
  { key: 'modal-title', legacy: page => modalBox(page).locator('h6'), next: page => modalBox(page).locator('h6') },
  { key: 'modal-actions', legacy: page => modalBox(page).locator('.v-card__actions'), next: page => modalBox(page).locator('.v-card-actions') },
  { key: 'modal-submit', legacy: page => modalBox(page).locator('.v-card__actions .v-btn').last(), next: page => modalBox(page).locator('.v-card-actions .v-btn').last() },
]

export const modalInputProbe: Probe = {
  key: 'modal-input',
  legacy: page => modalBox(page).locator('input').first(),
  next: page => modalBox(page).locator('input').first(),
  part: 'input',
}

export const modalCheckboxProbe: Probe = {
  key: 'modal-checkbox',
  legacy: page => modalBox(page).locator('.checkbox'),
  next: page => modalBox(page).locator('.checkbox'),
}

/** Label of the last action button (Revoke / Delete): its colour and `-webkit-text-fill-color` in the disabled chip (S-133). */
export const modalSubmitLabelProbe: Probe = {
  key: 'modal-submit-label',
  legacy: page => modalBox(page).locator('.v-card__actions .v-btn').last().locator('.v-btn__content span').first(),
  next: page => modalBox(page).locator('.v-card-actions .v-btn').last().locator('.v-btn__content span').first(),
}

export const modalTokenProbe: Probe = {
  key: 'modal-token',
  legacy: page => modalBox(page).locator('.well'),
  next: page => modalBox(page).locator('.well'),
}

export const modalWarningProbe: Probe = {
  key: 'modal-warning',
  legacy: page => modalBox(page).locator('.alert'),
  next: page => modalBox(page).locator('.alert'),
}
