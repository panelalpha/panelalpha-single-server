import type { ParityState, Probe } from './state'
import type { Page } from '@playwright/test'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import {
  alertManagerProbe,
  fileManagerBoxProbe,
  fileManagerColumnProbe,
  fileManagerHandlers,
  fileManagerMasks,
  fileManagerSelectorProbe,
  fileManagerTitleProbe,
  fileManagerWpCloudProbes,
  hostingService,
  hostingState,
  serverAccount,
} from './hosting'
import { twoAccountsService, wpCloudService } from './hosting-domains'

// S-37 hosting-file-manager: My Hosting -> File Manager (`/hosting/file-manager`). M-2 S-111: measured on lite (lite target, single-server
// `/home`, "My Server" tab). Only the host page is measured: the fm content is
// masked in both apps (legacy iframe `/fm/`, stubbed blank by the driver; next's native file manager).
// Builder, fixtures and probes: `hosting.ts`. Each state id is a literal `id: '…',` line, which `registeredStates` in
// report/write-report.ts reads as text. Plan: context/changes/hosting-file-manager/plan.md ("Stany parity").

const ready = { legacy: fileManagerTitleProbe.legacy, next: fileManagerTitleProbe.next }
const boxProbes = [fileManagerTitleProbe, fileManagerBoxProbe, fileManagerColumnProbe]

// The diagnostic toast is rendered after a delay on legacy (watcher on mount), so the state waits for its text on both sides; without
// it the capture raced the toast (16 px empty box vs the 372 × 192 toast, `parity/report.md`, 2026-10-13).
const alertReady = {
  legacy: (page: Page) => page.locator('.alert-manager .alert__text-box').first(),
  next: (page: Page) => page.getByTestId('shell-alert-manager').locator('.alert__text-box').first(),
}

function fileManagerState (services: unknown[], options: { probes: Probe[], masked?: boolean, ready?: typeof ready }): Omit<ParityState, 'id'> {
  const accountIds = services.flatMap(service => (service as { server_accounts: Array<{ id: number }> }).server_accounts.map(account => account.id))
  return hostingState({
    lite: true,
    path: '/hosting/file-manager',
    services,
    handlers: fileManagerHandlers(accountIds),
    ready: options.ready ?? ready,
    probes: options.probes,
    ...(options.masked === false ? {} : { masks: fileManagerMasks }),
  })
}

export const hostingFileManager: ParityState = {
  id: 'hosting-file-manager',
  target: 'lite',
  ...fileManagerState([hostingService()], { probes: boxProbes }),
}

export const hostingFileManagerWpCloud: ParityState = {
  id: 'hosting-file-manager-wp-cloud',
  target: 'lite',
  ...fileManagerState([wpCloudService()], { probes: [...boxProbes, ...fileManagerWpCloudProbes] }),
}

export const hostingFileManagerAccounts: ParityState = {
  id: 'hosting-file-manager-accounts',
  target: 'lite',
  ...fileManagerState([twoAccountsService()], { probes: [...boxProbes, fileManagerSelectorProbe] }),
}

export const hostingFileManagerDiagnostic: ParityState = {
  id: 'hosting-file-manager-diagnostic',
  target: 'lite',
  ...fileManagerState([hostingService({ server_accounts: [serverAccount({ diagnostic_mode: true })] })], {
    probes: [fileManagerTitleProbe, alertManagerProbe],
    masked: false,
    ready: alertReady,
  }),
}

const states: ParityState[] = [
  hostingFileManager,
  hostingFileManagerWpCloud,
  hostingFileManagerAccounts,
  hostingFileManagerDiagnostic,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
