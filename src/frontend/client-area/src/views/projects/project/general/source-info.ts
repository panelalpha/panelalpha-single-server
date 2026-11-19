import type { InstanceResource, InstanceSource } from '@/entities/project/instance-resource'
import type { ProjectSource } from '@/entities/project/project-source.api'

// What the two source cards of a
// custom project show (repository, branch, live "behind" status, database, stack + archive size, deploy time) and which action button
// they offer. Pure functions; the cards only render the result.

/** The database column of both cards: `present` is a boolean, `label` an empty string when missing. */
export interface SourceDatabase {
  present: boolean
  label: string
}

/** `/projects` under a `/projects` route, otherwise `/instances`. */
export function resourceBase (path: string): '/projects' | '/instances' {
  return path.startsWith('/projects') ? '/projects' : '/instances'
}

/** The link of the "Manage" row: `${resourceBase}/${id}/advanced/containers`. */
export function containersPath (path: string, id: number | string): string {
  return `${resourceBase(path)}/${id}/advanced/containers`
}

export function repoName (source: InstanceSource | null | undefined): string {
  return source?.repo_name || ''
}

/** The branch of a connected repository wins over `source.branch`. */
export function sourceBranch (
  source: InstanceSource | null | undefined,
  gitRepository: Pick<NonNullable<InstanceResource['git_repository']>, 'connected' | 'branch'> | null | undefined,
): string {
  if (gitRepository?.connected === true && gitRepository.branch) {
    return gitRepository.branch
  }
  return source?.branch || ''
}

/** Strictly `git_repository.connected === true`. */
export function isGitConnected (gitRepository: { connected?: boolean } | null | undefined): boolean {
  return gitRepository?.connected === true
}

/** `data.commits_behind`, `null`/`undefined` stay `null`, anything else is a number. */
export function parseCommitsBehind (data: { commits_behind?: unknown } | null | undefined): number | null {
  const value = data?.commits_behind
  return value === null || value === undefined ? null : Number(value)
}

/** The live status line state of the Git card (`statusLoading`, `statusLoaded`, `liveCommitsBehind`). */
export interface GitLiveStatus {
  loading: boolean
  loaded: boolean
  commitsBehind: number | null
}

/** A connected repository starts in the loading state before the first request. */
export function initialGitLiveStatus (connected: boolean): GitLiveStatus {
  return { loading: connected, loaded: false, commitsBehind: null }
}

export function showUpToDate (status: Pick<GitLiveStatus, 'loaded' | 'commitsBehind'>): boolean {
  return status.loaded && status.commitsBehind === 0
}

/** `liveCommitsBehind > 0`; `null` is not behind. */
export function showBehind (status: Pick<GitLiveStatus, 'loaded' | 'commitsBehind'>): boolean {
  return status.loaded && status.commitsBehind !== null && status.commitsBehind > 0
}

/** The footer button of the Git card: manage git (not connected), redeploy (connected), or none without the privilege. */
export type GitCardAction = 'manage' | 'redeploy' | null

/** The footer actions of the card and the pair of buttons shown when the repository is not connected. */
export function gitCardAction (connected: boolean, privileges: { manageGit: boolean, redeploy: boolean }): GitCardAction {
  if (!connected) {
    return privileges.manageGit ? 'manage' : null
  }
  return privileges.redeploy ? 'redeploy' : null
}

/** Route name `ProjectGit` under `/projects/`, `Git` otherwise. */
export function gitPageRouteName (path: string): 'ProjectGit' | 'Git' {
  return path.includes('/projects/') ? 'ProjectGit' : 'Git'
}

// The cards read `GET /instances/{id}/source` first and fall back to the project payload (`instance.source` / `instance.details`) whenever
// the Engine could not answer: `available: false`, `null`, or a request that failed. The card never shows less than the payload did.

/** Deploy state the cards colour: `running`, `failed`, `finished`; any other status is `''`. */
export type SourceDeployState = '' | 'running' | 'failed' | 'finished'

/** The `deploy` part of `sourceCardView`: short commit, raw timestamp (the card formats it with `useDateFormat`), and whether the deploy
 * waits for a files project's archive (`waiting_for_files`, the Engine's create deploy of a files project). */
export interface SourceDeployView {
  state: SourceDeployState
  commit: string
  at: string
  waitingForFiles: boolean
}

/** What the Git and Files cards show of the source (`sourceCardView`). */
export interface SourceCardView {
  stackLabel: string
  database: SourceDatabase
  deploy: SourceDeployView
}

/** The first 7 characters of a commit hash, `''` for an empty hash. */
export function shortCommit (hash: string | null | undefined): string {
  return hash ? String(hash).slice(0, 7) : ''
}

/** A last deploy as the payload or `/source` sends it (`commit` exists only on `/source`). */
export interface SourceLastDeploy {
  status?: string | null
  commit?: string | null
  finished_at?: string | null
  waiting_for_files?: boolean
}

const DEPLOY_STATES: ReadonlyArray<SourceDeployState> = ['running', 'failed', 'finished']

function deployView (lastDeploy: SourceLastDeploy | null | undefined): SourceDeployView {
  if (!lastDeploy) {
    return { state: '', commit: '', at: '', waitingForFiles: false }
  }
  const state = DEPLOY_STATES.find(item => item === lastDeploy.status) ?? ''
  return {
    state,
    commit: shortCommit(lastDeploy.commit),
    at: lastDeploy.finished_at || '',
    waitingForFiles: state === 'running' && lastDeploy.waiting_for_files === true,
  }
}

/** `/source` values when `available === true`, otherwise the project payload. */
export function sourceCardView (
  source: ProjectSource | null | undefined,
  instance: Pick<InstanceResource, 'source' | 'details'>,
): SourceCardView {
  const payload: InstanceSource = instance.source ?? {}
  const detected = (instance.details?.detected_stack ?? {}) as { label?: string }
  const real = source && source.available === true ? source : null

  const stack = real?.stack ?? null
  const database: { present?: boolean, label?: string | null } = real?.database || payload.database || {}

  return {
    stackLabel: stack?.label || detected.label || '',
    database: { present: Boolean(database.present), label: database.label || '' },
    deploy: deployView(real?.last_deploy || payload.last_deploy),
  }
}
