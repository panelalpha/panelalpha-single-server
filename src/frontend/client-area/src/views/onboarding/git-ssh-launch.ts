import type { EnvExamplePreview } from './onboarding.api'
import { parseSshRepoUrl } from '@/entities/project/git-ssh-url'

// The SSH (deploy key) branch of the git form and the
// env vars step. Pure functions, so the modal and the flow share one copy and the tests need no DOM. The address parser lives in
// `entities/project/git-ssh-url.ts`; `isSshRepoUrl` is re-exported here so the onboarding imports stay as they were.

export { isSshRepoUrl } from '@/entities/project/git-ssh-url'

export type RepoProvider = 'github' | 'gitlab' | 'bitbucket' | 'other'

/** The forge of an SSH repo address; anything else (other hosts, HTTPS) is `other`. */
export function repoProvider (url: string | null | undefined): RepoProvider {
  const parsed = parseSshRepoUrl(url)
  if (!parsed) {
    return 'other'
  }
  if (parsed.host === 'github.com') {
    return 'github'
  }
  if (parsed.host === 'gitlab.com') {
    return 'gitlab'
  }
  if (parsed.host === 'bitbucket.org') {
    return 'bitbucket'
  }
  return 'other'
}

/** The page where the repo's deploy keys are added, or `null` when the forge is unknown or the path has no owner. */
export function deployKeySettingsUrl (url: string | null | undefined): string | null {
  const parsed = parseSshRepoUrl(url)
  const provider = repoProvider(url)
  if (!parsed || provider === 'other' || !parsed.path.includes('/')) {
    return null
  }
  if (provider === 'github') {
    return `https://github.com/${parsed.path}/settings/keys`
  }
  if (provider === 'gitlab') {
    return `https://gitlab.com/${parsed.path}/-/settings/repository`
  }
  return `https://bitbucket.org/${parsed.path}/admin/access-keys/`
}

function hasExample (preview: EnvExamplePreview | null | undefined): boolean {
  return !!preview && preview.has_example === true && Array.isArray(preview.variables) && preview.variables.length > 0
}

/** `'env-vars'` unless the project can be deployed straight away (one branch, no example env file). */
export function resolveSshNextStep ({ branchMissing, branches, preview }: {
  branchMissing?: boolean
  branches?: string[] | null
  preview?: EnvExamplePreview | null
} = {}): 'env-vars' | 'deploy' {
  if (branchMissing) {
    return 'env-vars'
  }
  if ((branches || []).length > 1 || hasExample(preview)) {
    return 'env-vars'
  }
  return 'deploy'
}

/**
 * The branch the env step starts on. A missing branch is not preselected, unless the remote has exactly one branch.
 */
export function resolveSshDefaultBranch ({ branchMissing, branches, connectedBranch }: {
  branchMissing?: boolean
  branches?: string[] | null
  connectedBranch?: string | null
} = {}): string | null {
  const list = branches || []
  if (!branchMissing) {
    return connectedBranch || list[0] || null
  }
  return list.length === 1 ? list[0] : null
}
