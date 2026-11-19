import type { RedeployPayload } from '@/views/projects/project/instance.api'
import type { InstanceResource } from '@/entities/project/instance-resource'
import type { DeployStepKey, ProjectSource } from '@/entities/project/project-source.api'
import type { DeploySteps } from '@/entities/project/ui/deploy/deploy-skip'
import { skipPayload } from '@/entities/project/ui/deploy/deploy-skip'
import { getErrorCode, getErrorMessage } from '@/shared/api/error-message'

// The form state of the redeploy modal (branch, commits of the branch, skipped deploy
// steps and staging options, dirty working tree strategy) and everything it derives from it. Pure functions; the modal only renders the result and
// performs the calls (`getGitBranches`, `getGitCommits`, `getGitSourceStatus`, `getProjectSource`, `redeployInstance`).

/** Commit as `GET git/commits` lists it (`hash`, `message`; the rest passes untouched). */
export interface RedeployCommit {
  [key: string]: unknown
  hash: string
  message?: string
}

export type ConflictStrategy = 'force' | 'push_first'
export type RedeployPhase = 'form' | 'logs'

/** An answer of a previous target does not overwrite the form. */
export interface RedeploySeq {
  load: number
  commits: number
  git: number
}

/** The state of the modal without the deploy-logs viewer state. */
export interface RedeployForm {
  selectedBranch: string
  branches: string[]
  commits: RedeployCommit[]
  commitFrom: string | number | null | undefined
  commitTo: string | number | null | undefined
  commitTotal: number
  listLoading: boolean
  listError: boolean
  /** False when the target's checkout has not fetched the selected branch yet: the redeploy fetches it, the list stays empty. */
  branchFetched: boolean
  deployStaging: boolean
  /** `/source` of the deploy target (the viewed project, or its newest staging); null while loading or when it failed. */
  targetSource: ProjectSource | null
  /** Deploy categories the user unchecked (the model holds the skipped ones). */
  skippedSteps: DeployStepKey[]
  submitting: boolean
  gitStatusLoading: boolean
  treeDirty: boolean
  conflictStrategy: ConflictStrategy | null
  seq: RedeploySeq
}

type InstanceForRedeploy = Pick<InstanceResource, 'id' | 'git_repository'>
  & Partial<Pick<InstanceResource, 'source' | 'subInstances' | 'parentInstance'>>

/** The first seven characters of a hash, empty for a missing one. */
export function shortHash (hash: unknown): string {
  return (hash ?? '').toString().slice(0, 7)
}

/** The state the modal starts from; the branch defaults to the one the repository is bound to. */
export function createRedeployForm (instance: Pick<InstanceForRedeploy, 'git_repository'>): RedeployForm {
  return {
    selectedBranch: instance.git_repository?.branch || '',
    branches: [],
    commits: [],
    commitFrom: null,
    commitTo: null,
    commitTotal: 0,
    listLoading: false,
    listError: false,
    branchFetched: true,
    deployStaging: false,
    targetSource: null,
    skippedSteps: [],
    submitting: false,
    gitStatusLoading: false,
    treeDirty: false,
    conflictStrategy: null,
    seq: { load: 0, commits: 0, git: 0 },
  }
}

/** The reset when the modal opens: the sequence counters survive, so an answer of the previous opening stays stale. */
export function resetRedeployForm (form: RedeployForm, instance: Pick<InstanceForRedeploy, 'git_repository'>): void {
  Object.assign(form, createRedeployForm(instance), { seq: form.seq })
}

/** The trimmed `source.repo_name`, empty when it is not a string. */
export function redeployRepoName (instance: Pick<InstanceForRedeploy, 'source'>): string {
  const name = instance.source?.repo_name
  return typeof name === 'string' ? name.trim() : ''
}

/** The sub-instance with the highest id (the newest staging). */
export function newestStaging (instance: Pick<InstanceForRedeploy, 'subInstances'>): InstanceResource | null {
  const stagings = [...(instance.subInstances || [])]
  stagings.sort((a, b) => Number(b.id) - Number(a.id))
  return stagings[0] || null
}

/** The staging checkbox shows only for a production instance whose newest staging has a connected repository. */
export function showStagingCheckbox (instance: InstanceForRedeploy): boolean {
  if (instance.parentInstance) {
    return false
  }
  return Boolean(newestStaging(instance)?.git_repository?.connected)
}

/** The newest staging when "deploy staging" is on, otherwise the viewed instance. */
export function redeployTarget (instance: InstanceForRedeploy, deployStaging: boolean): InstanceForRedeploy {
  const staging = newestStaging(instance)
  return deployStaging && staging ? staging : instance
}

/** The branch the target is bound to, empty when none. */
export function targetBoundBranch (instance: InstanceForRedeploy, deployStaging: boolean): string {
  return (redeployTarget(instance, deployStaging).git_repository?.branch || '').toString()
}

/** A branch other than the bound one is selected. */
export function showBranchWarning (form: RedeployForm, instance: InstanceForRedeploy): boolean {
  const bound = targetBoundBranch(instance, form.deployStaging)
  return Boolean(form.selectedBranch && bound && form.selectedBranch !== bound)
}

/** A different branch, new commits, or a staging that is behind the target commit. */
export function redeployWouldChange (form: RedeployForm, instance: InstanceForRedeploy): boolean {
  if (form.listLoading || form.listError || !form.selectedBranch) {
    return false
  }
  if (form.selectedBranch !== targetBoundBranch(instance, form.deployStaging)) {
    return true
  }
  if (form.commitTotal > 0) {
    return true
  }
  const staging = newestStaging(instance)
  if (form.deployStaging && staging) {
    const stagingHash = staging.git_repository?.last_deployed_commit_hash
    return Boolean(form.commitTo && stagingHash && stagingHash !== form.commitTo)
  }
  return false
}

/** The Redeploy button is enabled; a redeploy without new commits rebuilds the deployed one (`rebuildSameHash`). */
export function canRedeploy (form: RedeployForm): boolean {
  if (!form.selectedBranch || form.submitting || form.listLoading || form.listError || form.gitStatusLoading) {
    return false
  }
  return !(form.treeDirty && !form.conflictStrategy)
}

/** With nothing new to pull the Engine rebuilds the commit already deployed; returns its short hash, null otherwise. */
export function rebuildSameHash (form: RedeployForm, instance: InstanceForRedeploy): string | null {
  if (form.listLoading || form.listError || form.commitTotal !== 0) {
    return null
  }
  if (form.selectedBranch !== targetBoundBranch(instance, form.deployStaging) || showStagingCatchUpHint(form, instance)) {
    return null
  }
  const target = redeployTarget(instance, form.deployStaging)
  return shortHash(form.commitFrom || target.git_repository?.last_deployed_commit_hash) || null
}

/** Id of the deploy target: the viewed project, or its newest staging when "deploy staging" is on (`targetGitId`). */
export function redeployTargetId (instance: InstanceForRedeploy, deployStaging: boolean): InstanceResource['id'] {
  return redeployTarget(instance, deployStaging).id
}

/** Another target starts with its own branch, lists and categories. */
export function changeRedeployTarget (form: RedeployForm, instance: InstanceForRedeploy, deployStaging: boolean): void {
  form.deployStaging = deployStaging
  form.conflictStrategy = null
  form.selectedBranch = targetBoundBranch(instance, deployStaging)
  form.branches = []
  form.commits = []
  form.commitFrom = null
  form.commitTo = null
  form.commitTotal = 0
  form.listError = false
  form.branchFetched = true
  form.targetSource = null
  form.skippedSteps = []
}

/** The target's categories, only while its `/source` says it is available. */
export function targetDeploySteps (form: RedeployForm): DeploySteps {
  return form.targetSource?.available === true ? (form.targetSource.deploy_steps ?? null) : null
}

/** The hint shows when staging only catches up to a commit production already has. */
export function showStagingCatchUpHint (form: RedeployForm, instance: InstanceForRedeploy): boolean {
  return form.deployStaging && form.commitTotal === 0 && redeployWouldChange(form, instance)
}

/** The i18n key and params of the hint under the staging checkbox. */
export function stagingHint (form: RedeployForm, instance: InstanceForRedeploy): { key: string, params: Record<string, string> } {
  if (showStagingCatchUpHint(form, instance)) {
    return {
      key: 'heading.instance.siteDetails.redeploy.stagingHint',
      params: { branch: form.selectedBranch, hash: shortHash(form.commitTo) },
    }
  }
  return {
    key: 'heading.instance.siteDetails.redeploy.productionStays',
    params: { hash: shortHash(instance.git_repository?.last_deployed_commit_hash) },
  }
}

/**
 * The empty list of a branch the site's checkout has not fetched: the branch list reads the remote, while the checkout holds one branch
 * only. Nothing is listed, but the redeploy is not a dead end - the panel switches branch and fetches it.
 */
export function branchNotFetched (form: RedeployForm): boolean {
  return !form.branchFetched && !form.listLoading && !form.listError
}

/** `from → to`, `→ to` for the first deploy, empty while loading or on an error. */
export function commitRangeLabel (form: RedeployForm): string {
  if (form.listLoading || form.listError) {
    return ''
  }
  if (form.commitFrom == null) {
    return form.commitTo ? `→ ${shortHash(form.commitTo)}` : ''
  }
  return `${shortHash(form.commitFrom)} → ${shortHash(form.commitTo)}`
}

export function redeployDialogWidth (phase: RedeployPhase): string {
  return phase === 'logs' ? '680px' : '560px'
}

/** Which body the commit list shows. */
export type CommitListState = 'loading' | 'error' | 'commits' | 'empty'

export function commitListState (form: RedeployForm): CommitListState {
  if (form.listLoading) {
    return 'loading'
  }
  if (form.listError) {
    return 'error'
  }
  return form.commitTotal > 0 ? 'commits' : 'empty'
}

/** A new target load invalidates the commit list still on its way; returns its sequence. */
export function beginTargetLoad (form: RedeployForm): number {
  form.seq.load += 1
  form.seq.commits += 1
  form.listError = false
  form.branchFetched = true
  return form.seq.load
}

/** Returns the sequence of this commit list. */
export function beginCommitsLoad (form: RedeployForm): number {
  form.seq.commits += 1
  form.listLoading = true
  form.listError = false
  return form.seq.commits
}

/** The strategy choice is always reset; returns the sequence. */
export function beginGitStatusLoad (form: RedeployForm): number {
  form.seq.git += 1
  form.gitStatusLoading = true
  form.conflictStrategy = null
  return form.seq.git
}

/** The list stops loading only for the current request. */
export function finishCommitsLoad (form: RedeployForm, seq: number): void {
  if (seq === form.seq.commits) {
    form.listLoading = false
  }
}

export function finishGitStatusLoad (form: RedeployForm, seq: number): void {
  if (seq === form.seq.git) {
    form.gitStatusLoading = false
  }
}

/** A missing list is an empty one; a stale answer is ignored. */
export function applyBranches (form: RedeployForm, branches: string[] | null | undefined, seq: number = form.seq.load): void {
  if (seq !== form.seq.load) {
    return
  }
  form.branches = branches || []
}

export function applyBranchesError (form: RedeployForm, seq: number = form.seq.load): void {
  if (seq !== form.seq.load) {
    return
  }
  form.branches = []
  form.listError = true
}

/** The target's `/source`, ignored when a newer target load replaced this one. */
export function applyTargetSource (form: RedeployForm, source: ProjectSource | null, seq: number = form.seq.load): void {
  if (seq === form.seq.load) {
    form.targetSource = source
  }
}

/** After a failed branch load with no branches the commits are not requested. */
export function shouldLoadCommits (form: RedeployForm): boolean {
  return !(form.listError && form.branches.length === 0)
}

export function applyCommits (
  form: RedeployForm,
  page: { commits?: unknown[], from?: string | number | null, to?: string | number | null, total?: number, branchFetched?: boolean },
  seq: number = form.seq.commits,
): void {
  if (seq !== form.seq.commits) {
    return
  }
  form.commits = (page.commits || []) as RedeployCommit[]
  form.commitFrom = page.from
  form.commitTo = page.to
  form.commitTotal = page.total || 0
  form.branchFetched = page.branchFetched !== false
  form.listError = false
}

export function applyCommitsError (form: RedeployForm, seq: number = form.seq.commits): void {
  if (seq !== form.seq.commits) {
    return
  }
  form.commits = []
  form.commitFrom = null
  form.commitTo = null
  form.commitTotal = 0
  form.listError = true
}

/** The working tree is dirty when `drift_status === 'dirty'`; the strategy choice is always reset. */
export function applyTargetStatus (form: RedeployForm, status: { drift_status?: string | null } | null | undefined, seq: number = form.seq.git): void {
  if (seq !== form.seq.git) {
    return
  }
  form.treeDirty = status?.drift_status === 'dirty'
  form.conflictStrategy = null
}

export function applyTargetStatusError (form: RedeployForm, seq: number = form.seq.git): void {
  if (seq !== form.seq.git) {
    return
  }
  form.treeDirty = false
  form.conflictStrategy = null
}

/** Ignored while submitting. */
export function setConflictStrategy (form: RedeployForm, strategy: ConflictStrategy): void {
  if (!form.submitting) {
    form.conflictStrategy = strategy
  }
}

/** The redeploy body: the strategy only when the tree is dirty, staging only when the checkbox is shown, `skip` only when a skippable category is unchecked. */
export function buildRedeployPayload (form: RedeployForm, instance: InstanceForRedeploy): RedeployPayload {
  const strategy = form.treeDirty ? form.conflictStrategy : null
  return {
    branch: form.selectedBranch,
    strategy: strategy || undefined,
    deploy_staging: form.deployStaging && showStagingCheckbox(instance),
    ...skipPayload(targetDeploySteps(form), form.skippedSteps),
  }
}

/** Outcome of a failed `POST redeploy`: the dirty tree reopens the strategy choice, anything else is an alert. */
export type RedeployFailure
  = | { kind: 'dirty' }
    | { kind: 'alert', inProgress: boolean, message: string }

/** `inProgress` (HTTP 409) tells the modal to prefer `notification.instance.git.redeploy.inProgress` over `message`. */
export function mapRedeployError (error: unknown): RedeployFailure {
  if (getErrorCode(error) === 'git_working_tree_dirty') {
    return { kind: 'dirty' }
  }
  const status = (error as { response?: { status?: number } } | null | undefined)?.response?.status
  return { kind: 'alert', inProgress: status === 409, message: getErrorMessage(error) }
}

/** The tree is dirty again and the user has to choose a strategy. */
export function applyDirtyFailure (form: RedeployForm): void {
  form.treeDirty = true
  form.conflictStrategy = null
  form.submitting = false
}

/** The form cannot be closed while it submits, the logs only after the deploy reached a terminal status. */
export function canCloseRedeploy (phase: RedeployPhase, submitting: boolean, logsTerminal: boolean): boolean {
  if (phase === 'form') {
    return !submitting
  }
  return logsTerminal
}

/** While submitting and during the whole logs phase the dialog is persistent. */
export function isRedeployPersistent (phase: RedeployPhase, submitting: boolean): boolean {
  return submitting || phase === 'logs'
}

/** The Echo event concerns the deploy this modal started. */
export function isRedeployTargetEvent (payload: { id?: unknown } | null | undefined, targetId: number | string | null): boolean {
  if (!payload || targetId == null) {
    return false
  }
  return Number(payload.id) === Number(targetId)
}
