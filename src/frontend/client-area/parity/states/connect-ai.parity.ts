import type { ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { alertProbes, buttonFocusState, buttonHoverState, tr } from './auth'
import {
  activeToken,
  claudeCodeInsteadProbe,
  claudeNoticeAltProbe,
  claudeNoticeBodyProbe,
  claudeNoticeProbe,
  claudeNoticeTitleProbe,
  codeProbe,
  connectAiState,
  copyButtonProbe,
  createTokenContentProbe,
  createTokenIconProbe,
  createTokenNameTaken,
  createTokenProbe,
  docsProbe,
  errorAlert,
  modalBox,
  modalCheckboxProbe,
  modalInputProbe,
  modalProbes,
  modalSubmitLabelProbe,
  modalTokenProbe,
  modalWarningProbe,
  openCreateModal,
  openCreateModalWithName,
  openDeleteModal,
  openRevokeModal,
  panelTitleProbe,
  PLAIN_TEXT_TOKEN,
  POPULATED_TOKENS,
  quickChipProbe,
  quickIconProbe,
  quickProbe,
  serverUrlTitleProbe,
  sidebarActiveProbes,
  sidebarFirstProbe,
  sidebarTitleProbe,
  stepNumProbe,
  stepTitleProbe,
  submitCreateModal,
  submitCreateModalFailing,
  submitCreateModalHeld,
  tickModalConfirm,
  titleProbe,
  tokenCellProbes,
  tokenFixture,
  tokenRowProbes,
  tokensCardProbe,
  tokensEmptyProbe,
  tokensHandler,
  tokensListError,
  tokensSortRowProbe,
  tokensTitleProbe,
  urlStepProbe,
  useExistingProbe,
  viewCopy,
  waitForErrorAlert,
  waitForNoTokens,
  waitForTokenRows,
} from './connect-ai'
import {
  activityFilterProbe,
  activityTitleProbe,
  capabilitiesCardProbe,
  capabilitiesTitleProbe,
  capabilityOpenProbes,
  capabilityProbes,
  logRowProbes,
  logsCardProbe,
  logsEmptyProbe,
  logsEmptyTitleProbe,
  logsFixture,
  logsFooterProbe,
  logsHandler,
  logsListError,
  logsSortRowProbe,
  openFirstCapability,
  waitForLogRows,
  waitForNoLogs,
} from './connect-ai-logs'
import { isDesktop } from './shell'

// ui-connect-ai (S-121, M-2): connect-ai is app-lite only, target `lite`, 26 states on the 7-state matrix (see plan.md).
// Every state is signed in on /connect-ai with the single-server shell, a fixed
// clock and the tokens / activity-log handlers (see connect-ai.ts). The MCP URL is normalised in both apps before capture.
// Each state id is a literal `id: '…',` line, which `registeredStateIds` in report/write-report.ts reads as text.

const toolProbes = [titleProbe, ...sidebarActiveProbes, sidebarTitleProbe, sidebarFirstProbe, panelTitleProbe, quickProbe, quickIconProbe, quickChipProbe, stepNumProbe, stepTitleProbe, createTokenProbe, createTokenIconProbe, createTokenContentProbe]

export const connectAiDefault: ParityState = {
  id: 'connect-ai-default',
  ...connectAiState({
    probes: [...toolProbes, codeProbe, copyButtonProbe, docsProbe],
  }),
}

export const connectAiClaudecodeHasToken: ParityState = {
  id: 'connect-ai-claudecode-has-token',
  ...connectAiState({
    tokens: tokensHandler([activeToken]),
    probes: [...toolProbes, useExistingProbe, codeProbe, docsProbe],
  }),
}

export const connectAiChatgpt: ParityState = {
  id: 'connect-ai-chatgpt',
  ...connectAiState({
    view: 'chatgpt',
    probes: [...toolProbes, urlStepProbe, docsProbe],
  }),
}

export const connectAiClaude: ParityState = {
  id: 'connect-ai-claude',
  ...connectAiState({
    view: 'claude',
    waitForUrl: false,
    normalise: false,
    probes: [titleProbe, ...sidebarActiveProbes, sidebarTitleProbe, sidebarFirstProbe, panelTitleProbe, quickProbe, claudeNoticeProbe, claudeNoticeTitleProbe, claudeNoticeBodyProbe, claudeNoticeAltProbe, claudeCodeInsteadProbe],
  }),
}

export const connectAiCursor: ParityState = {
  id: 'connect-ai-cursor',
  ...connectAiState({
    view: 'cursor',
    probes: [...toolProbes, codeProbe, copyButtonProbe, docsProbe],
  }),
}

// One representative of the shared general-panel path (Codex, Windsurf, VS Code, Other); the others are not measured.
export const connectAiVscode: ParityState = {
  id: 'connect-ai-vscode',
  ...connectAiState({
    view: 'vscode',
    probes: [...toolProbes, codeProbe, copyButtonProbe, docsProbe],
  }),
}

// Tokens view (S-50 phase 2). The MCP URL well and the table both need the view's own request to have answered.
const tokensProbes = [titleProbe, ...sidebarActiveProbes, serverUrlTitleProbe, urlStepProbe, tokensTitleProbe, createTokenProbe, tokensCardProbe]

export const connectAiTokensLoading: ParityState = {
  id: 'connect-ai-tokens-loading',
  ...connectAiState({
    view: 'tokens',
    tokens: 'hold',
    // The loading table is skeleton cards below `lg`, so its first row exists on desktop only.
    probes: [...tokensProbes, ...tokenRowProbes.slice(0, 1).map(probe => ({ ...probe, when: isDesktop }))],
  }),
}

export const connectAiTokensEmpty: ParityState = {
  id: 'connect-ai-tokens-empty',
  ...connectAiState({
    view: 'tokens',
    legacy: [waitForNoTokens],
    next: [waitForNoTokens],
    probes: [...tokensProbes, tokensEmptyProbe],
  }),
}

// Error of the tokens load (phase 13): `GET /mcp-tokens` answers 500 (both GETs of the view share the handler); the alert shows, the list stays empty.
export const connectAiTokensError: ParityState = {
  id: 'connect-ai-tokens-error',
  ...connectAiState({
    view: 'tokens',
    handlers: { 'GET /mcp-tokens': tokensListError },
    legacy: [waitForErrorAlert, waitForNoTokens],
    next: [waitForErrorAlert, waitForNoTokens],
    probes: [...tokensProbes, tokensEmptyProbe, ...alertProbes(errorAlert)],
  }),
}

const populated = {
  tokens: tokensHandler(POPULATED_TOKENS),
  view: 'tokens' as const,
  legacy: [waitForTokenRows],
  next: [waitForTokenRows],
}

export const connectAiTokensPopulated: ParityState = {
  id: 'connect-ai-tokens-populated',
  ...connectAiState({
    ...populated,
    probes: [...tokensProbes, tokensSortRowProbe, ...tokenRowProbes, ...tokenCellProbes],
  }),
}

const createdToken = tokenFixture(4, { name: 'Laptop', created_at: '2026-10-05T12:00:00.000Z' })

export const connectAiModalCreate: ParityState = {
  id: 'connect-ai-modal-create',
  ...connectAiState({
    ...populated,
    legacy: [...populated.legacy, openCreateModalWithName],
    next: [...populated.next, openCreateModalWithName],
    probes: [...modalProbes, modalInputProbe],
  }),
}

// Disabled Create (phase 11): the name is empty, so the step-1 Create button is disabled (`McpTokenCreateModal` `:disabled="!name.trim()"`,
// legacy `:disabled="!name.trim()"`). The assertion runs before the probes measure the button (`modal-submit`).
const expectCreateDisabled: StateAction = async page => {
  await expect(modalBox(page).getByRole('button', { name: tr('button.create', 'lite'), exact: true }), 'Create disabled with an empty name').toBeDisabled()
}

export const connectAiModalCreateEmpty: ParityState = {
  id: 'connect-ai-modal-create-empty',
  ...connectAiState({
    ...populated,
    legacy: [...populated.legacy, openCreateModal, expectCreateDisabled],
    next: [...populated.next, openCreateModal, expectCreateDisabled],
    probes: [...modalProbes, modalInputProbe],
  }),
}

// Error of the create (phase 12): `POST /mcp-tokens` answers 422 on the name; the alert stack shows the message and the modal stays on step 1.
export const connectAiModalCreateError: ParityState = {
  id: 'connect-ai-modal-create-error',
  ...connectAiState({
    ...populated,
    handlers: { 'POST /mcp-tokens': createTokenNameTaken },
    legacy: [...populated.legacy, openCreateModalWithName, submitCreateModalFailing],
    next: [...populated.next, openCreateModalWithName, submitCreateModalFailing],
    probes: [...modalProbes, modalInputProbe, ...alertProbes(page => page.locator('.alert-manager .alert--error'))],
  }),
}

// Loading of the create (phase 14): `POST /mcp-tokens` is held, so Create shows its spinner (`McpTokenCreateModal` `:loading="submitting"`),
// the header loses the close button (`v-if="!submitting"`) and Cancel is disabled (`:disabled="submitting"`). The spinner is masked.
const modalHeaderProbe: Probe = {
  key: 'modal-header',
  legacy: page => modalBox(page).locator('.v-card__title'),
  next: page => modalBox(page).locator('.v-card-title'),
}

const modalCancelProbe: Probe = {
  key: 'modal-cancel',
  legacy: page => modalBox(page).getByRole('button', { name: tr('button.cancel', 'lite'), exact: true }),
  next: page => modalBox(page).getByRole('button', { name: tr('button.cancel', 'lite'), exact: true }),
}

const createSpinnerMask = (page: Page) => modalBox(page).locator('.v-progress-circular')

export const connectAiModalCreateSubmitting: ParityState = {
  id: 'connect-ai-modal-create-submitting',
  ...connectAiState({
    ...populated,
    handlers: { 'POST /mcp-tokens': 'hold' },
    legacy: [...populated.legacy, openCreateModalWithName, submitCreateModalHeld],
    next: [...populated.next, openCreateModalWithName, submitCreateModalHeld],
    probes: [...modalProbes, modalInputProbe, modalHeaderProbe, modalCancelProbe],
  }),
  masks: { legacy: [createSpinnerMask], next: [createSpinnerMask] },
}

export const connectAiModalCreateToken: ParityState = {
  id: 'connect-ai-modal-create-token',
  ...connectAiState({
    ...populated,
    handlers: { 'POST /mcp-tokens': { status: 201, json: { data: { ...createdToken, plain_text_token: PLAIN_TEXT_TOKEN } } } },
    legacy: [...populated.legacy, openCreateModalWithName, submitCreateModal],
    next: [...populated.next, openCreateModalWithName, submitCreateModal],
    probes: [...modalProbes, modalInputProbe, modalTokenProbe, modalWarningProbe, modalCheckboxProbe],
  }),
}

export const connectAiModalRevoke: ParityState = {
  id: 'connect-ai-modal-revoke',
  ...connectAiState({
    ...populated,
    legacy: [...populated.legacy, openRevokeModal(activeToken.name)],
    next: [...populated.next, openRevokeModal(activeToken.name)],
    probes: [...modalProbes, modalCheckboxProbe],
  }),
}

// Disabled Revoke (S-133, app-lite 4a5a3391): the checkbox is not ticked, so Revoke is `disabled` (`:disabled="!confirm || submitting"`).
// The assertion runs before the probes measure the button (`modal-submit`, `modal-submit-label`).
const expectRevokeDisabled: StateAction = async page => {
  await expect(modalBox(page).getByRole('button', { name: tr('button.connectAi.revoke', 'lite'), exact: true }), 'Revoke disabled before the confirmation').toBeDisabled()
}

export const connectAiRevokeDisabled: ParityState = {
  id: 'connect-ai-revoke-disabled',
  ...connectAiState({
    ...populated,
    legacy: [...populated.legacy, openRevokeModal(activeToken.name), expectRevokeDisabled],
    next: [...populated.next, openRevokeModal(activeToken.name), expectRevokeDisabled],
    probes: [...modalProbes, modalCheckboxProbe, modalSubmitLabelProbe],
  }),
}

// Disabled Delete (S-133, app-lite 4a5a3391): the checkbox is not ticked, so Delete is `disabled` (`:disabled="!confirm || submitting"`).
// The assertion runs before the probes measure the button (`modal-submit`, `modal-submit-label`).
const expectDeleteDisabled: StateAction = async page => {
  await expect(modalBox(page).getByRole('button', { name: tr('button.delete', 'lite'), exact: true }), 'Delete disabled before the confirmation').toBeDisabled()
}

export const connectAiDeleteDisabled: ParityState = {
  id: 'connect-ai-delete-disabled',
  ...connectAiState({
    ...populated,
    legacy: [...populated.legacy, openDeleteModal(activeToken.name), expectDeleteDisabled],
    next: [...populated.next, openDeleteModal(activeToken.name), expectDeleteDisabled],
    probes: [...modalProbes, modalCheckboxProbe, modalSubmitLabelProbe],
  }),
}

// Enabled Revoke (S-133, phase 4): the checkbox is ticked, so Revoke is no longer `disabled` (`:disabled="!confirm || submitting"`).
// The assertion runs after the tick and before the probes measure the button (`modal-submit`, `modal-submit-label`).
const expectRevokeEnabled: StateAction = async page => {
  await expect(modalBox(page).getByRole('button', { name: tr('button.connectAi.revoke', 'lite'), exact: true }), 'Revoke enabled after the confirmation').toBeEnabled()
}

export const connectAiRevokeConfirmed: ParityState = {
  id: 'connect-ai-revoke-confirmed',
  ...connectAiState({
    ...populated,
    legacy: [...populated.legacy, openRevokeModal(activeToken.name), tickModalConfirm, expectRevokeEnabled],
    next: [...populated.next, openRevokeModal(activeToken.name), tickModalConfirm, expectRevokeEnabled],
    probes: [...modalProbes, modalCheckboxProbe, modalSubmitLabelProbe],
  }),
}

export const connectAiModalDelete: ParityState = {
  id: 'connect-ai-modal-delete',
  ...connectAiState({
    ...populated,
    legacy: [...populated.legacy, openDeleteModal(activeToken.name)],
    next: [...populated.next, openDeleteModal(activeToken.name)],
    probes: [...modalProbes, modalCheckboxProbe],
  }),
}

// Enabled Delete (S-133, phase 4): the checkbox is ticked, so Delete is no longer `disabled` (`:disabled="!confirm || submitting"`).
// The assertion runs after the tick and before the probes measure the button (`modal-submit`, `modal-submit-label`).
const expectDeleteEnabled: StateAction = async page => {
  await expect(modalBox(page).getByRole('button', { name: tr('button.delete', 'lite'), exact: true }), 'Delete enabled after the confirmation').toBeEnabled()
}

export const connectAiDeleteConfirmed: ParityState = {
  id: 'connect-ai-delete-confirmed',
  ...connectAiState({
    ...populated,
    legacy: [...populated.legacy, openDeleteModal(activeToken.name), tickModalConfirm, expectDeleteEnabled],
    next: [...populated.next, openDeleteModal(activeToken.name), tickModalConfirm, expectDeleteEnabled],
    probes: [...modalProbes, modalCheckboxProbe, modalSubmitLabelProbe],
  }),
}

// Capabilities (S-50 phase 3): a static list, all categories closed on entry. No MCP URL on the page.
const capabilitiesProbes = [titleProbe, ...sidebarActiveProbes, capabilitiesTitleProbe, capabilitiesCardProbe, ...capabilityProbes]

export const connectAiCapabilities: ParityState = {
  id: 'connect-ai-capabilities',
  ...connectAiState({
    view: 'capabilities',
    waitForUrl: false,
    normalise: false,
    probes: capabilitiesProbes,
  }),
}

export const connectAiCapabilitiesOpen: ParityState = {
  id: 'connect-ai-capabilities-open',
  ...connectAiState({
    view: 'capabilities',
    waitForUrl: false,
    normalise: false,
    legacy: [openFirstCapability],
    next: [openFirstCapability],
    probes: [...capabilitiesProbes, ...capabilityOpenProbes],
  }),
}

// Activity log (S-50 phase 3).
const logsProbes = [titleProbe, ...sidebarActiveProbes, activityTitleProbe, activityFilterProbe, logsCardProbe]

export const connectAiActivityLogLoading: ParityState = {
  id: 'connect-ai-activity-log-loading',
  ...connectAiState({
    view: 'activity-log',
    waitForUrl: false,
    normalise: false,
    handlers: { 'GET /mcp-activity-logs': 'hold' },
    probes: logsProbes,
  }),
}

export const connectAiActivityLogEmpty: ParityState = {
  id: 'connect-ai-activity-log-empty',
  ...connectAiState({
    view: 'activity-log',
    waitForUrl: false,
    normalise: false,
    handlers: { 'GET /mcp-activity-logs': logsHandler([], 0) },
    legacy: [waitForNoLogs],
    next: [waitForNoLogs],
    probes: [...logsProbes, logsEmptyProbe, logsEmptyTitleProbe],
  }),
}

// Error of the activity-log load (phase 13): `GET /mcp-activity-logs` answers 500; the alert shows and the list stays empty.
export const connectAiActivityLogError: ParityState = {
  id: 'connect-ai-activity-log-error',
  ...connectAiState({
    view: 'activity-log',
    waitForUrl: false,
    normalise: false,
    handlers: { 'GET /mcp-activity-logs': logsListError },
    legacy: [waitForErrorAlert],
    next: [waitForErrorAlert],
    probes: [...logsProbes, logsEmptyProbe, ...alertProbes(errorAlert)],
  }),
}

export const connectAiActivityLogPopulated: ParityState = {
  id: 'connect-ai-activity-log-populated',
  ...connectAiState({
    view: 'activity-log',
    waitForUrl: false,
    normalise: false,
    tokens: tokensHandler(POPULATED_TOKENS),
    handlers: { 'GET /mcp-activity-logs': logsHandler(logsFixture(), 45) },
    legacy: [waitForLogRows],
    next: [waitForLogRows],
    probes: [...logsProbes, logsSortRowProbe, ...logRowProbes, logsFooterProbe],
  }),
}

// Hover (S-121 phase 9, matrix `hover`). The Create Token button of the tokens view (`page-title__add-button`, next
// `connect-ai-create-token`); `keepScroll`, because the button may sit below the fold on the smaller variants.
export const connectAiCreateTokenHover: ParityState = {
  ...buttonHoverState(connectAiTokensPopulated, 'connect-ai-create-token-hover', 'button.connectAi.createToken', 'lite'),
  id: 'connect-ai-create-token-hover',
  keepScroll: true,
}

// Keyboard focus (S-121 phase 10, matrix `focus-visible`). The same Create Token button, focused with the keyboard
// (`buttonFocusState` in auth.ts: `:focus-visible` asserted, V4 `::after` ring hidden in next).
export const connectAiCreateTokenFocus: ParityState = {
  ...buttonFocusState(connectAiTokensPopulated, 'connect-ai-create-token-focus', 'button.connectAi.createToken', 'lite'),
  id: 'connect-ai-create-token-focus',
}

// The inactive sidebar entry of the default view (ChatGPT): the list item on desktop, the tab below `lgAndDown`.
const sidebarHoverCopy = tr(viewCopy.chatgpt, 'lite')

function sidebarEntry (page: Page, app: 'legacy' | 'next'): Locator {
  if (app === 'legacy') {
    return page.locator('.sticky-sidebar .v-list-item, .sticky-sidebar .v-tab').filter({ hasText: sidebarHoverCopy }).first()
  }
  return page.getByTestId('connect-ai-sidebar-chatgpt').or(page.getByTestId('connect-ai-tab-chatgpt'))
}

function hoverSidebarEntry (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await sidebarEntry(page, app).hover()
  }
}

// The hover is final only while the pointer stays on the entry: the probes must not move it away.
function sidebarStillHovered (app: 'legacy' | 'next'): StateAction {
  return async page => {
    expect(await sidebarEntry(page, app).evaluate(element => element.matches(':hover')), 'pointer on the sidebar entry').toBe(true)
  }
}

// The hover overlay of the entry: `::before` on legacy, `.v-list-item__overlay` on next (as the button overlay probe in auth.ts).
const sidebarOverlayProbe: Probe = {
  key: 'sidebar-hover-overlay',
  when: isDesktop,
  legacy: page => sidebarEntry(page, 'legacy'),
  next: page => page.getByTestId('connect-ai-sidebar-chatgpt').locator('.v-list-item__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

export const connectAiSidebarItemHover: ParityState = {
  ...connectAiDefault,
  id: 'connect-ai-sidebar-item-hover',
  pointer: 'keep',
  actions: {
    legacy: [...connectAiDefault.actions.legacy, hoverSidebarEntry('legacy')],
    next: [...connectAiDefault.actions.next, hoverSidebarEntry('next')],
  },
  probes: [...connectAiDefault.probes, sidebarOverlayProbe],
  afterCapture: { legacy: [sidebarStillHovered('legacy')], next: [sidebarStillHovered('next')] },
}

const states: ParityState[] = [
  connectAiDefault,
  connectAiClaudecodeHasToken,
  connectAiChatgpt,
  connectAiClaude,
  connectAiCursor,
  connectAiVscode,
  connectAiTokensLoading,
  connectAiTokensEmpty,
  connectAiTokensError,
  connectAiTokensPopulated,
  connectAiModalCreate,
  connectAiModalCreateEmpty,
  connectAiModalCreateError,
  connectAiModalCreateSubmitting,
  connectAiModalCreateToken,
  connectAiModalRevoke,
  connectAiRevokeDisabled,
  connectAiRevokeConfirmed,
  connectAiModalDelete,
  connectAiDeleteDisabled,
  connectAiDeleteConfirmed,
  connectAiCapabilities,
  connectAiCapabilitiesOpen,
  connectAiActivityLogLoading,
  connectAiActivityLogEmpty,
  connectAiActivityLogError,
  connectAiActivityLogPopulated,
  connectAiCreateTokenHover,
  connectAiSidebarItemHover,
  connectAiCreateTokenFocus,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
