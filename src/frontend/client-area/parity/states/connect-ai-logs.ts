import type { Handler, Probe, StateAction } from './state'
import type { Page } from '@playwright/test'
import { settled, tr } from './auth'
import { activeToken, neverUsedToken } from './connect-ai'
import { isDesktop, isoFromNow } from './shell'

// Probes, fixtures and actions of the S-50 capabilities and activity-log states (phase 3). Not a spec file (testMatch is `*.parity.ts`).

// ---------------------------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------------------------

export const capabilitiesTitleProbe: Probe = {
  key: 'capabilities-title',
  legacy: page => page.locator('.title-row h4').first(),
  next: page => page.getByTestId('connect-ai-capabilities-title'),
}

export const capabilitiesCardProbe: Probe = {
  key: 'capabilities-card',
  legacy: page => page.locator('.v-card').filter({ has: page.locator('.v-expansion-panels') }),
  next: page => page.getByTestId('connect-ai-capabilities'),
}

function capabilityPanel (index: number) {
  return (page: Page) => page.locator('.v-expansion-panel').nth(index)
}

export const capabilityProbes: Probe[] = [
  { key: 'panel-1', legacy: capabilityPanel(0), next: capabilityPanel(0) },
  { key: 'panel-2', legacy: capabilityPanel(1), next: capabilityPanel(1) },
  { key: 'panel-6', legacy: capabilityPanel(5), next: capabilityPanel(5) },
  { key: 'cap-text', legacy: page => page.locator('.v-card').filter({ has: page.locator('.v-expansion-panels') }).locator('.v-card__text'), next: page => page.getByTestId('connect-ai-capabilities').locator('.v-card-text') },
  { key: 'panels', legacy: page => page.locator('.v-expansion-panels'), next: page => page.locator('.v-expansion-panels') },
  { key: 'panel-1-title', legacy: page => page.locator('.v-expansion-panel-header').first(), next: page => page.locator('.v-expansion-panel-title').first() },
  { key: 'panel-1-icon', legacy: page => page.locator('.v-expansion-panel-header .d-flex .v-icon').first(), next: page => page.locator('.v-expansion-panel-title .d-flex .v-icon').first() },
]

export const capabilityOpenProbes: Probe[] = [
  { key: 'panel-1-item', legacy: page => page.locator('.capabilities-list__item').first(), next: page => page.locator('.capabilities-list__item').first() },
  { key: 'panel-1-bullet', legacy: page => page.locator('.capabilities-list__bullet').first(), next: page => page.locator('.capabilities-list__bullet').first(), internal: true },
  { key: 'panel-1-copy', legacy: page => page.locator('.capabilities-list__item .v-btn').first(), next: page => page.locator('.capabilities-list__item .v-btn').first() },
]

/** Opens the first category (a click on its header; the expand transition settles before capture). */
export const openFirstCapability: StateAction = async page => {
  await page.locator('.v-expansion-panel-header, .v-expansion-panel-title').first().click()
  await page.locator('.capabilities-list__item').first().waitFor({ state: 'visible' })
  await settled(page.locator('.v-expansion-panel').first())
}

// ---------------------------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------------------------

export const activityTitleProbe: Probe = {
  key: 'activity-title',
  legacy: page => page.locator('.title-row h4').first(),
  next: page => page.getByTestId('connect-ai-activity-title'),
}

export const activityFilterProbe: Probe = {
  key: 'activity-filter',
  legacy: page => page.locator('.connect-ai-activity-log__filter'),
  next: page => page.getByTestId('connect-ai-activity-filter'),
}

export const logsCardProbe: Probe = {
  key: 'logs-card',
  legacy: page => page.locator('.data-table'),
  next: page => page.getByTestId('connect-ai-logs'),
}

export const logsEmptyProbe: Probe = {
  key: 'logs-empty',
  legacy: page => page.locator('.data-table .v-card__text'),
  next: page => page.getByTestId('connect-ai-logs-empty'),
}

export const logsEmptyTitleProbe: Probe = {
  key: 'logs-empty-title',
  legacy: page => page.locator('.no-data-container__title'),
  next: page => page.locator('.no-data-container__title'),
}

export const logsSortRowProbe: Probe = {
  key: 'logs-head-row',
  legacy: page => page.locator('tr.custom-sort'),
  next: page => page.locator('tr.custom-sort'),
  when: isDesktop,
}

function logRow (page: Page, index: number) {
  return page.locator('.data-table tbody tr').nth(index)
}

export const logRowProbes: Probe[] = [
  { key: 'log-row-1', legacy: page => logRow(page, 0), next: page => logRow(page, 0) },
  { key: 'log-row-2', legacy: page => logRow(page, 1), next: page => logRow(page, 1) },
  { key: 'log-row-1-status', legacy: page => logRow(page, 0).locator('.v-chip'), next: page => logRow(page, 0).locator('.v-chip'), when: isDesktop },
  { key: 'log-row-2-status', legacy: page => logRow(page, 1).locator('.v-chip'), next: page => logRow(page, 1).locator('.v-chip'), when: isDesktop },
  { key: 'log-row-1-tool', legacy: page => logRow(page, 0).locator('td').nth(2).locator('span'), next: page => logRow(page, 0).locator('td').nth(2).locator('span'), when: isDesktop },
]

export const logsFooterProbe: Probe = {
  key: 'logs-footer',
  legacy: page => page.locator('.data-table .data-iterator-footer'),
  next: page => page.locator('.data-table .data-iterator-footer'),
}

export interface LogFixture {
  id: number
  created_at: string
  token_name: string
  tool_name: string
  status: string
}

const TOOLS = ['list_instances', 'create_backup', 'restart_instance', 'get_logs']

/** 20 rows of page 1 of 45: newest first, tokens from the populated fixtures, an error on every fourth row. */
export function logsFixture (): LogFixture[] {
  return Array.from({ length: 20 }, (_, index) => ({
    id: 100 - index,
    created_at: isoFromNow(-(index + 1) * 17 * 60_000),
    token_name: index % 3 === 2 ? neverUsedToken.name : activeToken.name,
    tool_name: TOOLS[index % TOOLS.length]!,
    status: index % 4 === 1 ? 'error' : 'success',
  }))
}

/** A raw Laravel paginator page. */
export function logsHandler (data: LogFixture[], total: number): Handler {
  return { json: { current_page: 1, data, last_page: Math.ceil(total / 20) || 1, per_page: 20, total } }
}

export const waitForLogRows: StateAction = async page => {
  await page.locator('.data-table tbody tr', { hasText: logsFixture()[0]!.tool_name }).first().waitFor({ state: 'visible' })
}

export const waitForNoLogs: StateAction = async page => {
  await page.getByText(tr('heading.connectAi.noActivityLogsTitle', 'lite'), { exact: true }).waitFor({ state: 'visible' })
}

/** `GET /mcp-activity-logs` answers 500 (phase 13): the log view alerts with the message and keeps the list empty (`McpActivityLog` `fetchLogs`). */
export const logsListError: Handler = { status: 500, json: { message: 'Server Error' } }
