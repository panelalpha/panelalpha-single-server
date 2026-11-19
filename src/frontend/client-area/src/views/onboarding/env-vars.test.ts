import type { EnvVarsContext, GitDeploy } from './onboarding.store'
import { describe, expect, it } from 'vitest'
import {
  buildEnvVarsPayload,
  continueEnvVarsPayload,
  gitEnvVarsContext,
  initialEnvBranch,
  mustChooseBranch,
  needsEnvVarsStep,
  originalValues,
  showsBranchSelect,
  skipEnvVarsPayload,
} from './env-vars'

const NO_EXAMPLE = { has_example: false, variables: [] }
const EXAMPLE = { has_example: true, variables: [{ key: 'DB_HOST', value: 'localhost' }, { key: 'DB_PORT', value: '3306' }] }

function deploy (patch: Partial<GitDeploy> = {}): GitDeploy {
  return {
    repo_url: 'https://x.test/r.git',
    token: null,
    branches: ['main'],
    default_branch: 'main',
    preview: NO_EXAMPLE,
    ...patch,
  }
}

describe('buildEnvVarsPayload', () => {
  it('sends only the keys the user changed (legacy buildEnvVarsPayload)', () => {
    const initial = originalValues(EXAMPLE.variables)
    const current = [{ key: 'DB_HOST', value: 'db.internal' }, { key: 'DB_PORT', value: '3306' }]

    expect(buildEnvVarsPayload(initial, current)).toEqual({ DB_HOST: 'db.internal' })
  })

  it('sends nothing when no value changed', () => {
    const initial = originalValues(EXAMPLE.variables)

    expect(buildEnvVarsPayload(initial, EXAMPLE.variables)).toEqual({})
  })

  it('counts a key the preview did not have as changed', () => {
    expect(buildEnvVarsPayload({}, [{ key: 'NEW', value: '1' }])).toEqual({ NEW: '1' })
  })

  it('reads a null preview value as an empty string', () => {
    const initial = originalValues([{ key: 'EMPTY', value: null as unknown as string }])

    expect(initial).toEqual({ EMPTY: '' })
    expect(buildEnvVarsPayload(initial, [{ key: 'EMPTY', value: '' }])).toEqual({})
  })
})

describe('skipEnvVarsPayload and continueEnvVarsPayload', () => {
  it('skip sends no variables and marks the step skipped', () => {
    expect(skipEnvVarsPayload()).toEqual({ env_vars: {}, skipped: true })
  })

  it('continue with no example is a skip, whatever the rows hold (legacy continueWithEnv)', () => {
    expect(continueEnvVarsPayload({}, [{ key: 'X', value: 'y' }], true)).toEqual({ env_vars: {}, skipped: true })
  })

  it('continue with an example sends the changed keys and is not skipped', () => {
    const initial = originalValues(EXAMPLE.variables)
    const current = [{ key: 'DB_HOST', value: 'db.internal' }, { key: 'DB_PORT', value: '3306' }]

    expect(continueEnvVarsPayload(initial, current, false)).toEqual({ env_vars: { DB_HOST: 'db.internal' }, skipped: false })
  })
})

describe('needsEnvVarsStep (legacy gitRepoSelected)', () => {
  it('opens for a repo with an example file, even on one branch', () => {
    expect(needsEnvVarsStep(deploy({ preview: EXAMPLE }))).toBe(true)
  })

  it('opens for more than one branch, even with no example', () => {
    expect(needsEnvVarsStep(deploy({ branches: ['main', 'dev'] }))).toBe(true)
  })

  it('stays closed for one branch and no example', () => {
    expect(needsEnvVarsStep(deploy())).toBe(false)
  })

  it('stays closed for an example that carries no variables', () => {
    expect(needsEnvVarsStep(deploy({ preview: { has_example: true, variables: [] } }))).toBe(false)
  })
})

describe('gitEnvVarsContext', () => {
  it('keeps the variables and the repo of a git deploy with an example', () => {
    const context = gitEnvVarsContext(deploy({ preview: EXAMPLE, branches: ['main', 'dev'], token: 'tok' }))

    expect(context).toEqual({
      source: 'git',
      variables: EXAMPLE.variables,
      hasExample: true,
      branches: ['main', 'dev'],
      branch: 'main',
      repoUrl: 'https://x.test/r.git',
      token: 'tok',
      previewReady: true,
    })
  })

  it('keeps no variables when the repo has no example (legacy variables: [])', () => {
    const context = gitEnvVarsContext(deploy({ branches: ['main', 'dev'] }))

    expect(context.variables).toEqual([])
    expect(context.hasExample).toBe(false)
  })
})

function sshContext (patch: Partial<EnvVarsContext> = {}): EnvVarsContext {
  return {
    source: 'git',
    variables: [],
    hasExample: false,
    branches: ['main', 'develop'],
    branch: 'main',
    repoUrl: 'git@x.test:r.git',
    token: null,
    previewReady: true,
    sshMode: true,
    branchMissing: false,
    missingBranch: null,
    ...patch,
  }
}

describe('SSH env step (legacy sshMode, bootstrap, mustChooseBranch, showBranchSelect)', () => {
  it('shows the branch select for a missing SSH branch even on one branch on the remote', () => {
    expect(showsBranchSelect(sshContext({ branches: ['main'], branchMissing: true, branch: null, missingBranch: 'feature' }))).toBe(true)
  })

  it('keeps the branch select on one branch when the SSH branch is present', () => {
    expect(showsBranchSelect(sshContext({ branches: ['main'] }))).toBe(false)
  })

  it('does not preselect a missing SSH branch (the context branch is already empty)', () => {
    expect(initialEnvBranch(sshContext({ branchMissing: true, branch: null, missingBranch: 'feature' }))).toBeNull()
  })

  it('starts an SSH branch that is present on the connected one', () => {
    expect(initialEnvBranch(sshContext({ branch: 'develop' }))).toBe('develop')
  })

  it('blocks Skip and Continue until another branch is picked, and while the missing one is selected', () => {
    const context = sshContext({ branchMissing: true, branch: null, missingBranch: 'feature' })

    expect(mustChooseBranch(context, null)).toBe(true)
    expect(mustChooseBranch(context, 'feature')).toBe(true)
    expect(mustChooseBranch(context, 'develop')).toBe(false)
  })

  it('never blocks a git source or an SSH branch that is present', () => {
    expect(mustChooseBranch(sshContext(), null)).toBe(false)
    expect(mustChooseBranch(sshContext({ sshMode: false, branchMissing: true }), null)).toBe(false)
    expect(mustChooseBranch(null, null)).toBe(false)
  })
})
