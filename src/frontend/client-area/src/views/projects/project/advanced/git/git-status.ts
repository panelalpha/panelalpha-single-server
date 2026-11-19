import type { GitConnectPayload } from './git.api'
import type { StatusLabelStatus } from '@/shared/ui/status-label/status-label'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { isSshRepoUrl } from '@/entities/project/git-ssh-url'
import { getErrorMessage } from '@/shared/api/error-message'

// Pure rules of the git page, free of the DOM so the
// composable and the view share them. Later phases append their conditions here.

/** The body of `GET /instances/{id}/git`. */
export interface GitStatus {
  connected: boolean
  repo_url: string | null
  branch: string | null
  pair_branch: string | null
  auth_type?: string | null
  last_deployed_commit_hash: string | null
  last_deployed_commit_message: string | null
  last_deployed_commit_at: string | null
  has_synced_once?: boolean | null
  drift_status?: string | null
  commits_behind: number | null
  commits_ahead: number | null
  remote_branch_exists?: boolean | null
  local_repository_exists?: boolean | null
  /** `deploy` when the project deploys from its repository (the Engine's `WorkTree` keeps that checkout itself). */
  managed_by?: string | null
  show_drift_banner?: boolean
  connection_health?: { status?: string, reason?: string | null } | null
  auto_deploy_enabled?: boolean
  webhook_registered?: boolean
  async_status?: { git_attach?: string | null, git_pull?: string | null, git_auto_deploy?: string | null } | null
}

/** One row of `GET /instances/{id}/git/logs` (`data[]`). */
export interface GitLog {
  action: string
  status: string
  /** The branches a `branch_change` row switched between; null on the older rows and the other actions. */
  branch_from?: string | null
  branch_to?: string | null
  commit_hash: string | null
  commit_message: string | null
  error_message: string | null
  created_at: string
}

/** The busy flags of the page (`submitting`, `pullSubmitting`, ...). */
export type GitAction = 'connect' | 'pull' | 'push' | 'revert' | 'ignoreDrift' | 'check' | 'autoDeploy' | 'credentials' | 'repair'

/** The git exception on an unsupported hosting is matched by its English text, not by a code. */
export function isHostingUnsupported (error: unknown): boolean {
  return getErrorMessage(error).toLowerCase().includes('not supported')
}

/**
 * The parent instance, else the staging with the highest id. Works on a copy, so the
 * instance list is not reordered.
 */
export function gitPair (instance: Pick<InstanceResource, 'parentInstance' | 'subInstances'>): InstanceResource | null {
  if (instance.parentInstance) {
    return instance.parentInstance
  }

  const stagings = [...(instance.subInstances || [])]
  if (stagings.length === 0) {
    return null
  }

  stagings.sort((a, b) => Number(b.id) - Number(a.id))
  return stagings[0] ?? null
}

/** The pair already has a connected repository, so the connect form offers reuse. */
export function canReuseConnection (instance: Pick<InstanceResource, 'parentInstance' | 'subInstances'>): boolean {
  return gitPair(instance)?.git_repository?.connected === true
}

/** A hash longer than 10 characters keeps 7 and the last 3. */
export function shortHash (value: string | null | undefined): string {
  const hash = (value ?? '').toString().trim()
  if (!hash) {
    return ''
  }
  return hash.length > 10 ? `${hash.slice(0, 7)}…${hash.slice(-3)}` : hash
}

/** An https URL without `.git`, an ssh URL as https, anything else has no link. */
export function toRepositoryHref (url: string | null | undefined): string | null {
  const value = (url ?? '').trim()
  if (!value) {
    return null
  }

  if (/^https?:\/\//i.test(value)) {
    return value.replace(/\.git$/, '')
  }

  const sshMatch = value.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`
  }

  const sshUrlMatch = value.match(/^ssh:\/\/git@([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshUrlMatch) {
    return `https://${sshUrlMatch[1]}/${sshUrlMatch[2]}`
  }

  return null
}

/** The inputs of the busy-flag predicates: the page's flags and the dialog's `submitting`. */
export interface GitActionFlags {
  submitting: Record<GitAction, boolean>
  setupBannerChecking: boolean
  modalSubmitting?: boolean
}

/** The busy flags of the page that disable its actions. Later phases add their own. */
export function gitActionDisabled (flags: GitActionFlags): boolean {
  return Object.values(flags.submitting).some(Boolean) || flags.setupBannerChecking || flags.modalSubmitting === true
}

/** At least one of the remote counts is known. */
export function hasRemoteStatus (status: Pick<GitStatus, 'commits_behind' | 'commits_ahead'>): boolean {
  return (status.commits_behind !== null && status.commits_behind !== undefined)
    || (status.commits_ahead !== null && status.commits_ahead !== undefined)
}

/**
 * The remote has commits the site does not. Without any remote counts (`null` for both)
 * the remote is not known to be ahead.
 */
export function isRemoteAheadOfSite (status: Pick<GitStatus, 'commits_behind' | 'commits_ahead'>): boolean {
  return hasRemoteStatus(status) && Number(status.commits_behind || 0) > 0
}

export function showLocalRepoMissingBanner (status: Pick<GitStatus, 'connected' | 'local_repository_exists'>): boolean {
  return status.connected === true && status.local_repository_exists === false
}

/** The busy flags are set, or the local repository is missing. */
export function gitSyncActionDisabled (flags: GitActionFlags, status: Pick<GitStatus, 'connected' | 'local_repository_exists'>): boolean {
  return gitActionDisabled(flags) || showLocalRepoMissingBanner(status)
}

export function isAutoDeployInProgress (status: Pick<GitStatus, 'async_status'>): boolean {
  return (status.async_status?.git_auto_deploy || '') === 'in_progress'
}

/** The last deployed commit has a hash. */
export function hasLastCommit (status: Pick<GitStatus, 'last_deployed_commit_hash'>): boolean {
  return shortHash(status.last_deployed_commit_hash) !== ''
}

/**
 * The date with `time`, then the relative time in brackets. A value that is not a date
 * (`moment` invalid) is shown as it is. Empty means no date row.
 */
export function lastCommitDeployedAt (
  value: string | null | undefined,
  formatDate: (value: string, options: { time: boolean }) => string,
  fromNow: (date: string) => string,
): string | null {
  if (!value) {
    return null
  }
  if (Number.isNaN(new Date(value).getTime())) {
    return value
  }
  return `${formatDate(value, { time: true })} (${fromNow(value)})`
}

/** Form state of the connect card. */
export interface ConnectFormState {
  /** The instance's own repository is connected (`gitStatus.connected`). The connect card is shown only while it is not. */
  connected: boolean
  /** The pair's repository is reused, i.e. `canReuseConnection && !showManualConnectForm`. */
  reuse: boolean
  repoUrl: string
  isPrivate: boolean
  patToken: string
  /** The branch of an SSH connect; unused by the other modes. */
  branch: string
}

export interface ConnectFieldErrors {
  repoUrl: string[]
  patToken: string[]
  branch: string[]
}

type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * A not-connected page, no reuse of the pair's repository, and an SSH address. The connect
 * form then uses the deploy key branch (branch field, no PAT).
 */
export function isSshConnect ({ connected, reuse, repoUrl }: { connected: boolean, reuse: boolean, repoUrl: string }): boolean {
  return !connected && !reuse && isSshRepoUrl(repoUrl.trim())
}

/**
 * The connected repository is an SSH one and the user may manage git, so the deploy
 * key card is shown.
 */
export function showConnectedDeployKey (status: Pick<GitStatus, 'connected' | 'repo_url'>, canManageGit: boolean): boolean {
  return status.connected === true && canManageGit && isSshRepoUrl(status.repo_url)
}

/**
 * The deploy key card: the connected SSH repository, or any project whose current key the
 * Engine answered, so a key made before the repository was connected stays visible.
 */
export function showDeployKeyCard (status: Pick<GitStatus, 'connected' | 'repo_url'>, canManageGit: boolean, hasKey: boolean): boolean {
  return canManageGit && (hasKey || showConnectedDeployKey(status, canManageGit))
}

/**
 * The Access token card (a difference from legacy): shown for a connected HTTPS repository, which the panel reaches with a token and
 * whose auto-deploy webhook it registers with that token. An SSH repository uses its deploy key, so it has no card.
 */
export function showAccessTokenCard (status: Pick<GitStatus, 'connected' | 'repo_url'>): boolean {
  return status.connected === true && !!status.repo_url && !isSshRepoUrl(status.repo_url)
}

/** The panel holds a token it can read (`auth_type` `pat`); `null` when connected as public, or when the token can no longer be read. */
export function hasAccessToken (status: Pick<GitStatus, 'auth_type'>): boolean {
  return status.auth_type === 'pat'
}

/**
 * Only `required`, checked on submit. Reuse has no errors. The URL and the token
 * are trimmed before the check, as the payload is. An SSH connect checks only the branch.
 */
export function connectFieldErrors (state: ConnectFormState, t: Translate): ConnectFieldErrors {
  if (state.reuse) {
    return { repoUrl: [], patToken: [], branch: [] }
  }

  if (isSshConnect(state)) {
    return {
      repoUrl: [],
      patToken: [],
      branch: state.branch.trim()
        ? []
        : [t('form.validation.required', { field: t('heading.onboarding.gitDeploy.branch.label') })],
    }
  }

  const repoUrl = state.repoUrl.trim()
  const patToken = state.patToken.trim()

  return {
    repoUrl: repoUrl
      ? []
      : [t('form.validation.required', { field: t('heading.instance.advanced.git.connect.repoUrl') })],
    patToken: state.isPrivate && !patToken
      ? [t('form.validation.required', { field: t('heading.instance.advanced.git.connect.token') })]
      : [],
    branch: [],
  }
}

/** A refused connect's `errors` keys by the field that shows them; `host` has no field and sits under the URL. */
const CONNECT_ERROR_FIELDS: Record<string, keyof ConnectFieldErrors> = {
  repo_url: 'repoUrl',
  source: 'repoUrl',
  host: 'repoUrl',
  token: 'patToken',
  git_token: 'patToken',
}

/** A 422 from `git/connect` on the fields its `errors` name, or `null` when no key has a field. */
export function connectFieldRefusal (error: unknown): ConnectFieldErrors | null {
  const response = (error as { response?: { status?: number, data?: { errors?: unknown } | null } } | null | undefined)?.response
  const bag = response?.data?.errors
  if (response?.status !== 422 || !bag || typeof bag !== 'object') {
    return null
  }

  const errors: ConnectFieldErrors = { repoUrl: [], patToken: [], branch: [] }
  for (const [key, messages] of Object.entries(bag as Record<string, unknown>)) {
    const field = CONNECT_ERROR_FIELDS[key]
    if (field) {
      errors[field].push(...(Array.isArray(messages) ? messages : [messages]).map(String))
    }
  }

  return Object.values(errors).some(messages => messages.length > 0) ? errors : null
}

/**
 * The pair's repository id in reuse mode, the URL and the trimmed branch for
 * an SSH connect, else the URL with the PAT only for a private repository (`auth_type: null, token: null` for a public one).
 */
export function connectPayload (state: ConnectFormState, pair: InstanceResource | null): GitConnectPayload {
  const repository = pair?.git_repository
  if (state.reuse && repository) {
    return { git_repository_id: repository.id }
  }

  if (isSshConnect(state)) {
    return { repo_url: state.repoUrl.trim(), branch: state.branch.trim() }
  }

  return {
    repo_url: state.repoUrl.trim(),
    auth_type: state.isPrivate ? 'pat' : null,
    token: state.isPrivate ? state.patToken.trim() : null,
  }
}

/** Whether a connect writes the branch into the site, read from the status loaded before it: the answer does not say. */
export function connectReplacesSiteFiles (
  status: Pick<GitStatus, 'connected' | 'local_repository_exists' | 'managed_by'>,
): boolean {
  return status.connected !== true
    && status.local_repository_exists !== true
    && status.managed_by !== 'deploy'
}

/**
 * A 422 whose body says the repository is connected, though the first sync
 * failed. Returns the trimmed server message (empty when there is none), or `null` for any other error.
 */
export function connectSyncFailure (error: unknown): { message: string } | null {
  const response = (error as { response?: { status?: number, data?: { connected?: unknown, message?: unknown } | null } } | null | undefined)?.response
  if (response?.status !== 422 || response.data?.connected !== true) {
    return null
  }

  return { message: String(response.data.message ?? '').trim() }
}

/** A missing status counts as `ok`. */
export function isConnectionHealthError (status: Pick<GitStatus, 'connection_health'>): boolean {
  return (status.connection_health?.status || 'ok') === 'error'
}

/**
 * The copy key of the health alert by `reason`, `null` when the pair is not connected.
 * An unknown reason (or none) falls back to the `unknown` copy, as legacy does.
 */
export function connectionHealthMessageKey (status: Pick<GitStatus, 'connected' | 'connection_health'>): string | null {
  if (!status.connected) {
    return null
  }
  if (!isConnectionHealthError(status)) {
    return 'heading.instance.advanced.git.connection.ok'
  }

  switch (status.connection_health?.reason) {
    case 'token': { return 'heading.instance.advanced.git.connection.error.token'
    }
    case 'network': { return 'heading.instance.advanced.git.connection.error.network'
    }
    case 'not_found': { return 'heading.instance.advanced.git.connection.error.not_found'
    }
    case 'local_repo_missing': { return 'heading.instance.advanced.git.connection.error.localRepoMissing'
    }
    default: { return 'heading.instance.advanced.git.connection.error.unknown'
    }
  }
}

/** These statuses carry the error tooltip. */
const FAILED_LOG_STATUSES = new Set(['error', 'failed', 'failure', 'skipped'])

export function logStatusColor (status: string | null | undefined): StatusLabelStatus {
  const value = (status ?? '').toString().toLowerCase()
  if (['success', 'succeeded', 'ok', 'finished', 'done'].includes(value)) {
    return 'success'
  }
  if (['error', 'failed', 'failure'].includes(value)) {
    return 'error'
  }
  if (value === 'skipped') {
    return 'warning'
  }
  if (['pending', 'in_progress', 'running'].includes(value)) {
    return 'info'
  }
  return 'gray'
}

/**
 * `…git.logs.action.<a>`, then `…git.<a>.title`, then the raw action.
 * `exists` tells whether a key has a translation (`i18next.exists`); the lookup ignores case and surrounding spaces.
 */
export function logActionLabel (action: string | null | undefined, t: Translate, exists: (key: string) => boolean): string {
  const raw = (action ?? '').toString()
  const normalised = raw.trim().toLowerCase()
  if (!normalised) {
    return ''
  }

  const logKey = `heading.instance.advanced.git.logs.action.${normalised}`
  if (exists(logKey)) {
    return t(logKey)
  }

  const titleKey = `heading.instance.advanced.git.${normalised}.title`
  if (exists(titleKey)) {
    return t(titleKey)
  }

  return raw
}

/** `…git.logs.status.<s>`, else the raw status. */
export function logStatusLabel (status: string | null | undefined, t: Translate, exists: (key: string) => boolean): string {
  const raw = (status ?? '').toString()
  const normalised = raw.trim().toLowerCase()
  if (!normalised) {
    return ''
  }

  const key = `heading.instance.advanced.git.logs.status.${normalised}`
  return exists(key) ? t(key) : raw
}

/** The trimmed error of a failed or skipped row, empty otherwise. */
export function logErrorTooltip (log: Pick<GitLog, 'status' | 'error_message'>): string {
  const status = (log.status ?? '').toString().trim().toLowerCase()
  if (!FAILED_LOG_STATUSES.has(status)) {
    return ''
  }
  return (log.error_message ?? '').toString().trim()
}

/** A failed or skipped row with an error message gets the chip tooltip. */
export function hasErrorTooltip (log: Pick<GitLog, 'status' | 'error_message'>): boolean {
  return logErrorTooltip(log) !== ''
}

/** `hash message`, whichever part is present. */
export function logCommitSummary (log: Pick<GitLog, 'commit_hash' | 'commit_message'>): string {
  const hash = (log.commit_hash ?? '').toString().trim()
  const message = (log.commit_message ?? '').toString().trim()
  if (hash && message) {
    return `${hash} ${message}`
  }
  return hash || message || ''
}

/**
 * The branches a `branch_change` row switched between: `main → develop`. The Engine's checkout keeps only the current one, so the
 * row is the only place the pair is left; a row recorded before the panel stored them (or another action) has none.
 */
export function logBranchChange (log: Pick<GitLog, 'branch_from' | 'branch_to'>): string {
  const from = (log.branch_from ?? '').toString().trim()
  const to = (log.branch_to ?? '').toString().trim()
  if (!to) {
    return ''
  }
  return from ? `${from} → ${to}` : to
}

/** The connected pair has drifted and the banner is not ignored. */
export function showDriftBanner (status: Pick<GitStatus, 'connected' | 'show_drift_banner'>): boolean {
  return status.connected === true && status.show_drift_banner === true
}

/** A connected pair that has not synced yet. */
export function showSetupBanner (status: Pick<GitStatus, 'connected' | 'has_synced_once'>): boolean {
  return status.connected === true && status.has_synced_once !== true
}

/** The remote and the site both have commits the other does not. */
export function isDiverged (status: Pick<GitStatus, 'commits_behind' | 'commits_ahead'>): boolean {
  return Number(status.commits_behind || 0) > 0 && Number(status.commits_ahead || 0) > 0
}

/** The setup banner's button: a pull (plain, or with the count behind) or a push. */
export type SetupBannerAction = 'pull' | 'pull-behind' | 'push'

/**
 * No button while the remote counts are unknown. Behind the remote is a pull with its count.
 * Otherwise push is recommended when the site has commits ahead, the remote branch is missing or the tree is dirty; else a plain pull.
 */
export function setupBannerAction (status: Pick<GitStatus, 'commits_behind' | 'commits_ahead' | 'remote_branch_exists' | 'drift_status'>): SetupBannerAction | null {
  if (!hasRemoteStatus(status)) {
    return null
  }
  if (Number(status.commits_behind || 0) > 0) {
    return 'pull-behind'
  }

  const recommendPush = Number(status.commits_ahead || 0) > 0
    || status.remote_branch_exists === false
    || status.drift_status === 'dirty'
  return recommendPush ? 'push' : 'pull'
}

/**
 * The pair's branch equals the instance's, and the instance has a pair (a parent
 * or a staging). The caller picks the staging or the live copy by `instance.parentInstance`.
 */
export function isSameBranchAsPair (
  status: Pick<GitStatus, 'branch' | 'pair_branch'>,
  instance: Pick<InstanceResource, 'parentInstance' | 'subInstances'>,
): boolean {
  const pairBranch = (status.pair_branch || '').trim()
  const currentBranch = (status.branch || '').trim()
  if (!pairBranch || !currentBranch || pairBranch !== currentBranch) {
    return false
  }
  return Boolean(instance.parentInstance) || (instance.subInstances?.length ?? 0) > 0
}
