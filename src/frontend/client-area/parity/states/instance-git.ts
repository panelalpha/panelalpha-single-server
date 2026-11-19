import type { Handler, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { tr } from './auth'
import { waitFor } from './hosting'
import { INSTANCE_PAGE_PRIVILEGES, instancePageHandlers, instancePageRaw, stagingCopy } from './instance'
import { liteShellHome } from './instances'
import { shellHandlers } from './shell'

// S-102 ui-instance-git: the Git screen of a project on app-lite (`/projects/:id/advanced/git`, `target: 'lite'`). Not a spec file (testMatch is
// `*.parity.ts`). States: `instance-git.parity.ts`. Plan: context/changes/ui-instance-git/plan.md.
// `toProjectRoutes` is a local copy (as in `instance-plugins.ts`): nothing is exported from that file.

/** The single-server `/home` without the `admin` key: the style manager drawer would widen the full-page shot (as the Plugins states do). */
const { admin: _styleManagerAdmin, ...liteHomeWithoutAdmin } = liteShellHome()
export const GIT_HOME: Record<string, unknown> = liteHomeWithoutAdmin

/** The project privileges plus `general.manage_git` (`privileges.ts:23`), which shows Connect, Manage, Pull, Push and the switch. */
export const GIT_PRIVILEGES = [...INSTANCE_PAGE_PRIVILEGES, 'general.manage_git']

/** The `/projects` form of the handler keys: single server rewrites the `/instances` segment (`utils/resourcePaths.js`), as `onLite` does. */
function toProjectRoutes (handlers: Record<string, Handler>): Record<string, Handler> {
  const routed: Record<string, Handler> = {}
  for (const [key, handler] of Object.entries(handlers)) {
    routed[key.replace(/^(\S+) \/instances(?=[/?]|$)/, '$1 /projects')] = handler
  }
  return routed
}

/** The app-health answer of a project that runs fine (`GET /projects/{id}/app-health`, as the frame states answer it). */
const APP_HEALTH_OK: Handler = {
  json: { data: { available: true, healthy: true, serving: 'ok', ports: [{ port: 8000, status: 'ok', http_code: 200, detail: 'HTTP 200' }], checks: [] } },
}

export const REPO_URL = 'https://github.com/example/studio-blog'
export const COMMIT_HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
export const COMMIT_MESSAGE = 'Update the footer links and the contact form'

// S-131: an SSH repository with a deploy key (`git@…`, the key card of the Git screen). The key is a fixture, not a real one.
export const SSH_REPO_URL = 'git@github.com:example/studio-blog.git'
export const DEPLOY_KEY = {
  public_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIStudioBlogDeployKey studio-blog',
  fingerprint: 'SHA256:Qz8kLr3mVt1pXc0sYd9wNb2hJf4gA7uE6iRoT5nKlMs',
}

/** The body of `GET /projects/1/git` (`GitStatus`) of a connected, synced project. `patch` replaces fields. */
export function gitStatus (patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    connected: true,
    repo_url: REPO_URL,
    branch: 'main',
    pair_branch: null,
    auth_type: 'pat',
    last_deployed_commit_hash: COMMIT_HASH,
    last_deployed_commit_message: COMMIT_MESSAGE,
    last_deployed_commit_at: '2026-10-04T09:30:00.000Z',
    has_synced_once: true,
    drift_status: 'in_sync',
    commits_behind: 0,
    commits_ahead: 0,
    remote_branch_exists: true,
    local_repository_exists: true,
    show_drift_banner: false,
    connection_health: { status: 'ok', reason: null },
    auto_deploy_enabled: true,
    webhook_registered: true,
    async_status: { git_attach: null, git_pull: null, git_auto_deploy: null },
    ...patch,
  }
}

/** A project that is not connected (the connect form). */
export const notConnected = gitStatus({
  connected: false,
  repo_url: null,
  branch: null,
  last_deployed_commit_hash: null,
  last_deployed_commit_message: null,
  last_deployed_commit_at: null,
  has_synced_once: null,
  drift_status: null,
  commits_behind: null,
  commits_ahead: null,
  remote_branch_exists: null,
  local_repository_exists: null,
  connection_health: null,
  auto_deploy_enabled: false,
  webhook_registered: false,
})

function logRow (index: number, patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: 'pull',
    status: 'success',
    commit_hash: `${String(index).repeat(7)}0f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6`.slice(0, 40),
    commit_message: `Commit number ${index}`,
    error_message: null,
    created_at: `2026-10-0${Math.min(index, 4)}T0${index}:15:00.000Z`,
    ...patch,
  }
}

/** Twelve log rows; the first page shows five (a completed pull, a failed push with an error tooltip, a skipped webhook pull, a connect, a branch change). */
export const logRows: Array<Record<string, unknown>> = [
  logRow(1, { action: 'pull', status: 'success', commit_message: 'Update the footer links and the contact form' }),
  logRow(2, { action: 'push', status: 'failed', commit_message: 'Add the pricing page', error_message: 'Push rejected: the remote branch has newer commits.' }),
  logRow(3, { action: 'webhook_pull', status: 'skipped', commit_message: 'Tweak the header', error_message: 'Auto-deploy skipped: the site has local changes.' }),
  logRow(4, { action: 'connect', status: 'success', commit_hash: null, commit_message: null }),
  logRow(5, { action: 'branch_change', status: 'in_progress', commit_hash: null, commit_message: null }),
  logRow(6), logRow(7), logRow(8), logRow(9), logRow(10), logRow(11), logRow(12),
]

/** The first page of the log (5 rows of 12, the legacy start `per_page`). */
export const logsPageOne: Handler = { json: { data: logRows.slice(0, 5), meta: { total: logRows.length, last_page: 3 } } }

/**
 * Two log rows. The banner states are measured on mobile, where five stacked log rows push the page past ~4 000 px; a full-page shot that
 * tall is not byte-stable (the fixed top bar is captured at two positions), so the log, which those states do not test, is shortened.
 */
export const logsShort: Handler = { json: { data: logRows.slice(0, 2), meta: { total: logRows.length, last_page: 3 } } }

export const logsEmpty: Handler = { json: { data: [], meta: { total: 0, last_page: 1 } } }

/** The staging copy 41 of the project; its repository is connected, so the connect card offers to reuse it. */
export function stagingWithRepository (repository: Record<string, unknown> = {}): Record<string, unknown> {
  return stagingCopy({
    git_repository: { connected: true, id: 7, repo_url: REPO_URL, branch: 'main', commits_behind: 0, last_deployed_commit_hash: COMMIT_HASH, ...repository },
  })
}

export interface GitHandlerOptions {
  /** The privileges of the project (`GIT_PRIVILEGES` by default). */
  privileges?: string[]
  /** Fields merged over the instance of project 1 (`git_repository`, `staging_apps`, ...). */
  instance?: Record<string, unknown>
  /** The address of the instance's repository (`git_repository.repo_url`); `REPO_URL` by default. */
  repoUrl?: string
}

/** The deploy key requests of the Git screen (`/projects/1/git/deploy-key`, the single-server form of `/instances/1/git/deploy-key`). */
export function deployKeyHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    'GET /projects/1/git/deploy-key': { json: { data: DEPLOY_KEY } },
    'POST /projects/1/git/deploy-key': { json: { data: DEPLOY_KEY } },
    'DELETE /projects/1/git/deploy-key': { json: { data: null } },
    ...overrides,
  }
}

/**
 * Every request the frame, the shell and the Git screen make on project 1 (the frame's `/instances/1` calls rewritten to `/projects`).
 * `overrides` replace any key, so a state changes one call without losing the rest.
 */
export function gitHandlers (status: Record<string, unknown> | Handler = gitStatus(), overrides: Record<string, Handler> = {}, options: GitHandlerOptions = {}): Record<string, Handler> {
  const connected = typeof status === 'object' && status !== null && 'connected' in status ? status.connected === true : true
  const statusHandler: Handler = typeof status === 'object' && status !== null && 'connected' in status ? { json: { data: status } } : status as Handler
  return {
    ...shellHandlers([], 'projects'),
    ...toProjectRoutes(instancePageHandlers({
      'GET /instances/1': {
        json: {
          data: instancePageRaw(1, {
            privileges: options.privileges ?? GIT_PRIVILEGES,
            git_repository: connected ? { connected: true, id: 5, repo_url: options.repoUrl ?? REPO_URL, branch: 'main', commits_behind: 0, last_deployed_commit_hash: COMMIT_HASH } : null,
            ...options.instance,
          }),
        },
      },
    })),
    'GET /projects/1/app-health': APP_HEALTH_OK,
    // The deployed lite build asks for the deploy source of the project; next never does, so only legacy hits it.
    'GET /projects/1/source': { json: { data: null } },
    'GET /projects/1/git': statusHandler,
    'GET /projects/1/git/logs': logsPageOne,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------------------------
// Locators and probes. Legacy and next keep the legacy markup (`.v-card` with an `h6` title per section), so a card is found by its title.
// ---------------------------------------------------------------------------------------------

/** The card of one section of the page, by the title key (`heading.instance.advanced.git.<section>.title`). */
export function sectionCard (page: Page, titleKey: string): Locator {
  return page.locator('.v-card').filter({ has: page.locator('h6', { hasText: tr(titleKey, 'lite') }) }).first()
}

function cardProbe (key: string, titleKey: string): Probe {
  return {
    key,
    legacy: page => sectionCard(page, titleKey),
    next: page => sectionCard(page, titleKey),
  }
}

export const gitTitleProbe: Probe = {
  key: 'git-title',
  legacy: page => page.locator('.page-title__title'),
  next: page => page.locator('.page-title__title'),
}

export const connectCardProbe = cardProbe('connect-card', 'heading.instance.advanced.git.connect.title')
export const branchCardProbe = cardProbe('branch-card', 'heading.instance.advanced.git.branch.title')
export const commitCardProbe = cardProbe('commit-card', 'heading.instance.advanced.git.lastCommit.title')
export const autoDeployCardProbe = cardProbe('auto-deploy-card', 'heading.instance.advanced.git.autoDeploy.title')
export const pullCardProbe = cardProbe('pull-card', 'heading.instance.advanced.git.pull.card.title')
export const pushCardProbe = cardProbe('push-card', 'heading.instance.advanced.git.push.card.title')
export const logsCardProbe = cardProbe('logs-card', 'heading.instance.advanced.git.logs.title')

/** A button of the page by its lite copy (`exact`, so "Pull" is not "Pull now"). */
export function namedButtonProbe (key: string, copyKey: string): Probe {
  return {
    key,
    legacy: page => page.getByRole('button', { name: tr(copyKey, 'lite'), exact: true }).first(),
    next: page => page.getByRole('button', { name: tr(copyKey, 'lite'), exact: true }).first(),
  }
}

export const disconnectProbe = namedButtonProbe('disconnect-button', 'button.disconnect.default')
export const connectButtonProbe = namedButtonProbe('connect-button', 'heading.instance.advanced.git.connect.button')
export const manageProbe = namedButtonProbe('manage-button', 'button.manage')
export const pullButtonProbe = namedButtonProbe('pull-button', 'button.git.pull')
export const pushButtonProbe = namedButtonProbe('push-button', 'button.git.push')
export const checkUpdatesProbe = namedButtonProbe('check-updates-button', 'heading.instance.advanced.git.lastCommit.checkUpdates')

/** The "Current branch: …" text next to Manage (legacy `p-3 d-flex align-center mx-4`). */
export const branchStatusProbe: Probe = {
  key: 'branch-status',
  legacy: page => sectionCard(page, 'heading.instance.advanced.git.branch.title').locator('span.d-flex').first(),
  next: page => sectionCard(page, 'heading.instance.advanced.git.branch.title').locator('span.d-flex').first(),
}

export const repoLinkProbe: Probe = {
  key: 'repo-link',
  legacy: page => sectionCard(page, 'heading.instance.advanced.git.connect.title').locator('a.instance-domain-link').first(),
  next: page => sectionCard(page, 'heading.instance.advanced.git.connect.title').locator('a.instance-domain-link').first(),
}

export const autoDeploySwitchProbe: Probe = {
  key: 'auto-deploy-switch',
  legacy: page => sectionCard(page, 'heading.instance.advanced.git.autoDeploy.title').locator('.v-input--switch, .v-switch').first(),
  next: page => sectionCard(page, 'heading.instance.advanced.git.autoDeploy.title').locator('.v-input--switch, .v-switch').first(),
}

/** The first row's status chip of the log (`v-chip` in both apps). */
export const logChipProbe: Probe = {
  key: 'log-chip',
  legacy: page => sectionCard(page, 'heading.instance.advanced.git.logs.title').locator('.v-chip').first(),
  next: page => sectionCard(page, 'heading.instance.advanced.git.logs.title').locator('.v-chip').first(),
}

export const logFooterProbe: Probe = {
  key: 'log-footer',
  legacy: page => sectionCard(page, 'heading.instance.advanced.git.logs.title').locator('.data-iterator-footer').first(),
  next: page => sectionCard(page, 'heading.instance.advanced.git.logs.title').locator('.data-iterator-footer').first(),
}

/** The deploy key card (S-131), found by its title; the panel, fingerprint and buttons are inside it. */
export const deployKeyCardProbe = cardProbe('deploy-key-card', 'heading.onboarding.gitDeploy.auth.deployKey.label')

/** The key panel of the card (`DeployKeyPanel`, the same markup in both apps). */
export const deployKeyPanelProbe: Probe = {
  key: 'deploy-key-panel',
  legacy: page => sectionCard(page, 'heading.onboarding.gitDeploy.auth.deployKey.label').locator('.deploy-key-panel').first(),
  next: page => sectionCard(page, 'heading.onboarding.gitDeploy.auth.deployKey.label').locator('.deploy-key-panel').first(),
}

export const deployKeyFingerprintProbe: Probe = {
  key: 'deploy-key-fingerprint',
  legacy: page => sectionCard(page, 'heading.onboarding.gitDeploy.auth.deployKey.label').locator('.deploy-key-panel__fingerprint').first(),
  next: page => sectionCard(page, 'heading.onboarding.gitDeploy.auth.deployKey.label').locator('.deploy-key-panel__fingerprint').first(),
}

export const deployKeyRegenerateProbe = namedButtonProbe('deploy-key-regenerate-button', 'button.onboarding.gitDeploy.regenerateDeployKey')
export const deployKeyDeleteProbe = namedButtonProbe('deploy-key-delete-button', 'button.onboarding.gitDeploy.deleteDeployKey')
export const deployKeyGenerateProbe = namedButtonProbe('deploy-key-generate-button', 'button.onboarding.gitDeploy.generateDeployKey')
export const connectAndDeployButtonProbe = namedButtonProbe('connect-and-deploy-button', 'button.onboarding.gitDeploy.connectAndDeploy')
/** The key panel of the connect form (S-131 phase 12): the first panel of the connect card, the one the SSH address shows. */
export const connectKeyPanelProbe: Probe = {
  key: 'connect-key-panel',
  legacy: page => sectionCard(page, 'heading.instance.advanced.git.connect.title').locator('.deploy-key-panel').first(),
  next: page => sectionCard(page, 'heading.instance.advanced.git.connect.title').locator('.deploy-key-panel').first(),
}

/** The error of the SSH connect under the key panel (S-131 phase 13), legacy `error--text`, next `text-error` (`DeployKeyPanel`). */
export const connectKeyErrorProbe: Probe = {
  key: 'connect-key-error',
  legacy: page => sectionCard(page, 'heading.instance.advanced.git.connect.title').locator('.deploy-key-panel .error--text').first(),
  next: page => sectionCard(page, 'heading.instance.advanced.git.connect.title').locator('.deploy-key-panel .text-error').first(),
}

/** The empty card (no key yet): its copy, found by the same text in both apps. */
export const deployKeyMissingProbe: Probe = {
  key: 'deploy-key-missing',
  legacy: page => sectionCard(page, 'heading.onboarding.gitDeploy.auth.deployKey.label').getByText(tr('heading.onboarding.gitDeploy.auth.deployKey.missing', 'lite')).first(),
  next: page => sectionCard(page, 'heading.onboarding.gitDeploy.auth.deployKey.label').getByText(tr('heading.onboarding.gitDeploy.auth.deployKey.missing', 'lite')).first(),
}

/** The skeleton of the key card while its key request is held (the card's own skeleton, not the page's). */
export const deployKeyLoadingProbe: Probe = {
  key: 'deploy-key-skeleton',
  legacy: page => sectionCard(page, 'heading.onboarding.gitDeploy.auth.deployKey.label').locator('.v-skeleton-loader').first(),
  next: page => sectionCard(page, 'heading.onboarding.gitDeploy.auth.deployKey.label').locator('.v-skeleton-loader').first(),
}

/** The load-failed message of the key card (lite `Git.vue:500-507`), found by its copy in both apps. */
export const deployKeyLoadFailedProbe: Probe = {
  key: 'deploy-key-load-failed',
  legacy: page => sectionCard(page, 'heading.onboarding.gitDeploy.auth.deployKey.label').getByText(tr('heading.onboarding.gitDeploy.auth.deployKey.loadFailed', 'lite')).first(),
  next: page => sectionCard(page, 'heading.onboarding.gitDeploy.auth.deployKey.label').getByText(tr('heading.onboarding.gitDeploy.auth.deployKey.loadFailed', 'lite')).first(),
}

export const deployKeyRetryProbe = namedButtonProbe('deploy-key-retry-button', 'button.retry')

/** Every card of a connected, synced project, with the buttons that carry state. */
export const connectedProbes: Probe[] = [
  gitTitleProbe,
  connectCardProbe,
  disconnectProbe,
  repoLinkProbe,
  branchCardProbe,
  branchStatusProbe,
  manageProbe,
  commitCardProbe,
  checkUpdatesProbe,
  autoDeployCardProbe,
  autoDeploySwitchProbe,
  pullCardProbe,
  pullButtonProbe,
  pushCardProbe,
  pushButtonProbe,
  logsCardProbe,
  logChipProbe,
  logFooterProbe,
]

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

/** Waits until the log of a connected project shows its first commit (the cards load before the log). */
export const waitForConnected = {
  legacy: [waitFor(page => page.getByText(COMMIT_MESSAGE).last())],
  next: [waitFor(page => page.getByText(COMMIT_MESSAGE).last())],
}

/** The empty key card has no fingerprint to wait for: the copy is the readiness anchor. */
export const waitForKeyMissing = {
  legacy: [...waitForConnected.legacy, waitFor(page => page.getByText(tr('heading.onboarding.gitDeploy.auth.deployKey.missing', 'lite')))],
  next: [...waitForConnected.next, waitFor(page => page.getByText(tr('heading.onboarding.gitDeploy.auth.deployKey.missing', 'lite')))],
}

/** The key card is ready when its skeleton shows: the key request is held, so nothing else in the card has rendered. */
export const waitForKeyLoading = {
  legacy: [...waitForConnected.legacy, waitFor(page => sectionCard(page, 'heading.onboarding.gitDeploy.auth.deployKey.label').locator('.v-skeleton-loader').first())],
  next: [...waitForConnected.next, waitFor(page => sectionCard(page, 'heading.onboarding.gitDeploy.auth.deployKey.label').locator('.v-skeleton-loader').first())],
}

/** The key card buttons are disabled while another action of the page is busy (the pull request is held): the card waits for that. */
export const waitForKeyButtonsDisabled: StateAction = async page => {
  const card = sectionCard(page, 'heading.onboarding.gitDeploy.auth.deployKey.label')
  await expect(card.getByRole('button', { name: tr('button.onboarding.gitDeploy.regenerateDeployKey', 'lite'), exact: true }).first()).toBeDisabled()
  await expect(card.getByRole('button', { name: tr('button.onboarding.gitDeploy.deleteDeployKey', 'lite'), exact: true }).first()).toBeDisabled()
}

/** The key card is ready when its load-failed message shows (the key request answers 500). */
export const waitForKeyError = {
  legacy: [...waitForConnected.legacy, waitFor(page => sectionCard(page, 'heading.onboarding.gitDeploy.auth.deployKey.label').getByText(tr('heading.onboarding.gitDeploy.auth.deployKey.loadFailed', 'lite')))],
  next: [...waitForConnected.next, waitFor(page => sectionCard(page, 'heading.onboarding.gitDeploy.auth.deployKey.label').getByText(tr('heading.onboarding.gitDeploy.auth.deployKey.loadFailed', 'lite')))],
}

/** Waits until the last commit card says nothing was deployed yet (the empty state: the log is empty too). */
export const waitForEmpty = {
  legacy: [waitFor(page => page.getByText(tr('heading.instance.advanced.git.lastCommit.empty', 'lite')))],
  next: [waitFor(page => page.getByText(tr('heading.instance.advanced.git.lastCommit.empty', 'lite')))],
}

/** Waits until the connect form of a project without a repository is on the page. */
export const waitForConnectForm = {
  legacy: [waitFor(page => page.getByRole('button', { name: tr('heading.instance.advanced.git.connect.button', 'lite'), exact: true }))],
  next: [waitFor(page => page.getByRole('button', { name: tr('heading.instance.advanced.git.connect.button', 'lite'), exact: true }))],
}

export function clickButton (copyKey: string): { legacy: StateAction, next: StateAction } {
  const action: StateAction = async page => {
    await page.getByRole('button', { name: tr(copyKey, 'lite'), exact: true }).first().evaluate((el: HTMLElement) => el.click())
  }
  return { legacy: action, next: action }
}

/** The "Private repository" switch of the connect form: a click on the switch row's input. */
export const togglePrivate: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await sectionCard(page, 'heading.instance.advanced.git.connect.title').locator('.v-input--switch input, .v-switch input').first().evaluate((el: HTMLElement) => el.click())
    await expect(page.getByLabel(tr('heading.instance.advanced.git.connect.token', 'lite'))).toBeVisible()
  },
  next: async page => {
    await sectionCard(page, 'heading.instance.advanced.git.connect.title').locator('.v-input--switch input, .v-switch input').first().evaluate((el: HTMLElement) => el.click())
    await expect(page.getByLabel(tr('heading.instance.advanced.git.connect.token', 'lite'))).toBeVisible()
  },
}

// Modals: legacy `.v-dialog--active .basic-modal`, next the host's `instances-modal`.

export function modal (page: Page, app: 'legacy' | 'next'): Locator {
  return app === 'legacy' ? page.locator('.v-dialog--active .basic-modal') : page.getByTestId('instances-modal')
}

/** Waits until the dialog titled `titleKey` is on the page. */
export function modalOpen (titleKey: string): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      await expect(modal(page, 'legacy').filter({ hasText: tr(titleKey, 'lite') })).toBeVisible()
    },
    next: async page => {
      await expect(modal(page, 'next').filter({ hasText: tr(titleKey, 'lite') })).toBeVisible()
    },
  }
}

export function modalProbes (prefix: string, buttonKeys: string[]): Probe[] {
  return [
    {
      key: `${prefix}-modal`,
      legacy: page => modal(page, 'legacy'),
      next: page => modal(page, 'next'),
    },
    {
      key: `${prefix}-modal-message`,
      legacy: page => modal(page, 'legacy').locator('.v-card__text p').first(),
      next: page => modal(page, 'next').locator('.v-card-text p').first(),
      internal: true,
    },
    ...buttonKeys.map((copyKey): Probe => ({
      key: `${prefix}-modal-${copyKey}`,
      legacy: page => modal(page, 'legacy').getByRole('button', { name: tr(copyKey, 'lite'), exact: true }),
      next: page => modal(page, 'next').getByRole('button', { name: tr(copyKey, 'lite'), exact: true }),
    })),
  ]
}

/** The error alert of the alert manager (`.alert-manager .alert--error` in both apps). */
export const errorAlert = (page: Page): Locator => page.locator('.alert-manager .alert--error')
export const successAlert = (page: Page): Locator => page.locator('.alert-manager .alert--success')

/** The pointer rests on the alert text box while the screenshot is taken (the alert closes itself after 5 s). */
export const alertStillHovered: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.alert-manager .alert__text-box').first().hover()
  },
  next: async page => {
    await page.locator('.alert-manager .alert__text-box').first().hover()
  },
}

// ---------------------------------------------------------------------------------------------
// Banners, connect form, loading (phases 4-9)
// ---------------------------------------------------------------------------------------------

/**
 * The first alert banner of the page (drift, local repository missing, setup: legacy `.alert`, a plain div; hosting unsupported: a real
 * `v-alert`; only one shows per state).
 */
const BANNER = '.alert, .v-alert'

export const bannerProbe: Probe = {
  key: 'banner',
  legacy: page => page.locator(BANNER).first(),
  next: page => page.locator(BANNER).first(),
}

export const bannerTextProbe: Probe = {
  key: 'banner-text',
  legacy: page => page.locator(BANNER).first().locator('p').first(),
  next: page => page.locator(BANNER).first().locator('p').first(),
  internal: true,
}

/** The connection-health alert inside the connect card (legacy `.alert--error`). */
export const healthAlertProbe: Probe = {
  key: 'health-alert',
  legacy: page => page.locator('.alert--error').first(),
  next: page => page.locator('.alert--error').first(),
}

/** A button of the first banner by its lite copy. */
export function bannerButtonProbe (key: string, copyKey: string): Probe {
  return {
    key,
    legacy: page => page.locator(BANNER).first().getByRole('button', { name: tr(copyKey, 'lite'), exact: true }),
    next: page => page.locator(BANNER).first().getByRole('button', { name: tr(copyKey, 'lite'), exact: true }),
  }
}

/** A field of the connect form by its label (the `.v-input` root). */
export function fieldProbe (key: string, labelKey: string): Probe {
  return {
    key,
    legacy: page => page.locator('.v-input').filter({ has: page.getByLabel(tr(labelKey, 'lite'), { exact: true }) }).first(),
    next: page => page.locator('.v-input').filter({ has: page.getByLabel(tr(labelKey, 'lite'), { exact: true }) }).first(),
  }
}

export const repoUrlFieldProbe = fieldProbe('repo-url-field', 'heading.instance.advanced.git.connect.repoUrl')
/** The branch field of the SSH connect form (legacy `heading.onboarding.gitDeploy.branch.label`, the lite copy). */
export const branchFieldProbe = fieldProbe('branch-field', 'heading.onboarding.gitDeploy.branch.label')
export const tokenFieldProbe = fieldProbe('token-field', 'heading.instance.advanced.git.connect.token')

export const privateSwitchProbe: Probe = {
  key: 'private-switch',
  legacy: page => sectionCard(page, 'heading.instance.advanced.git.connect.title').locator('.v-input--switch, .v-switch').first(),
  next: page => sectionCard(page, 'heading.instance.advanced.git.connect.title').locator('.v-input--switch, .v-switch').first(),
}

export const modeToggleProbe: Probe = {
  key: 'mode-toggle',
  legacy: page => page.locator('.git-connect-mode-toggle'),
  next: page => page.locator('.git-connect-mode-toggle'),
}

/** The first validation message of the connect form (`.v-messages__message` in both apps). */
export const fieldMessageProbe: Probe = {
  key: 'field-message',
  legacy: page => page.locator('.v-messages__message').first(),
  next: page => page.locator('.v-messages__message').first(),
  internal: true,
}

/** The connect-form probes of a project without a repository. */
export const connectFormProbes: Probe[] = [gitTitleProbe, connectCardProbe, connectButtonProbe, repoUrlFieldProbe, privateSwitchProbe]

/** The skeleton card of the loading state: the first card holds a skeleton title. */
export const cardSkeletonProbe: Probe = {
  key: 'card-skeleton',
  legacy: page => page.locator('.v-card').first(),
  next: page => page.locator('.v-card').first(),
}

/** Waits for the first skeleton card while the status is held. */
export const waitForSkeleton = {
  legacy: [waitFor(page => page.locator('.v-skeleton-loader').first())],
  next: [waitFor(page => page.locator('.v-skeleton-loader').first())],
}

/** Fills the repository URL (the label is the lite copy). */
export function fillRepoUrl (value: string): { legacy: StateAction, next: StateAction } {
  const action: StateAction = async page => {
    await page.getByLabel(tr('heading.instance.advanced.git.connect.repoUrl', 'lite'), { exact: true }).fill(value)
  }
  return { legacy: action, next: action }
}

export { waitFor } from './hosting'
