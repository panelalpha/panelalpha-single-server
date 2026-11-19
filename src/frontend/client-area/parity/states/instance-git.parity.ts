import type { ParityState, StateAction } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState, tr } from './auth'
import { alertManagerProbe } from './hosting'
import { INSTANCE_PAGE_DNS, INSTANCE_PAGE_PRIVILEGES, stagingCopy } from './instance'
import {
  alertStillHovered,
  autoDeploySwitchProbe,
  bannerButtonProbe,
  bannerProbe,
  bannerTextProbe,
  branchCardProbe,
  branchFieldProbe,
  cardSkeletonProbe,
  clickButton,
  connectAndDeployButtonProbe,
  connectButtonProbe,
  connectCardProbe,
  connectedProbes,
  connectFormProbes,
  connectKeyErrorProbe,
  connectKeyPanelProbe,
  DEPLOY_KEY,
  deployKeyCardProbe,
  deployKeyDeleteProbe,
  deployKeyFingerprintProbe,
  deployKeyGenerateProbe,
  deployKeyHandlers,
  deployKeyLoadFailedProbe,
  deployKeyLoadingProbe,
  deployKeyMissingProbe,
  deployKeyPanelProbe,
  deployKeyRegenerateProbe,
  deployKeyRetryProbe,
  disconnectProbe,
  fieldMessageProbe,
  fillRepoUrl,
  GIT_HOME,
  gitHandlers,
  gitStatus,
  gitTitleProbe,
  healthAlertProbe,
  logsCardProbe,
  logsEmpty,
  logsShort,
  manageProbe,
  modalOpen,
  modalProbes,
  modeToggleProbe,
  notConnected,
  pullButtonProbe,
  pullCardProbe,
  pushButtonProbe,
  pushCardProbe,
  repoUrlFieldProbe,
  sectionCard,
  SSH_REPO_URL,
  stagingWithRepository,
  togglePrivate,
  tokenFieldProbe,
  waitFor,
  waitForConnected,
  waitForConnectForm,
  waitForEmpty,
  waitForKeyButtonsDisabled,
  waitForKeyError,
  waitForKeyLoading,
  waitForKeyMissing,
  waitForSkeleton,
} from './instance-git'
import { NOW } from './shell'

// S-102 ui-instance-git: the Git screen of a project, measured on app-lite (`target: 'lite'`, M-2 default). Each state id is a literal
// `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Builder and probes: `instance-git.ts`.
// Plan: context/changes/ui-instance-git/plan.md.

// Phase 3: the default state, a connected and synced project with every card and the first page of the log. Every other state spreads it.
export const instanceGitDefault: ParityState = {
  id: 'instance-git-default',
  target: 'lite',
  path: '/projects/1/advanced/git',
  signedIn: true,
  clock: NOW,
  home: GIT_HOME,
  handlers: gitHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForConnected,
  probes: connectedProbes,
}

// Phases 4-5: the connect form (not connected): the manual form, the private repository with its token, the reuse of the staging repository,
// and the required-field errors after Connect on an empty form.
const manualForm: Pick<ParityState, 'handlers' | 'actions'> = { handlers: gitHandlers(notConnected), actions: waitForConnectForm }

export const instanceGitNotConnected: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-not-connected',
  ...manualForm,
  probes: connectFormProbes,
}

export const instanceGitPrivate: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-private',
  ...manualForm,
  actions: {
    legacy: [...waitForConnectForm.legacy, togglePrivate.legacy],
    next: [...waitForConnectForm.next, togglePrivate.next],
  },
  probes: [...connectFormProbes, tokenFieldProbe],
}

export const instanceGitReuse: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-reuse',
  handlers: gitHandlers(notConnected, {}, { instance: { staging_apps: [stagingWithRepository()] } }),
  actions: waitForConnectForm,
  probes: [...connectFormProbes.slice(0, 3), modeToggleProbe],
}

export const instanceGitValidation: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-validation',
  ...manualForm,
  actions: {
    legacy: [...waitForConnectForm.legacy, clickButton('heading.instance.advanced.git.connect.button').legacy],
    next: [...waitForConnectForm.next, clickButton('heading.instance.advanced.git.connect.button').next],
  },
  probes: [...connectFormProbes, fieldMessageProbe],
}

/** The URL field keeps the focus after the click (V4 paints the focused field's root primary, V2 not), so the focus is dropped. */
const blurField: StateAction = async page => {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}

// Phase 6: the connect request is refused (422) and the alert shows the message; the alert closes itself after 5 s, so the pointer rests on it.
export const instanceGitConnectError: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-connect-error',
  handlers: gitHandlers(notConnected, { 'POST /projects/1/git/connect': { status: 422, json: { message: 'The repository could not be reached.' } } }),
  actions: {
    legacy: [...waitForConnectForm.legacy, fillRepoUrl('https://github.com/example/missing').legacy, clickButton('heading.instance.advanced.git.connect.button').legacy, blurField],
    next: [...waitForConnectForm.next, fillRepoUrl('https://github.com/example/missing').next, clickButton('heading.instance.advanced.git.connect.button').next, blurField],
  },
  pointer: 'keep',
  probes: [...connectFormProbes, alertManagerProbe],
  afterCapture: { legacy: [alertStillHovered.legacy], next: [alertStillHovered.next] },
}

// Phase 7: banners and the connection health.
export const instanceGitDrift: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-drift',
  handlers: gitHandlers(gitStatus({ show_drift_banner: true, drift_status: 'dirty' }), { 'GET /projects/1/git/logs': logsShort }),
  // Mobile: the full-page shot of the warning banner is not byte-stable in either app (the banner's top edge and the app bar avatar differ
  // between two shots), so the viewport is measured; the cards below are covered by the probes and by `default`.
  viewportOnly: true,
  probes: [bannerProbe, bannerTextProbe, bannerButtonProbe('banner-push', 'heading.instance.advanced.git.drift.push'), bannerButtonProbe('banner-revert', 'heading.instance.advanced.git.drift.revert'), bannerButtonProbe('banner-ignore', 'heading.instance.advanced.git.drift.ignore'), connectCardProbe, logsCardProbe],
}

export const instanceGitSetup: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-setup',
  handlers: gitHandlers(gitStatus({ has_synced_once: false, commits_behind: 2, commits_ahead: 0, pair_branch: 'main' }), { 'GET /projects/1/git/logs': logsShort }, { instance: { staging_apps: [stagingCopy()] } }),
  viewportOnly: true,
  probes: [bannerProbe, bannerTextProbe, bannerButtonProbe('banner-pull', 'heading.instance.advanced.git.setupBanner.pullBehind'), connectCardProbe, logsCardProbe],
}

export const instanceGitHealthError: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-health-error',
  handlers: gitHandlers(gitStatus({ connection_health: { status: 'error', reason: 'token' } })),
  probes: [connectCardProbe, disconnectProbe, healthAlertProbe, { key: 'update-token-link', legacy: page => page.getByRole('button', { name: 'Update access token', exact: true }), next: page => page.getByRole('button', { name: 'Update access token', exact: true }) }],
}

export const instanceGitTokenUpdate: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-token-update',
  handlers: gitHandlers(gitStatus({ connection_health: { status: 'error', reason: 'token' } })),
  actions: {
    legacy: [...waitForConnected.legacy, clickButton('heading.instance.advanced.git.connection.updateToken').legacy],
    next: [...waitForConnected.next, clickButton('heading.instance.advanced.git.connection.updateToken').next],
  },
  probes: [connectCardProbe, healthAlertProbe],
}

// Phase 8: disabled (the local repository is missing: banner, Repair, Manage/Pull/Push/switch off), remote ahead (Push off with its hint),
// auto-deploy in progress (switch off, in-progress text), and a user without `general.manage_git` (no action buttons).
export const instanceGitDisabled: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-disabled',
  handlers: gitHandlers(gitStatus({ local_repository_exists: false }), { 'GET /projects/1/git/logs': logsShort }),
  viewportOnly: true,
  probes: [...connectedProbes, bannerProbe, bannerButtonProbe('banner-repair', 'heading.instance.advanced.git.localRepoMissing.repair')],
}

export const instanceGitRemoteAhead: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-remote-ahead',
  handlers: gitHandlers(gitStatus({ commits_behind: 3, commits_ahead: 0 })),
  probes: [pullCardProbe, pullButtonProbe, pushCardProbe, pushButtonProbe],
}

export const instanceGitDeploying: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-deploying',
  handlers: gitHandlers(gitStatus({ async_status: { git_attach: null, git_pull: null, git_auto_deploy: 'in_progress' } })),
  probes: [gitTitleProbe, autoDeploySwitchProbe, connectCardProbe, logsCardProbe],
}

export const instanceGitReadonly: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-readonly',
  handlers: gitHandlers(gitStatus(), {}, { privileges: INSTANCE_PAGE_PRIVILEGES }),
  probes: [gitTitleProbe, connectCardProbe, disconnectProbe, branchCardProbe, pullCardProbe, pushCardProbe, logsCardProbe],
}

// Phase 9: empty (no deployment recorded and an empty log), loading (the status is held: skeleton cards) and the unsupported hosting.
export const instanceGitEmpty: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-empty',
  handlers: gitHandlers(
    gitStatus({ last_deployed_commit_hash: null, last_deployed_commit_message: null, last_deployed_commit_at: null }),
    { 'GET /projects/1/git/logs': logsEmpty },
  ),
  actions: waitForEmpty,
  probes: [gitTitleProbe, connectCardProbe, logsCardProbe],
}

export const instanceGitLoading: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-loading',
  handlers: gitHandlers('hold'),
  actions: waitForSkeleton,
  probes: [gitTitleProbe, cardSkeletonProbe],
}

export const instanceGitLoadingConnect: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-loading-connect',
  handlers: gitHandlers('hold', {}, { instance: { git_repository: null } }),
  actions: waitForSkeleton,
  probes: [gitTitleProbe, cardSkeletonProbe],
}

// K-05 kit-table-skeleton: the log table loading (the status answers, the log request is held: skeleton rows in the log card).
// Legacy: LITE `GitLogsTable.vue:42` (`<template v-if="itemsLoading" v-slot:body>`), the empty state only when `!itemsLoading && !items.length` (`:302-304`).
const waitForLogsSkeleton = {
  legacy: [waitFor(page => sectionCard(page, 'heading.instance.advanced.git.logs.title').locator('.v-skeleton-loader'))],
  next: [waitFor(page => sectionCard(page, 'heading.instance.advanced.git.logs.title').locator('.v-skeleton-loader'))],
}

export const instanceGitLogsLoading: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-logs-loading',
  handlers: gitHandlers(gitStatus(), { 'GET /projects/1/git/logs': 'hold' }),
  actions: waitForLogsSkeleton,
  probes: [gitTitleProbe, logsCardProbe],
}

export const instanceGitUnsupported: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-unsupported',
  handlers: gitHandlers({ status: 422, json: { message: 'Git is not supported for this hosting.' } }, {}, { instance: { git_repository: null } }),
  actions: waitForConnectForm,
  probes: [gitTitleProbe, bannerProbe, connectCardProbe, connectButtonProbe],
}

// Phase 9: hover and keyboard focus on "Disconnect".
// Both states use a button above the fold (the full-page capture resets the scroll, which would move the pointer off a button below it).
export const instanceGitHover: ParityState = buttonHoverState(instanceGitDefault, 'instance-git-hover', 'button.disconnect.default', 'lite')
export const instanceGitFocus: ParityState = buttonFocusState(instanceGitDefault, 'instance-git-focus', 'button.disconnect.default', 'lite')

// Phases 11-12: the four dialogs of the page. Each opens from the card button that owns it.
export const instanceGitDisconnectModal: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-disconnect-modal',
  actions: {
    legacy: [...waitForConnected.legacy, clickButton('button.disconnect.default').legacy, modalOpen('heading.instance.advanced.git.disconnect.title').legacy],
    next: [...waitForConnected.next, clickButton('button.disconnect.default').next, modalOpen('heading.instance.advanced.git.disconnect.title').next],
  },
  probes: [gitTitleProbe, ...modalProbes('disconnect', ['heading.instance.advanced.git.disconnect.confirm', 'button.cancel'])],
}

export const instanceGitBranchModal: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-branch-modal',
  handlers: gitHandlers(gitStatus(), { 'GET /projects/1/git/branches': { json: { data: ['main', 'develop', 'staging'] } } }),
  actions: {
    legacy: [...waitForConnected.legacy, clickButton('button.manage').legacy, modalOpen('heading.instance.advanced.git.modal.branch.title').legacy],
    next: [...waitForConnected.next, clickButton('button.manage').next, modalOpen('heading.instance.advanced.git.modal.branch.title').next],
  },
  probes: [gitTitleProbe, manageProbe, ...modalProbes('branch', ['heading.instance.advanced.git.modal.branch.confirm', 'button.cancel'])],
}

export const instanceGitPullDirtyModal: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-pull-dirty-modal',
  handlers: gitHandlers(gitStatus(), { 'POST /projects/1/git/pull': { status: 422, json: { message: 'The working tree has local changes.', error_code: 'git_working_tree_dirty' } } }),
  actions: {
    legacy: [...waitForConnected.legacy, clickButton('button.git.pull').legacy, modalOpen('heading.instance.advanced.git.pullDirtyTree.title').legacy],
    next: [...waitForConnected.next, clickButton('button.git.pull').next, modalOpen('heading.instance.advanced.git.pullDirtyTree.title').next],
  },
  probes: [gitTitleProbe, ...modalProbes('pull-dirty', ['heading.instance.advanced.git.drift.revert', 'heading.instance.advanced.git.pullDirtyTree.force', 'button.cancel'])],
}

export const instanceGitPushFirstModal: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-push-first-modal',
  handlers: gitHandlers(gitStatus(), { 'POST /projects/1/git/pull': { status: 422, json: { message: 'The remote branch does not exist.', error_code: 'git_remote_branch_missing' } } }),
  actions: {
    legacy: [...waitForConnected.legacy, clickButton('button.git.pull').legacy, modalOpen('heading.instance.advanced.git.pushFirst.title').legacy],
    next: [...waitForConnected.next, clickButton('button.git.pull').next, modalOpen('heading.instance.advanced.git.pushFirst.title').next],
  },
  probes: [gitTitleProbe, ...modalProbes('push-first', ['heading.instance.advanced.git.pushFirst.confirm', 'button.cancel'])],
}

// S-131 (ui-instance-git-deploy-key): the SSH repository and its deploy key card. The key card loads with the page, so the state waits for its
// fingerprint. Every `instance-git-key-*` state spreads this one.
export const instanceGitKeyDefault: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-key-default',
  handlers: gitHandlers(gitStatus({ repo_url: SSH_REPO_URL, auth_type: null }), deployKeyHandlers(), { repoUrl: SSH_REPO_URL }),
  actions: {
    legacy: [...waitForConnected.legacy, waitFor(page => page.getByText(DEPLOY_KEY.fingerprint))],
    next: [...waitForConnected.next, waitFor(page => page.getByText(DEPLOY_KEY.fingerprint))],
  },
  probes: [gitTitleProbe, deployKeyCardProbe, deployKeyPanelProbe, deployKeyFingerprintProbe, deployKeyRegenerateProbe, deployKeyDeleteProbe],
}

// S-131 phase 6: the key request is held, so the key card shows its skeleton (the key card, not the page).
export const instanceGitKeyLoading: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-key-loading',
  handlers: gitHandlers(gitStatus({ repo_url: SSH_REPO_URL, auth_type: null }), deployKeyHandlers({ 'GET /projects/1/git/deploy-key': 'hold' }), { repoUrl: SSH_REPO_URL }),
  actions: waitForKeyLoading,
  probes: [gitTitleProbe, deployKeyCardProbe, deployKeyLoadingProbe],
}

// S-131 phase 5: the connected SSH repository has no deploy key yet, so the card shows its copy and the generate button.
export const instanceGitKeyMissing: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-key-missing',
  handlers: gitHandlers(gitStatus({ repo_url: SSH_REPO_URL, auth_type: null }), deployKeyHandlers({ 'GET /projects/1/git/deploy-key': { json: { data: null } } }), { repoUrl: SSH_REPO_URL }),
  actions: waitForKeyMissing,
  probes: [gitTitleProbe, deployKeyCardProbe, deployKeyMissingProbe, deployKeyGenerateProbe],
}

// S-131 phase 7: the key request answers 500, so the key card shows the load-failed message and Retry.
export const instanceGitKeyLoadError: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-key-load-error',
  handlers: gitHandlers(gitStatus({ repo_url: SSH_REPO_URL, auth_type: null }), deployKeyHandlers({ 'GET /projects/1/git/deploy-key': { status: 500, json: { message: 'Server Error' } } }), { repoUrl: SSH_REPO_URL }),
  actions: waitForKeyError,
  probes: [gitTitleProbe, deployKeyCardProbe, deployKeyLoadFailedProbe, deployKeyRetryProbe],
}

// S-131 phase 8: the delete and the rotate dialogs of the key card. Each opens from its card button (DOM click: the card sits below the fold).
export const instanceGitKeyDeleteModal: ParityState = {
  ...instanceGitKeyDefault,
  id: 'instance-git-key-delete-modal',
  actions: {
    legacy: [...instanceGitKeyDefault.actions.legacy, clickButton('button.onboarding.gitDeploy.deleteDeployKey').legacy, modalOpen('heading.onboarding.gitDeploy.auth.deployKey.deleteTitle').legacy],
    next: [...instanceGitKeyDefault.actions.next, clickButton('button.onboarding.gitDeploy.deleteDeployKey').next, modalOpen('heading.onboarding.gitDeploy.auth.deployKey.deleteTitle').next],
  },
  probes: [gitTitleProbe, deployKeyCardProbe, ...modalProbes('deploy-key-delete', ['button.onboarding.gitDeploy.deleteDeployKey', 'button.cancel'])],
}

export const instanceGitKeyRotateModal: ParityState = {
  ...instanceGitKeyDefault,
  id: 'instance-git-key-rotate-modal',
  actions: {
    legacy: [...instanceGitKeyDefault.actions.legacy, clickButton('button.onboarding.gitDeploy.regenerateDeployKey').legacy, modalOpen('heading.onboarding.gitDeploy.auth.deployKey.regenerateTitle').legacy],
    next: [...instanceGitKeyDefault.actions.next, clickButton('button.onboarding.gitDeploy.regenerateDeployKey').next, modalOpen('heading.onboarding.gitDeploy.auth.deployKey.regenerateTitle').next],
  },
  probes: [gitTitleProbe, deployKeyCardProbe, ...modalProbes('deploy-key-rotate', ['button.onboarding.gitDeploy.regenerateDeployKey', 'button.cancel'])],
}

// S-131 phase 10: the pull request is held, so the page is busy and the key card buttons (rotate, delete) are disabled. The Pull button is
// clicked from the DOM, so the page does not scroll to the card.
export const instanceGitKeyDisabled: ParityState = {
  ...instanceGitKeyDefault,
  id: 'instance-git-key-disabled',
  handlers: gitHandlers(gitStatus({ repo_url: SSH_REPO_URL, auth_type: null }), deployKeyHandlers({ 'POST /projects/1/git/pull': 'hold' }), { repoUrl: SSH_REPO_URL }),
  actions: {
    legacy: [...instanceGitKeyDefault.actions.legacy, clickButton('button.git.pull').legacy, waitForKeyButtonsDisabled],
    next: [...instanceGitKeyDefault.actions.next, clickButton('button.git.pull').next, waitForKeyButtonsDisabled],
  },
  probes: [gitTitleProbe, deployKeyCardProbe, deployKeyPanelProbe, deployKeyRegenerateProbe, deployKeyDeleteProbe],
}

// S-131 phase 9: hover and keyboard focus on „Delete key” in the key card header. The card sits below the fold on the smaller
// variants, so the scroll reset is skipped (`keepScroll`, as the other hover states below the fold). `target: 'lite'` is explicit.
export const instanceGitKeyHover: ParityState = {
  ...buttonHoverState(instanceGitKeyDefault, 'instance-git-key-hover', 'button.onboarding.gitDeploy.deleteDeployKey', 'lite'),
  keepScroll: true,
}
export const instanceGitKeyFocus: ParityState = {
  ...buttonFocusState(instanceGitKeyDefault, 'instance-git-key-focus', 'button.onboarding.gitDeploy.deleteDeployKey', 'lite'),
  keepScroll: true,
}

// S-131 phase 11: the connect form with an SSH address (not connected): the token, the hint and the connect button give way to the branch
// field and the generate button. The address is typed after the form is ready, so the generate button appears with it.
const sshConnectGenerateReady = waitFor(page => page.getByRole('button', { name: tr('button.onboarding.gitDeploy.generateDeployKey', 'lite'), exact: true }))
export const instanceGitKeySshConnect: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-key-ssh-connect',
  handlers: gitHandlers(notConnected),
  actions: {
    legacy: [...waitForConnectForm.legacy, fillRepoUrl(SSH_REPO_URL).legacy, sshConnectGenerateReady],
    next: [...waitForConnectForm.next, fillRepoUrl(SSH_REPO_URL).next, sshConnectGenerateReady],
  },
  probes: [gitTitleProbe, connectCardProbe, repoUrlFieldProbe, branchFieldProbe, deployKeyGenerateProbe],
}

// S-131 phase 12: the same form after "Generate deploy key": the key panel with Connect and deploy and Generate a new key, the generate button is gone.
const sshConnectKeyReady = waitFor(page => page.getByRole('button', { name: tr('button.onboarding.gitDeploy.connectAndDeploy', 'lite'), exact: true }))

export const instanceGitKeySshConnectKey: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-key-ssh-connect-key',
  handlers: gitHandlers(notConnected, deployKeyHandlers()),
  actions: {
    legacy: [...waitForConnectForm.legacy, fillRepoUrl(SSH_REPO_URL).legacy, sshConnectGenerateReady, clickButton('button.onboarding.gitDeploy.generateDeployKey').legacy, sshConnectKeyReady],
    next: [...waitForConnectForm.next, fillRepoUrl(SSH_REPO_URL).next, sshConnectGenerateReady, clickButton('button.onboarding.gitDeploy.generateDeployKey').next, sshConnectKeyReady],
  },
  probes: [gitTitleProbe, connectCardProbe, repoUrlFieldProbe, branchFieldProbe, connectKeyPanelProbe, connectAndDeployButtonProbe, deployKeyRegenerateProbe],
}

// S-131 phase 13: the same key panel after "Connect and deploy" fails: the server message stays under the panel, no toast. The
// message is the server's own text, so it is the same in both apps.
const SSH_CONNECT_ERROR = 'Permission denied (publickey).'
const sshConnectErrorReady = waitFor(page => page.getByText(SSH_CONNECT_ERROR, { exact: true }))

export const instanceGitKeySshConnectError: ParityState = {
  ...instanceGitDefault,
  id: 'instance-git-key-ssh-connect-error',
  handlers: gitHandlers(notConnected, deployKeyHandlers({ 'POST /projects/1/git/connect': { status: 422, json: { message: SSH_CONNECT_ERROR } } })),
  actions: {
    legacy: [...waitForConnectForm.legacy, fillRepoUrl(SSH_REPO_URL).legacy, sshConnectGenerateReady, clickButton('button.onboarding.gitDeploy.generateDeployKey').legacy, sshConnectKeyReady, clickButton('button.onboarding.gitDeploy.connectAndDeploy').legacy, sshConnectErrorReady],
    next: [...waitForConnectForm.next, fillRepoUrl(SSH_REPO_URL).next, sshConnectGenerateReady, clickButton('button.onboarding.gitDeploy.generateDeployKey').next, sshConnectKeyReady, clickButton('button.onboarding.gitDeploy.connectAndDeploy').next, sshConnectErrorReady],
  },
  probes: [gitTitleProbe, connectCardProbe, repoUrlFieldProbe, branchFieldProbe, connectKeyPanelProbe, connectKeyErrorProbe, connectAndDeployButtonProbe],
}

const states: ParityState[] = [
  instanceGitDefault,
  instanceGitKeyDefault,
  instanceGitKeyMissing,
  instanceGitKeyLoading,
  instanceGitKeyLoadError,
  instanceGitKeyDeleteModal,
  instanceGitKeyRotateModal,
  instanceGitKeyHover,
  instanceGitKeyFocus,
  instanceGitKeyDisabled,
  instanceGitKeySshConnect,
  instanceGitKeySshConnectKey,
  instanceGitKeySshConnectError,
  instanceGitNotConnected,
  instanceGitPrivate,
  instanceGitReuse,
  instanceGitValidation,
  instanceGitConnectError,
  instanceGitDrift,
  instanceGitSetup,
  instanceGitHealthError,
  instanceGitTokenUpdate,
  instanceGitDisabled,
  instanceGitRemoteAhead,
  instanceGitDeploying,
  instanceGitReadonly,
  instanceGitEmpty,
  instanceGitLoading,
  instanceGitLoadingConnect,
  instanceGitLogsLoading,
  instanceGitUnsupported,
  instanceGitHover,
  instanceGitFocus,
  instanceGitDisconnectModal,
  instanceGitBranchModal,
  instanceGitPullDirtyModal,
  instanceGitPushFirstModal,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
