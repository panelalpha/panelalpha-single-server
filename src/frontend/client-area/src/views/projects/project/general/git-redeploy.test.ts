import type { InstanceResource } from '@/entities/project/instance-resource'
import { describe, expect, it } from 'vitest'
import {
  applyBranches,
  applyBranchesError,
  applyCommits,
  applyCommitsError,
  applyDirtyFailure,
  applyTargetSource,
  applyTargetStatus,
  applyTargetStatusError,
  beginCommitsLoad,
  beginTargetLoad,
  branchNotFetched,
  buildRedeployPayload,
  canCloseRedeploy,
  canRedeploy,
  changeRedeployTarget,
  commitListState,
  commitRangeLabel,
  createRedeployForm,
  isRedeployPersistent,
  isRedeployTargetEvent,
  mapRedeployError,
  newestStaging,
  rebuildSameHash,
  redeployDialogWidth,
  redeployRepoName,
  redeployWouldChange,
  resetRedeployForm,
  setConflictStrategy,
  shortHash,
  shouldLoadCommits,
  showBranchWarning,
  showStagingCheckbox,
  stagingHint,
} from './git-redeploy'

function staging (id: number, connected = true, hash: string | null = 'bbbbbbbbb') {
  return { id, git_repository: { connected, branch: 'stage', last_deployed_commit_hash: hash } } as unknown as InstanceResource
}

function instance (extra: Record<string, unknown> = {}) {
  return {
    id: 1,
    source: { repo_name: ' acme/site ' },
    git_repository: { connected: true, branch: 'main', last_deployed_commit_hash: 'aaaaaaaaaa' },
    subInstances: [],
    parentInstance: null,
    ...extra,
  } as unknown as InstanceResource
}

describe('git-redeploy form', () => {
  it('starts on the bound branch (default branch) with empty lists', () => {
    const form = createRedeployForm(instance())
    expect(form.selectedBranch).toBe('main')
    expect(form).toMatchObject({ branches: [], commits: [], commitTotal: 0, treeDirty: false, conflictStrategy: null })
    expect(createRedeployForm({ git_repository: null }).selectedBranch).toBe('')
  })

  it('shortens hashes and trims the repository name', () => {
    expect(shortHash('1234567890')).toBe('1234567')
    expect(shortHash(null)).toBe('')
    expect(redeployRepoName(instance())).toBe('acme/site')
    expect(redeployRepoName({ source: null })).toBe('')
  })

  it('picks the newest staging and offers it only for a production instance with a connected staging', () => {
    const inst = instance({ subInstances: [staging(3), staging(8, false)] })
    expect(newestStaging(inst)?.id).toBe(8)
    expect(showStagingCheckbox(inst)).toBe(false)
    expect(showStagingCheckbox(instance({ subInstances: [staging(3), staging(8)] }))).toBe(true)
    expect(showStagingCheckbox(instance({ subInstances: [staging(8)], parentInstance: { id: 2 } }))).toBe(false)
  })

  it('warns when another branch than the bound one is selected', () => {
    const form = createRedeployForm(instance())
    expect(showBranchWarning(form, instance())).toBe(false)
    form.selectedBranch = 'dev'
    expect(showBranchWarning(form, instance())).toBe(true)
  })

  it('has no change without new commits on the bound branch, but the redeploy rebuilds the deployed commit', () => {
    const form = createRedeployForm(instance())
    applyCommits(form, { commits: [], from: 'aaaaaaaaaa', to: 'aaaaaaaaaa', total: 0 })
    expect(redeployWouldChange(form, instance())).toBe(false)
    expect(commitListState(form)).toBe('empty')
    expect(canRedeploy(form)).toBe(true)
    expect(rebuildSameHash(form, instance())).toBe('aaaaaaa')
  })

  it('shows no rebuild copy for a different branch or while loading, and the deployed hash without a commit range', () => {
    const form = createRedeployForm(instance())
    applyCommits(form, { commits: [], from: 'aaaaaaaaaa', to: 'aaaaaaaaaa', total: 0 })
    form.selectedBranch = 'dev'
    expect(rebuildSameHash(form, instance())).toBeNull()
    form.selectedBranch = 'main'
    form.listLoading = true
    expect(rebuildSameHash(form, instance())).toBeNull()
    form.listLoading = false
    applyCommits(form, { commits: [], from: null, to: null, total: 0 })
    expect(rebuildSameHash(form, instance())).toBe('aaaaaaa')
    expect(rebuildSameHash(form, instance({ git_repository: { connected: true, branch: 'main', last_deployed_commit_hash: null } }))).toBeNull()
  })

  it('lets a staging catch up to the target commit and explains it', () => {
    const inst = instance({ subInstances: [staging(8, true, 'old')] })
    const form = createRedeployForm(inst)
    form.deployStaging = true
    form.selectedBranch = 'stage'
    applyCommits(form, { commits: [], from: 'x', to: 'newcommit1', total: 0 })
    expect(redeployWouldChange(form, inst)).toBe(true)
    expect(stagingHint(form, inst)).toEqual({
      key: 'heading.instance.siteDetails.redeploy.stagingHint',
      params: { branch: 'stage', hash: 'newcomm' },
    })
    expect(stagingHint(createRedeployForm(inst), inst)).toEqual({
      key: 'heading.instance.siteDetails.redeploy.productionStays',
      params: { hash: 'aaaaaaa' },
    })
  })

  it('formats the commit range', () => {
    const form = createRedeployForm(instance())
    applyCommits(form, { commits: [], from: null, to: 'abcdefghij', total: 1 })
    expect(commitRangeLabel(form)).toBe('→ abcdefg')
    applyCommits(form, { commits: [], from: '1111111111', to: '2222222222', total: 1 })
    expect(commitRangeLabel(form)).toBe('1111111 → 2222222')
    applyCommitsError(form)
    expect(commitRangeLabel(form)).toBe('')
  })

  it('marks a branch the checkout has not fetched and keeps the redeploy available', () => {
    const form = createRedeployForm(instance())
    expect(branchNotFetched(form)).toBe(false)

    // The panel's commits answer with `branch_fetched: false` (Engine: `git log` of an unfetched ref).
    applyCommits(form, { commits: [], from: null, to: null, total: 0, branchFetched: false })
    expect(branchNotFetched(form)).toBe(true)
    expect(commitListState(form)).toBe('empty')
    expect(canRedeploy(form)).toBe(true)

    // A later read of a fetched branch clears it, and so does a new target.
    applyCommits(form, { commits: [{ hash: 'a' }], from: 'a', to: 'a', total: 0 })
    expect(branchNotFetched(form)).toBe(false)
    applyCommits(form, { commits: [], total: 0, branchFetched: false })
    beginTargetLoad(form)
    expect(branchNotFetched(form)).toBe(false)
    expect(form.branchFetched).toBe(true)
  })

  it('handles list errors: failed branches skip the commits, failed commits show the error row', () => {
    const form = createRedeployForm(instance())
    applyBranchesError(form)
    expect(shouldLoadCommits(form)).toBe(false)
    expect(commitListState(form)).toBe('error')
    expect(canRedeploy(form)).toBe(false)
    applyBranches(form, ['main', 'dev'])
    expect(shouldLoadCommits(form)).toBe(true)
    applyBranches(form, null)
    expect(form.branches).toEqual([])
    applyCommitsError(form)
    expect(form).toMatchObject({ commits: [], commitTotal: 0, listError: true })
  })

  it('requires a conflict strategy for a dirty tree and resets it with every status', () => {
    const form = createRedeployForm(instance())
    applyCommits(form, { commits: [], total: 2, to: 'c', from: 'a' })
    applyTargetStatus(form, { drift_status: 'dirty' })
    expect(form.treeDirty).toBe(true)
    expect(canRedeploy(form)).toBe(false)
    setConflictStrategy(form, 'force')
    expect(canRedeploy(form)).toBe(true)
    applyTargetStatus(form, { drift_status: 'dirty' })
    expect(form.conflictStrategy).toBeNull()
    setConflictStrategy(form, 'push_first')
    applyTargetStatusError(form)
    expect(form).toMatchObject({ treeDirty: false, conflictStrategy: null })
    form.submitting = true
    setConflictStrategy(form, 'force')
    expect(form.conflictStrategy).toBeNull()
  })

  it('builds the payload: strategy only for a dirty tree, staging only when offered', () => {
    const inst = instance({ subInstances: [staging(8)] })
    const form = createRedeployForm(inst)
    form.conflictStrategy = 'force'
    expect(buildRedeployPayload(form, inst)).toEqual({ branch: 'main', strategy: undefined, deploy_staging: false })
    form.treeDirty = true
    form.deployStaging = true
    expect(buildRedeployPayload(form, inst)).toEqual({ branch: 'main', strategy: 'force', deploy_staging: true })
    expect(buildRedeployPayload(form, instance()).deploy_staging).toBe(false)
  })

  it('sends skip only for unchecked skippable categories of an available source, and no key otherwise', () => {
    const inst = instance()
    const form = createRedeployForm(inst)
    applyTargetSource(form, {
      available: true,
      deploy_steps: {
        dependencies: { commands: ['npm ci'], skippable: true },
        build: { commands: ['npm run build'], skippable: true },
        migrations: { commands: ['php artisan migrate'], skippable: false },
      },
    } as never)
    form.skippedSteps = ['build', 'migrations']
    expect(buildRedeployPayload(form, inst)).toEqual({ branch: 'main', deploy_staging: false, skip: ['build'] })
    expect(Object.keys(buildRedeployPayload(form, inst))).toContain('skip')

    form.skippedSteps = []
    expect(buildRedeployPayload(form, inst)).not.toHaveProperty('skip')

    form.skippedSteps = ['build']
    applyTargetSource(form, { available: false, deploy_steps: { build: { commands: ['x'], skippable: true } } } as never)
    expect(buildRedeployPayload(form, inst)).not.toHaveProperty('skip')
  })

  it('resets the form on open but keeps the sequence counters, so a late answer of the previous opening is ignored', () => {
    const form = createRedeployForm(instance())
    const seq = beginTargetLoad(form)
    resetRedeployForm(form, instance())
    expect(form.seq.load).toBe(seq)
    expect(beginTargetLoad(form)).toBe(seq + 1)
    applyBranches(form, ['late'], seq)
    expect(form.branches).toEqual([])
  })

  it('a staging switch ignores the answers of the previous target', () => {
    const inst = instance({ subInstances: [staging(8, true, 'old')] })
    const form = createRedeployForm(inst)
    const first = beginTargetLoad(form)
    const firstCommits = beginCommitsLoad(form)
    changeRedeployTarget(form, inst, true)
    expect(form).toMatchObject({ deployStaging: true, selectedBranch: 'stage', targetSource: null, skippedSteps: [] })
    const second = beginTargetLoad(form)
    applyBranches(form, ['main'], first)
    applyBranchesError(form, first)
    expect(form.branches).toEqual([])
    expect(form.listError).toBe(false)
    applyTargetSource(form, { available: true } as never, first)
    expect(form.targetSource).toBeNull()
    applyCommits(form, { commits: [{ hash: 'old' }], total: 1 }, firstCommits)
    expect(form.commitTotal).toBe(0)
    applyBranches(form, ['stage', 'dev'], second)
    expect(form.branches).toEqual(['stage', 'dev'])
    applyTargetSource(form, { available: true } as never, second)
    expect(form.targetSource).toEqual({ available: true })
  })

  it('a stale git status does not reset the strategy or the tree state of the current target', () => {
    const form = createRedeployForm(instance())
    const first = beginCommitsLoad(form)
    applyTargetStatus(form, { drift_status: 'dirty' }, first + 5)
    expect(form.treeDirty).toBe(false)
    applyTargetStatusError(form, first + 5)
    expect(form.treeDirty).toBe(false)
  })

  it('maps API failures: dirty tree code, 409 in progress, 422 messages', () => {
    expect(mapRedeployError({ response: { status: 409, data: { error_code: 'git_working_tree_dirty' } } })).toEqual({ kind: 'dirty' })
    expect(mapRedeployError({ response: { status: 409, data: { message: 'Busy' } } })).toEqual({ kind: 'alert', inProgress: true, message: 'Busy' })
    expect(mapRedeployError({ response: { status: 422, data: { errors: { branch: ['Invalid branch.'] } } } }))
      .toEqual({ kind: 'alert', inProgress: false, message: 'Invalid branch.' })
    expect(mapRedeployError(new Error('x'))).toMatchObject({ kind: 'alert', inProgress: false })
  })

  it('reopens the strategy choice after a dirty failure', () => {
    const form = createRedeployForm(instance())
    form.submitting = true
    form.conflictStrategy = 'force'
    applyDirtyFailure(form)
    expect(form).toMatchObject({ treeDirty: true, conflictStrategy: null, submitting: false })
  })

  it('widens the dialog for the logs phase', () => {
    expect(redeployDialogWidth('form')).toBe('560px')
    expect(redeployDialogWidth('logs')).toBe('680px')
  })
})

describe('logs phase of the redeploy modal', () => {
  it('canCloseRedeploy: the form is locked while submitting, the logs until a terminal status', () => {
    expect(canCloseRedeploy('form', false, false)).toBe(true)
    expect(canCloseRedeploy('form', true, false)).toBe(false)
    expect(canCloseRedeploy('logs', true, false)).toBe(false)
    expect(canCloseRedeploy('logs', true, true)).toBe(true)
  })

  it('isRedeployPersistent: submitting or the logs phase', () => {
    expect(isRedeployPersistent('form', false)).toBe(false)
    expect(isRedeployPersistent('form', true)).toBe(true)
    expect(isRedeployPersistent('logs', false)).toBe(true)
  })

  it('isRedeployTargetEvent: numeric id match, no target means no match', () => {
    expect(isRedeployTargetEvent({ id: '5' }, 5)).toBe(true)
    expect(isRedeployTargetEvent({ id: 6 }, 5)).toBe(false)
    expect(isRedeployTargetEvent({ id: 5 }, null)).toBe(false)
    expect(isRedeployTargetEvent(undefined, 5)).toBe(false)
  })
})
