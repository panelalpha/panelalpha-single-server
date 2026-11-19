import type { GitAction, GitStatus } from './git-status'
import type { FieldRule } from '@/shared/ui/form/field-rule'
import type { Translate } from '@/shared/ui/modal/action-modal'
import type { ActionModal } from '@/entities/project/action-modal'
import { getErrorCode } from '@/shared/api/error-message'
import { cancelButton, MODAL_WIDTH } from '@/shared/ui/modal/action-modal'
import { isRemoteAheadOfSite } from './git-status'

// The modal builders and the runners of the actions the page starts from a dialog or a card. Pure
// builders and runners: the view owns the dialog (`useActionModal`) and the page state (`useGitPage`), the requests come in `GitActionDeps`.

/** The requests, alerts and translator the runners need (the shape of `BackupActionDeps` on the backups screen). */
export interface GitActionDeps {
  disconnectGit: (id: number | string) => Promise<void>
  updateGitCredentials: (id: number | string, token: string) => Promise<GitStatus>
  /** The status fetch of the page; the disconnect refetches it silently. */
  fetchGitStatus: (options?: { silent?: boolean }) => Promise<void>
  /** A plain status read, no loading flag, no logs. */
  refreshGitStatus: () => Promise<void>
  fetchGitLogs: () => Promise<void>
  changeBranch: (id: number | string, branch: string) => Promise<void>
  setAutoDeploy: (id: number | string, enabled: boolean) => Promise<GitStatus>
  /** `POST pull`, with a strategy from the pull dirty dialog (`force` or `push_first`). */
  pullGit: (id: number | string, strategy?: 'force' | 'push_first') => Promise<void>
  /** `POST push`; resolves `true` when there was nothing to push. */
  pushGit: (id: number | string) => Promise<boolean>
  revertGit: (id: number | string) => Promise<void>
  /** `POST drift/ignore`. */
  ignoreGitDrift: (id: number | string) => Promise<void>
  /** `POST repair`. */
  repairGit: (id: number | string) => Promise<void>
  /** Closes the branch dialog after the request succeeds, before the refetches. */
  closeModal: () => void
  addSuccessAlert: (message: string) => void
  addErrorAlert: (message: string) => void
  getErrorMessage: (error: unknown) => string
  /** `credentialsSubmitting` and the other card flags: set around the request. */
  setSubmitting: (action: GitAction, value: boolean) => void
  t: Translate
}

const BRANCH_MAX_LENGTH = 255

/**
 * The status and logs read after a mutation that already succeeded. A failed read must not turn the success into an error toast, so it is
 * swallowed here; the next poll or reload brings the page up to date (`fetchGitLogs` shows its own error toast).
 */
async function refetchAfterMutation (deps: GitActionDeps): Promise<void> {
  await deps.refreshGitStatus().catch(() => {})
  await deps.fetchGitLogs().catch(() => {})
}

/**
 * Required and at most 255 characters. The length rule skips an
 * empty value, which the required rule already reports, so one empty field shows one message.
 */
function branchRules (t: Translate): FieldRule[] {
  const field = (): string => t('heading.instance.advanced.git.modal.branch.field')
  return [
    value => !!(value && String(value).trim()) || t('form.validation.required', { field: field() }),
    value => !value || String(value).trim().length <= BRANCH_MAX_LENGTH
      || t('form.validation.maxLength', { field: field(), length: BRANCH_MAX_LENGTH }),
  ]
}

/**
 * Built after the branch list is read: a combobox when the list is not empty,
 * else a text field (`branches` is `null` after a failed read, and the dialog has no toast for it). The field starts with the current branch.
 * The combobox sends the name that was typed as well as the one that was picked: a plain select kept the old value, so a typed branch
 * deployed the old one and reported success. A name the remote does not have is refused by the Engine with its own message.
 */
export function buildBranchModal (branches: string[] | null, current: string | null | undefined, t: Translate): ActionModal {
  const options = (branches ?? []).map(name => ({ label: name, value: name }))
  const field = {
    label: t('heading.instance.advanced.git.modal.branch.field'),
    name: 'branch',
    rules: branchRules(t),
  }

  return {
    type: 'git-branch',
    props: {
      title: t('heading.instance.advanced.git.modal.branch.title'),
      message: t('heading.instance.advanced.git.modal.branch.message'),
      alert: t('heading.instance.advanced.git.modal.branch.warning'),
      icon: '$edit',
      buttons: [{ id: 'submit', label: t('heading.instance.advanced.git.modal.branch.confirm'), color: 'primary' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [options.length > 0
      ? { ...field, type: 'combobox', options }
      : { ...field, type: 'text' }],
    width: MODAL_WIDTH,
    persistent: false,
    values: { branch: current || '' },
  }
}

/**
 * The access token dialog, opened by the Access token card's Manage button (as the Branch card opens the branch dialog) and by the health
 * alert's "Update access token" link (legacy showed an inline field). One password field, required after
 * trimming; the view saves it with `runUpdateCredentials`.
 */
export function buildTokenModal (t: Translate): ActionModal {
  const label = t('heading.instance.advanced.git.connection.tokenLabel')

  return {
    type: 'git-token',
    props: {
      title: t('heading.instance.advanced.git.modal.token.title'),
      message: t('heading.instance.advanced.git.modal.token.message'),
      icon: '$edit',
      buttons: [{ id: 'submit', label: t('heading.instance.advanced.git.modal.token.confirm'), color: 'primary' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [{
      type: 'password',
      name: 'token',
      label,
      rules: [value => !!(value && String(value).trim()) || t('form.validation.required', { field: label })],
    }],
    width: MODAL_WIDTH,
    persistent: false,
    values: { token: '' },
  }
}

/** What the branch dialog does with the request: `dirty` opens the Revert/Force dialog instead of a toast. */
export type ChangeBranchOutcome = 'done' | 'dirty' | 'failed'

/**
 * The trimmed branch goes to the request, then the modal closes, the status and the
 * logs are refetched and the success toast follows. A failure shows the error toast and the dialog stays open; a dirty tree answers `dirty`.
 */
export async function runChangeBranch (instanceId: number | string, values: Record<string, unknown>, deps: GitActionDeps): Promise<ChangeBranchOutcome> {
  const branch = String(values.branch ?? '').trim()
  if (!branch) {
    return 'failed'
  }

  try {
    await deps.changeBranch(instanceId, branch)
    deps.closeModal()
    await refetchAfterMutation(deps)
    deps.addSuccessAlert(deps.t('notification.instance.git.branch.success'))
    return 'done'
  } catch (error) {
    if (gitErrorReaction(getErrorCode(error)) === 'dirty') {
      return 'dirty'
    }
    deps.addErrorAlert(deps.getErrorMessage(error))
    return 'failed'
  }
}

/**
 * Only the status is read again (no logs), then the success toast.
 */
export async function runCheckUpdates (deps: GitActionDeps): Promise<void> {
  deps.setSubmitting('check', true)
  try {
    await deps.refreshGitStatus()
    deps.addSuccessAlert(deps.t('notification.instance.git.check.success'))
  } catch (error) {
    deps.addErrorAlert(deps.getErrorMessage(error))
  } finally {
    deps.setSubmitting('check', false)
  }
}

/**
 * The status from the response replaces the page's one (the caller does that and
 * starts the poll when the deploy is in progress). A failure refetches the status silently, so the switch goes back to the server state.
 * Returns `null` on failure.
 */
export async function runSetAutoDeploy (instanceId: number | string, enabled: boolean, deps: GitActionDeps): Promise<GitStatus | null> {
  deps.setSubmitting('autoDeploy', true)
  try {
    const status = await deps.setAutoDeploy(instanceId, enabled)
    deps.addSuccessAlert(deps.t('notification.instance.git.autoDeploy.success'))
    return status
  } catch (error) {
    await deps.fetchGitStatus({ silent: true })
    deps.addErrorAlert(deps.getErrorMessage(error))
    return null
  } finally {
    deps.setSubmitting('autoDeploy', false)
  }
}

/** The warning dialog with the red confirm button and the cancel button. */
export function buildDisconnectModal (t: Translate): ActionModal {
  return {
    type: 'git-disconnect',
    props: {
      title: t('heading.instance.advanced.git.disconnect.title'),
      message: t('heading.instance.advanced.git.disconnect.subtitle'),
      icon: '$alertwarning',
      color: 'error',
      buttons: [
        { id: 'submit', label: t('heading.instance.advanced.git.disconnect.confirm'), color: 'error' },
        cancelButton(t),
      ],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

/**
 * The request, then a silent status refetch and the success toast. A failure
 * shows the error toast. The caller closes the dialog after the request either way; this differs from legacy on purpose (legacy kept
 * the dialog open and showed the error inside it). The busy state is the dialog's (persistent while the request runs).
 */
export async function runDisconnect (instanceId: number | string, deps: GitActionDeps): Promise<'disconnected' | 'error'> {
  try {
    await deps.disconnectGit(instanceId)
  } catch (error) {
    deps.addErrorAlert(deps.getErrorMessage(error))
    return 'error'
  }

  await deps.fetchGitStatus({ silent: true })
  deps.addSuccessAlert(deps.t('notification.instance.git.disconnect.success'))
  return 'disconnected'
}

/**
 * The new status comes back in the response, and the success toast follows.
 * Returns the status for the caller to store and close the token dialog; `null` on failure (the error toast is shown here, the dialog stays
 * open). The caller trims the token and checks it is not empty, as legacy does before the request.
 */
export async function runUpdateCredentials (instanceId: number | string, token: string, deps: GitActionDeps): Promise<GitStatus | null> {
  deps.setSubmitting('credentials', true)
  try {
    const status = await deps.updateGitCredentials(instanceId, token)
    deps.addSuccessAlert(deps.t('notification.instance.git.credentials.success'))
    return status
  } catch (error) {
    deps.addErrorAlert(deps.getErrorMessage(error))
    return null
  } finally {
    deps.setSubmitting('credentials', false)
  }
}

/** What the page does with a git error code. */
export type GitErrorReaction = 'dirty' | 'push-first' | 'refresh' | 'toast'

export function gitErrorReaction (code: string | null | undefined): GitErrorReaction {
  switch (code) {
    case 'git_working_tree_dirty': {
      return 'dirty'
    }
    case 'git_remote_branch_missing': {
      return 'push-first'
    }
    case 'git_invalid_token':
    case 'git_access_denied': {
      return 'refresh'
    }
    default: {
      return 'toast'
    }
  }
}

/**
 * The dialog for a pull that found local changes. Three buttons spin one at
 * a time (`loadingMode: 'active'`): Revert, Force and Push first (its hint is added when the remote is ahead), then Cancel.
 */
export function buildPullDirtyModal (status: Pick<GitStatus, 'commits_behind'>, t: Translate): ActionModal {
  const pushFirst = t('heading.instance.advanced.git.pullDirtyTree.pushFirst')
  const pushFirstLabel = Number(status.commits_behind || 0) > 0
    ? `${pushFirst} — ${t('heading.instance.advanced.git.pullDirtyTree.pushFirstHint')}`
    : pushFirst

  return {
    type: 'git-pull-dirty',
    props: {
      title: t('heading.instance.advanced.git.pullDirtyTree.title'),
      message: t('heading.instance.advanced.git.pullDirtyTree.message'),
      alert: t('heading.instance.advanced.git.pullDirtyTree.warning'),
      icon: '$alertwarning',
      loadingMode: 'active',
      buttons: [
        { id: 'revert', label: t('heading.instance.advanced.git.drift.revert'), color: 'error' },
        { id: 'force', label: t('heading.instance.advanced.git.pullDirtyTree.force'), color: 'primary' },
        { id: 'push_first', label: pushFirstLabel, color: 'primary' },
        cancelButton(t),
      ],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

/** The warning that the remote has commits the site does not, confirm pushes. */
export function buildPushFirstModal (t: Translate): ActionModal {
  return {
    type: 'git-push-first',
    props: {
      title: t('heading.instance.advanced.git.pushFirst.title'),
      message: t('heading.instance.advanced.git.pushFirst.message'),
      icon: '$alertwarning',
      buttons: [{ id: 'submit', label: t('heading.instance.advanced.git.pushFirst.confirm'), color: 'primary' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

/** `dirty` and `push-first` are the dialogs the caller opens; `failed` keeps the page as it was, the error toast is shown. */
export type PullOutcome = 'done' | 'dirty' | 'push-first' | 'failed'

/**
 * A pull without a strategy that finds local changes returns `dirty` (no toast), and
 * a missing remote branch returns `push-first` (no toast). On success the dialog closes, the status and the logs are refetched and the toast
 * follows. A token or access error refetches the status before its toast.
 */
export async function runPull (instanceId: number | string, strategy: 'force' | 'push_first' | undefined, deps: GitActionDeps): Promise<PullOutcome> {
  deps.setSubmitting('pull', true)
  try {
    await deps.pullGit(instanceId, strategy)
    deps.closeModal()
    await refetchAfterMutation(deps)
    deps.addSuccessAlert(deps.t('notification.instance.git.pull.success'))
    return 'done'
  } catch (error) {
    const reaction = gitErrorReaction(getErrorCode(error))
    if (reaction === 'dirty' && strategy === undefined) {
      return 'dirty'
    }
    if (reaction === 'push-first') {
      return 'push-first'
    }
    if (reaction === 'refresh') {
      await deps.refreshGitStatus().catch(() => {})
    }
    deps.addErrorAlert(deps.getErrorMessage(error))
    return 'failed'
  } finally {
    deps.setSubmitting('pull', false)
  }
}

/**
 * The local changes are dropped. Resolves `true` on success, so the dirty dialog
 * closes; a failure shows the error toast and the dialog stays open.
 */
export async function runRevert (instanceId: number | string, deps: GitActionDeps): Promise<boolean> {
  deps.setSubmitting('revert', true)
  try {
    await deps.revertGit(instanceId)
    await refetchAfterMutation(deps)
    deps.addSuccessAlert(deps.t('notification.instance.git.revert.success'))
    return true
  } catch (error) {
    deps.addErrorAlert(deps.getErrorMessage(error))
    return false
  } finally {
    deps.setSubmitting('revert', false)
  }
}

/** `blocked`: the remote is ahead of the site, so the push is refused before any request. */
export type PushOutcome = 'done' | 'blocked' | 'failed'

/**
 * Nothing is sent while the remote is ahead of the site; `nothing_to_push` picks its
 * own toast. A token or access error refetches the status before the toast.
 */
export async function runPush (instanceId: number | string, status: Pick<GitStatus, 'commits_behind' | 'commits_ahead'>, deps: GitActionDeps): Promise<PushOutcome> {
  if (isRemoteAheadOfSite(status)) {
    deps.addErrorAlert(deps.t('heading.instance.advanced.git.push.pullFirstHint'))
    return 'blocked'
  }

  deps.setSubmitting('push', true)
  try {
    const nothingToPush = await deps.pushGit(instanceId)
    await refetchAfterMutation(deps)
    deps.addSuccessAlert(deps.t(nothingToPush ? 'notification.instance.git.push.nothing' : 'notification.instance.git.push.success'))
    return 'done'
  } catch (error) {
    if (gitErrorReaction(getErrorCode(error)) === 'refresh') {
      await deps.refreshGitStatus().catch(() => {})
    }
    deps.addErrorAlert(deps.getErrorMessage(error))
    return 'failed'
  } finally {
    deps.setSubmitting('push', false)
  }
}

/**
 * The drift banner is dismissed, then the status is read silently (its logs too) and the
 * success toast follows. A failure shows the error toast.
 */
export async function runIgnoreDrift (instanceId: number | string, deps: GitActionDeps): Promise<void> {
  deps.setSubmitting('ignoreDrift', true)
  try {
    await deps.ignoreGitDrift(instanceId)
    await deps.fetchGitStatus({ silent: true })
    deps.addSuccessAlert(deps.t('notification.instance.git.drift.ignore.success'))
  } catch (error) {
    deps.addErrorAlert(deps.getErrorMessage(error))
  } finally {
    deps.setSubmitting('ignoreDrift', false)
  }
}

/**
 * After the repair the status is read again and the success toast follows. Legacy
 * reads the status again on `git_local_repository_exists` too (the repair found the folder already there), and toasts the error in both cases.
 */
export async function runRepair (instanceId: number | string, deps: GitActionDeps): Promise<void> {
  deps.setSubmitting('repair', true)
  try {
    await deps.repairGit(instanceId)
    await deps.refreshGitStatus()
    deps.addSuccessAlert(deps.t('notification.instance.git.repair.success'))
  } catch (error) {
    if (getErrorCode(error) === 'git_local_repository_exists') {
      await deps.refreshGitStatus().catch(() => {})
    }
    deps.addErrorAlert(deps.getErrorMessage(error))
  } finally {
    deps.setSubmitting('repair', false)
  }
}
