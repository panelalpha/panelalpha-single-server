import type { EnvExamplePreview, EnvVariable } from './onboarding.api'
import type { EnvVarsContext, GitDeploy } from './onboarding.store'
import { resolveSshDefaultBranch } from './git-ssh-launch'

// The rules of the optional env vars step live here, so the modal and the flow share one copy and the tests need no DOM.

/** What the env vars step hands on. */
export interface EnvVarsResult {
  branch?: string | null
  env_vars: Record<string, string>
  skipped?: boolean
}

/** A preview value that is null becomes an empty string. */
export function variableValue (value: unknown): string {
  return value == null ? '' : String(value)
}

/** The value each key had when the preview came in. */
export function originalValues (variables: readonly EnvVariable[]): Record<string, string> {
  const values: Record<string, string> = {}
  for (const variable of variables) {
    values[variable.key] = variableValue(variable.value)
  }
  return values
}

/**
 * Only the keys the user changed. Unchanged prefilled defaults stay on the engine, and a key
 * the preview did not have counts as changed.
 */
export function buildEnvVarsPayload (initial: Record<string, string>, current: readonly EnvVariable[]): Record<string, string> {
  const changed: Record<string, string> = {}
  for (const row of current) {
    const before = Object.hasOwn(initial, row.key) ? initial[row.key] : undefined
    if (row.value !== before) {
      changed[row.key] = row.value
    }
  }
  return changed
}

/** No variables, and the step is marked skipped. */
export function skipEnvVarsPayload (): EnvVarsResult {
  return { env_vars: {}, skipped: true }
}

/**
 * With no example there is nothing to send, so the continue is a skip. Otherwise the changed keys go.
 */
export function continueEnvVarsPayload (initial: Record<string, string>, current: readonly EnvVariable[], missingExample: boolean): EnvVarsResult {
  if (missingExample) {
    return skipEnvVarsPayload()
  }
  return { env_vars: buildEnvVarsPayload(initial, current), skipped: false }
}

/** The preview has example variables. */
export function hasExampleVariables (preview: EnvExamplePreview): boolean {
  return preview.has_example === true && Array.isArray(preview.variables) && preview.variables.length > 0
}

/**
 * The env vars step opens when the repo has an example env file or more than one branch;
 * otherwise the deploy goes straight on.
 */
export function needsEnvVarsStep (deploy: GitDeploy): boolean {
  return hasExampleVariables(deploy.preview) || deploy.branches.length > 1
}

/**
 * The env vars context of a git repo. The preview is ready (the connect sequence read it), and the variables are only
 * kept when there is an example; the branch select works from the repo url and the token.
 */
export function gitEnvVarsContext (deploy: GitDeploy): EnvVarsContext {
  const hasExample = hasExampleVariables(deploy.preview)
  return {
    source: 'git',
    variables: hasExample ? [...deploy.preview.variables] : [],
    hasExample,
    branches: deploy.branches,
    branch: deploy.default_branch,
    repoUrl: deploy.repo_url,
    token: deploy.token,
    previewReady: true,
  }
}

/**
 * The env vars context of an SSH deploy-key repo. The branch starts on the connected one, or
 * on nothing when that branch is missing on the remote (`resolveSshDefaultBranch`). No token: the deploy key authenticates.
 */
export function sshEnvVarsContext (deploy: GitDeploy): EnvVarsContext {
  const hasExample = hasExampleVariables(deploy.preview)
  const branchMissing = deploy.branch_missing === true
  return {
    source: 'git',
    variables: hasExample ? [...deploy.preview.variables] : [],
    hasExample,
    branches: deploy.branches,
    branch: resolveSshDefaultBranch({ branchMissing, branches: deploy.branches, connectedBranch: deploy.branch }),
    repoUrl: deploy.repo_url,
    token: null,
    previewReady: true,
    sshMode: true,
    branchMissing,
    missingBranch: deploy.branch ?? null,
  }
}

/**
 * A git source with several branches, and an SSH deploy whose branch is missing
 * (the select is the way out, even with one branch on the remote).
 */
export function showsBranchSelect (context: EnvVarsContext | null): boolean {
  if (!context || context.source !== 'git') {
    return false
  }
  return context.branches.length > 1 || (context.sshMode === true && context.branchMissing === true)
}

/**
 * An SSH deploy whose branch is missing waits for another branch. Until one is picked, or while the missing one
 * is still selected, Skip and Continue are off.
 */
export function mustChooseBranch (context: EnvVarsContext | null, selected: string | null): boolean {
  return context?.sshMode === true && context.branchMissing === true && (!selected || selected === context.missingBranch)
}

/**
 * A missing SSH branch is not preselected (`resolveSshDefaultBranch` left it empty). Every other
 * source starts on the context branch, or the first branch.
 */
export function initialEnvBranch (context: EnvVarsContext): string | null {
  if (context.sshMode === true && context.branchMissing === true) {
    return context.branch ?? null
  }
  return context.branch || context.branches[0] || null
}
