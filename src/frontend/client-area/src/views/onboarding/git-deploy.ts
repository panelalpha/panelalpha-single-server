import type { EnvExamplePreview, GitBranchesResult, GitEnvPreviewBody, GitUrlTestResult } from './onboarding.api'
import type { GitDeploy } from './onboarding.store'
import { getErrorMessage } from '@/shared/api/error-message'

// The modal keeps the form state and the spinner; this module holds the
// connect sequence with its requests injected, so the order, the statuses and the error precedence are testable without the DOM.

/** The status the connect sequence reports while it runs. */
export type GitConnectStatus = 'connecting' | 'detectingBranches' | 'detectingEnv'

export interface GitConnectInput {
  repoUrl: string
  isPrivate: boolean
  /** The token field. Used only when the repo is private. */
  token: string
}

export interface GitConnectDeps {
  testGitUrl: (body: { repo_url: string, token: string | null }) => Promise<GitUrlTestResult>
  getGitBranches: (body: { repo_url: string, token: string | null }) => Promise<GitBranchesResult>
  previewEnvExample: (body: GitEnvPreviewBody) => Promise<EnvExamplePreview>
  /** Translates a copy key. Used for the fallback of a failed url test. */
  translate: (key: string) => string
  /** Called as each step of the sequence starts. */
  onStatus?: (status: GitConnectStatus) => void
}

/** Either the connected repo the form hands on, or the message the form shows. */
export type GitConnectOutcome = { ok: true, deploy: GitDeploy } | { ok: false, message: string }

/** Legacy empty preview: no example file, no variables. A fresh object per use. */
function emptyPreview (): EnvExamplePreview {
  return { has_example: false, variables: [] }
}

/**
 * The repo url is required, and a private repo also needs its token. Whitespace
 * counts as empty.
 */
export function canContinue (repoUrl: string, isPrivate: boolean, token: string): boolean {
  if (repoUrl.trim() === '') {
    return false
  }
  return !(isPrivate && token.trim() === '')
}

/**
 * Tests the url, then reads the branches and the env preview of the default branch, then hands the result
 * on. A failed url test ends the sequence with its message (`error_message`, then the fallback copy). The branches and the
 * preview are best effort: their failure is swallowed, so the form goes on with none.
 */
export async function connectGitRepo (deps: GitConnectDeps, input: GitConnectInput): Promise<GitConnectOutcome> {
  const repoUrl = input.repoUrl.trim()
  const token = input.isPrivate && input.token.trim() !== '' ? input.token.trim() : null

  try {
    deps.onStatus?.('connecting')
    const result = await deps.testGitUrl({ repo_url: repoUrl, token })
    if (result.success !== true) {
      return { ok: false, message: result.error_message || deps.translate('heading.onboarding.gitDeploy.connectionFailed') }
    }
  } catch (error) {
    return { ok: false, message: typeof error === 'string' ? error : getErrorMessage(error) }
  }

  deps.onStatus?.('detectingBranches')
  let branches: string[] = []
  let defaultBranch: string | null = null
  try {
    const data = await deps.getGitBranches({ repo_url: repoUrl, token })
    if (data?.success) {
      branches = data.branches || []
      defaultBranch = data.default_branch || null
    }
  } catch {
    branches = []
    defaultBranch = null
  }

  deps.onStatus?.('detectingEnv')
  let preview: EnvExamplePreview
  try {
    preview = (await deps.previewEnvExample({ repo_url: repoUrl, token, branch: defaultBranch })) || emptyPreview()
  } catch {
    preview = emptyPreview()
  }

  return {
    ok: true,
    deploy: { repo_url: repoUrl, token, branches, default_branch: defaultBranch, preview },
  }
}
