import type { GitActionDeps } from './git-actions'
import { describe, expect, it, vi } from 'vitest'
import {
  buildBranchModal,
  buildDisconnectModal,
  buildPullDirtyModal,
  buildPushFirstModal,
  buildTokenModal,
  gitErrorReaction,
  runChangeBranch,
  runCheckUpdates,
  runDisconnect,
  runIgnoreDrift,
  runPull,
  runPush,
  runRepair,
  runRevert,
  runSetAutoDeploy,
  runUpdateCredentials,
} from './git-actions'

function makeDeps (overrides: Partial<GitActionDeps> = {}): GitActionDeps {
  return {
    disconnectGit: vi.fn().mockResolvedValue(undefined),
    updateGitCredentials: vi.fn().mockResolvedValue({ connected: true, repo_url: 'https://example.test/new.git' }),
    fetchGitStatus: vi.fn().mockResolvedValue(undefined),
    refreshGitStatus: vi.fn().mockResolvedValue(undefined),
    fetchGitLogs: vi.fn().mockResolvedValue(undefined),
    changeBranch: vi.fn().mockResolvedValue(undefined),
    setAutoDeploy: vi.fn().mockResolvedValue({ connected: true, auto_deploy_enabled: true }),
    pullGit: vi.fn().mockResolvedValue(undefined),
    pushGit: vi.fn().mockResolvedValue(false),
    revertGit: vi.fn().mockResolvedValue(undefined),
    ignoreGitDrift: vi.fn().mockResolvedValue(undefined),
    repairGit: vi.fn().mockResolvedValue(undefined),
    closeModal: vi.fn(),
    addSuccessAlert: vi.fn(),
    addErrorAlert: vi.fn(),
    getErrorMessage: (error: unknown) => (error as { message: string }).message,
    setSubmitting: vi.fn(),
    t: (key: string) => key,
    ...overrides,
  }
}

describe('buildDisconnectModal', () => {
  it('builds the warning dialog with a red confirm button and the cancel button', () => {
    const modal = buildDisconnectModal((key: string) => key)

    expect(modal.type).toBe('git-disconnect')
    expect(modal.props.title).toBe('heading.instance.advanced.git.disconnect.title')
    expect(modal.props.message).toBe('heading.instance.advanced.git.disconnect.subtitle')
    expect(modal.props.icon).toBe('$alertwarning')
    expect(modal.props.color).toBe('error')
    expect(modal.props.buttons.map(button => button.id)).toEqual(['submit', 'cancel'])
    expect(modal.props.buttons[0]).toEqual(expect.objectContaining({ label: 'heading.instance.advanced.git.disconnect.confirm', color: 'error' }))
    expect(modal.persistent).toBe(false)
    expect(modal.fields).toEqual([])
  })
})

describe('runDisconnect', () => {
  it('disconnects, refetches the status silently and shows the success toast', async () => {
    const deps = makeDeps()

    const outcome = await runDisconnect(9, deps)

    expect(outcome).toBe('disconnected')
    expect(deps.disconnectGit).toHaveBeenCalledWith(9)
    expect(deps.fetchGitStatus).toHaveBeenCalledWith({ silent: true })
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.instance.git.disconnect.success')
    expect(deps.addErrorAlert).not.toHaveBeenCalled()
  })

  it('shows the error toast and does not refetch when the request fails', async () => {
    const deps = makeDeps({ disconnectGit: vi.fn().mockRejectedValue({ message: 'Boom.' }) })

    const outcome = await runDisconnect(9, deps)

    expect(outcome).toBe('error')
    expect(deps.addErrorAlert).toHaveBeenCalledWith('Boom.')
    expect(deps.fetchGitStatus).not.toHaveBeenCalled()
    expect(deps.addSuccessAlert).not.toHaveBeenCalled()
  })
})

describe('runUpdateCredentials', () => {
  it('returns the new status from the response, toasts success and clears the busy flag', async () => {
    const deps = makeDeps()

    const status = await runUpdateCredentials(9, 'pat-1', deps)

    expect(status).toEqual({ connected: true, repo_url: 'https://example.test/new.git' })
    expect(deps.updateGitCredentials).toHaveBeenCalledWith(9, 'pat-1')
    expect(deps.setSubmitting).toHaveBeenNthCalledWith(1, 'credentials', true)
    expect(deps.setSubmitting).toHaveBeenLastCalledWith('credentials', false)
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.instance.git.credentials.success')
  })

  it('returns null and shows the error toast when the request fails', async () => {
    const deps = makeDeps({ updateGitCredentials: vi.fn().mockRejectedValue({ message: 'Bad token.' }) })

    const status = await runUpdateCredentials(9, 'pat-1', deps)

    expect(status).toBeNull()
    expect(deps.addErrorAlert).toHaveBeenCalledWith('Bad token.')
    expect(deps.addSuccessAlert).not.toHaveBeenCalled()
    expect(deps.setSubmitting).toHaveBeenLastCalledWith('credentials', false)
  })
})

describe('buildBranchModal', () => {
  // The field is a combobox: a plain select only ever sent the value picked before, so a typed branch name deployed the old branch.
  it('builds a combobox over the branches, starting with the current branch', () => {
    const modal = buildBranchModal(['main', 'develop'], 'develop', (key: string) => key)

    expect(modal.type).toBe('git-branch')
    expect(modal.props.icon).toBe('$edit')
    expect(modal.props.title).toBe('heading.instance.advanced.git.modal.branch.title')
    expect(modal.props.alert).toBe('heading.instance.advanced.git.modal.branch.warning')
    expect(modal.props.buttons.map(button => button.id)).toEqual(['submit', 'cancel'])
    expect(modal.props.buttons[0]).toEqual(expect.objectContaining({ label: 'heading.instance.advanced.git.modal.branch.confirm', color: 'primary' }))
    expect(modal.fields).toEqual([expect.objectContaining({
      type: 'combobox',
      name: 'branch',
      options: [{ label: 'main', value: 'main' }, { label: 'develop', value: 'develop' }],
    })])
    expect(modal.values).toEqual({ branch: 'develop' })
  })

  it('falls back to a text field when the branch list is empty or was not read', () => {
    expect(buildBranchModal([], 'main', (key: string) => key).fields[0]).toEqual(expect.objectContaining({ type: 'text', name: 'branch' }))
    expect(buildBranchModal(null, null, (key: string) => key).fields[0]).toEqual(expect.objectContaining({ type: 'text', name: 'branch' }))
    expect(buildBranchModal(null, null, (key: string) => key).values).toEqual({ branch: '' })
  })

  it('requires the branch and limits it to 255 characters, with the legacy messages', () => {
    const [field] = buildBranchModal(null, null, (key: string, options?: Record<string, unknown>) => `${key}${options ? JSON.stringify(options) : ''}`).fields
    const rules = (field as { rules: Array<(value: unknown) => boolean | string> }).rules

    expect(rules[0]!('  ')).toBe('form.validation.required{"field":"heading.instance.advanced.git.modal.branch.field"}')
    expect(rules[0]!('main')).toBe(true)
    expect(rules[1]!('x'.repeat(255))).toBe(true)
    expect(rules[1]!('x'.repeat(256))).toBe('form.validation.maxLength{"field":"heading.instance.advanced.git.modal.branch.field","length":255}')
    expect(rules[1]!('')).toBe(true)
  })
})

describe('buildTokenModal', () => {
  it('builds the token dialog with one empty password field', () => {
    const modal = buildTokenModal((key: string) => key)

    expect(modal.type).toBe('git-token')
    expect(modal.props.title).toBe('heading.instance.advanced.git.modal.token.title')
    expect(modal.props.message).toBe('heading.instance.advanced.git.modal.token.message')
    expect(modal.props.buttons.map(button => button.id)).toEqual(['submit', 'cancel'])
    expect(modal.props.buttons[0]).toEqual(expect.objectContaining({ label: 'heading.instance.advanced.git.modal.token.confirm', color: 'primary' }))
    expect(modal.fields).toEqual([expect.objectContaining({ type: 'password', name: 'token', label: 'heading.instance.advanced.git.connection.tokenLabel' })])
    expect(modal.values).toEqual({ token: '' })
  })

  it('requires a token that is not only spaces', () => {
    const [field] = buildTokenModal((key: string, options?: Record<string, unknown>) => `${key}${options ? JSON.stringify(options) : ''}`).fields
    const rules = (field as { rules: Array<(value: unknown) => boolean | string> }).rules

    expect(rules[0]!('  ')).toBe('form.validation.required{"field":"heading.instance.advanced.git.connection.tokenLabel"}')
    expect(rules[0]!('ghp_token')).toBe(true)
  })
})

describe('runChangeBranch', () => {
  it('trims the branch, closes the dialog, refetches the status and the logs, then toasts success', async () => {
    const order: string[] = []
    const deps = makeDeps({
      changeBranch: vi.fn(async () => {
        order.push('change')
      }),
      closeModal: vi.fn(() => {
        order.push('close')
      }),
      refreshGitStatus: vi.fn(async () => {
        order.push('refresh')
      }),
      fetchGitLogs: vi.fn(async () => {
        order.push('logs')
      }),
    })

    const outcome = await runChangeBranch(9, { branch: '  feature/x  ' }, deps)

    expect(outcome).toBe('done')
    expect(deps.changeBranch).toHaveBeenCalledWith(9, 'feature/x')
    expect(order).toEqual(['change', 'close', 'refresh', 'logs'])
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.instance.git.branch.success')
  })

  it('answers a dirty tree with `dirty` (the Revert/Force dialog), not an error toast', async () => {
    const deps = makeDeps({ changeBranch: vi.fn().mockRejectedValue(gitError('git_working_tree_dirty')) })

    const outcome = await runChangeBranch(9, { branch: 'main' }, deps)

    expect(outcome).toBe('dirty')
    expect(deps.closeModal).not.toHaveBeenCalled()
    expect(deps.refreshGitStatus).not.toHaveBeenCalled()
    expect(deps.addErrorAlert).not.toHaveBeenCalled()
    expect(deps.addSuccessAlert).not.toHaveBeenCalled()
  })

  it('shows the error toast and keeps the dialog open when the request fails', async () => {
    const deps = makeDeps({ changeBranch: vi.fn().mockRejectedValue({ message: 'Nope.' }) })

    const outcome = await runChangeBranch(9, { branch: 'main' }, deps)

    expect(outcome).toBe('failed')
    expect(deps.closeModal).not.toHaveBeenCalled()
    expect(deps.refreshGitStatus).not.toHaveBeenCalled()
    expect(deps.addErrorAlert).toHaveBeenCalledWith('Nope.')
  })

  it('sends nothing for a blank branch', async () => {
    const deps = makeDeps()

    const outcome = await runChangeBranch(9, { branch: ' '.repeat(3) }, deps)

    expect(outcome).toBe('failed')
    expect(deps.changeBranch).not.toHaveBeenCalled()
  })
})

describe('runCheckUpdates', () => {
  it('only reads the status again, toasts success and clears the busy flag', async () => {
    const deps = makeDeps()

    await runCheckUpdates(deps)

    expect(deps.refreshGitStatus).toHaveBeenCalledTimes(1)
    expect(deps.fetchGitLogs).not.toHaveBeenCalled()
    expect(deps.setSubmitting).toHaveBeenNthCalledWith(1, 'check', true)
    expect(deps.setSubmitting).toHaveBeenLastCalledWith('check', false)
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.instance.git.check.success')
  })

  it('shows the error toast and clears the busy flag when the read fails', async () => {
    const deps = makeDeps({ refreshGitStatus: vi.fn().mockRejectedValue({ message: 'Down.' }) })

    await runCheckUpdates(deps)

    expect(deps.addErrorAlert).toHaveBeenCalledWith('Down.')
    expect(deps.setSubmitting).toHaveBeenLastCalledWith('check', false)
  })
})

describe('runSetAutoDeploy', () => {
  it('returns the status from the response and toasts success', async () => {
    const deps = makeDeps()

    const status = await runSetAutoDeploy(9, true, deps)

    expect(status).toEqual({ connected: true, auto_deploy_enabled: true })
    expect(deps.setAutoDeploy).toHaveBeenCalledWith(9, true)
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.instance.git.autoDeploy.success')
    expect(deps.setSubmitting).toHaveBeenLastCalledWith('autoDeploy', false)
  })

  it('refetches the status silently and shows the error toast when the request fails', async () => {
    const deps = makeDeps({ setAutoDeploy: vi.fn().mockRejectedValue({ message: 'Denied.' }) })

    const status = await runSetAutoDeploy(9, true, deps)

    expect(status).toBeNull()
    expect(deps.fetchGitStatus).toHaveBeenCalledWith({ silent: true })
    expect(deps.addErrorAlert).toHaveBeenCalledWith('Denied.')
    expect(deps.setSubmitting).toHaveBeenLastCalledWith('autoDeploy', false)
  })
})

// Errors as the API sends them: the git error code sits in `response.data.error_code`.
function gitError (code: string, message = 'Git said no.') {
  return { message, response: { data: { error_code: code, message } } }
}

const identity = (key: string) => key

describe('gitErrorReaction', () => {
  it.each([
    ['git_working_tree_dirty', 'dirty'],
    ['git_remote_branch_missing', 'push-first'],
    ['git_invalid_token', 'refresh'],
    ['git_access_denied', 'refresh'],
    ['git_something_else', 'toast'],
    [undefined, 'toast'],
  ] as const)('maps %s to %s', (code, reaction) => {
    expect(gitErrorReaction(code)).toBe(reaction)
  })
})

describe('buildPullDirtyModal', () => {
  it('builds the active-loading dialog with Revert, Force, Push first and Cancel', () => {
    const modal = buildPullDirtyModal({ commits_behind: 0 }, identity)

    expect(modal.type).toBe('git-pull-dirty')
    expect(modal.props.loadingMode).toBe('active')
    expect(modal.props.icon).toBe('$alertwarning')
    expect(modal.props.buttons.map(button => button.id)).toEqual(['revert', 'force', 'push_first', 'cancel'])
    expect(modal.props.buttons[0]).toEqual(expect.objectContaining({ label: 'heading.instance.advanced.git.drift.revert', color: 'error' }))
  })

  it('adds the push-first hint to its label only when the remote is ahead', () => {
    const behind = buildPullDirtyModal({ commits_behind: 2 }, identity)
    const level = buildPullDirtyModal({ commits_behind: 0 }, identity)

    expect(behind.props.buttons[2]!.label).toBe('heading.instance.advanced.git.pullDirtyTree.pushFirst — heading.instance.advanced.git.pullDirtyTree.pushFirstHint')
    expect(level.props.buttons[2]!.label).toBe('heading.instance.advanced.git.pullDirtyTree.pushFirst')
  })
})

describe('buildPushFirstModal', () => {
  it('builds the confirm dialog with a confirm button and Cancel', () => {
    const modal = buildPushFirstModal(identity)

    expect(modal.type).toBe('git-push-first')
    expect(modal.props.buttons.map(button => button.id)).toEqual(['submit', 'cancel'])
    expect(modal.props.loadingMode).toBeUndefined()
  })
})

describe('runPull', () => {
  it('pulls without a strategy, closes the dialog, refetches and shows the success toast', async () => {
    const deps = makeDeps()

    const outcome = await runPull(9, undefined, deps)

    expect(outcome).toBe('done')
    expect(deps.pullGit).toHaveBeenCalledWith(9, undefined)
    expect(deps.closeModal).toHaveBeenCalled()
    expect(deps.refreshGitStatus).toHaveBeenCalled()
    expect(deps.fetchGitLogs).toHaveBeenCalled()
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.instance.git.pull.success')
    expect(deps.setSubmitting).toHaveBeenNthCalledWith(1, 'pull', true)
    expect(deps.setSubmitting).toHaveBeenLastCalledWith('pull', false)
  })

  it('sends the force and push-first strategies to the request', async () => {
    const deps = makeDeps()

    await runPull(9, 'force', deps)
    await runPull(9, 'push_first', deps)

    expect(vi.mocked(deps.pullGit).mock.calls).toEqual([[9, 'force'], [9, 'push_first']])
  })

  it('returns dirty for a dirty tree without a strategy, with no toast', async () => {
    const deps = makeDeps({ pullGit: vi.fn().mockRejectedValue(gitError('git_working_tree_dirty')) })

    const outcome = await runPull(9, undefined, deps)

    expect(outcome).toBe('dirty')
    expect(deps.addErrorAlert).not.toHaveBeenCalled()
    expect(deps.setSubmitting).toHaveBeenLastCalledWith('pull', false)
  })

  it('shows the error toast for a dirty tree when a strategy was sent', async () => {
    const deps = makeDeps({ pullGit: vi.fn().mockRejectedValue(gitError('git_working_tree_dirty', 'Dirty.')) })

    const outcome = await runPull(9, 'force', deps)

    expect(outcome).toBe('failed')
    expect(deps.addErrorAlert).toHaveBeenCalledWith('Dirty.')
  })

  it('returns push-first for a missing remote branch, with no toast', async () => {
    const deps = makeDeps({ pullGit: vi.fn().mockRejectedValue(gitError('git_remote_branch_missing')) })

    const outcome = await runPull(9, undefined, deps)

    expect(outcome).toBe('push-first')
    expect(deps.addErrorAlert).not.toHaveBeenCalled()
  })

  it('refetches the status on a token error, then shows the error toast', async () => {
    const deps = makeDeps({ pullGit: vi.fn().mockRejectedValue(gitError('git_invalid_token', 'Token.')) })

    const outcome = await runPull(9, undefined, deps)

    expect(outcome).toBe('failed')
    expect(deps.refreshGitStatus).toHaveBeenCalled()
    expect(deps.addErrorAlert).toHaveBeenCalledWith('Token.')
  })

  it('shows the error toast only for any other error', async () => {
    const deps = makeDeps({ pullGit: vi.fn().mockRejectedValue(gitError('git_other', 'Other.')) })

    await runPull(9, undefined, deps)

    expect(deps.refreshGitStatus).not.toHaveBeenCalled()
    expect(deps.addErrorAlert).toHaveBeenCalledWith('Other.')
  })
})

describe('runRevert', () => {
  it('reverts, refetches and shows the success toast', async () => {
    const deps = makeDeps()

    expect(await runRevert(9, deps)).toBe(true)
    expect(deps.revertGit).toHaveBeenCalledWith(9)
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.instance.git.revert.success')
  })

  it('returns false and shows the error toast when the revert fails', async () => {
    const deps = makeDeps({ revertGit: vi.fn().mockRejectedValue({ message: 'No.' }) })

    expect(await runRevert(9, deps)).toBe(false)
    expect(deps.addErrorAlert).toHaveBeenCalledWith('No.')
    expect(deps.setSubmitting).toHaveBeenLastCalledWith('revert', false)
  })
})

describe('runPush', () => {
  it('sends nothing while the remote is ahead of the site and shows the pull-first hint', async () => {
    const deps = makeDeps()

    const outcome = await runPush(9, { commits_behind: 1, commits_ahead: 0 }, deps)

    expect(outcome).toBe('blocked')
    expect(deps.pushGit).not.toHaveBeenCalled()
    expect(deps.addErrorAlert).toHaveBeenCalledWith('heading.instance.advanced.git.push.pullFirstHint')
  })

  it('pushes, refetches and shows the success toast', async () => {
    const deps = makeDeps()

    expect(await runPush(9, { commits_behind: 0, commits_ahead: 1 }, deps)).toBe('done')
    expect(deps.pushGit).toHaveBeenCalledWith(9)
    expect(deps.refreshGitStatus).toHaveBeenCalled()
    expect(deps.fetchGitLogs).toHaveBeenCalled()
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.instance.git.push.success')
  })

  it('shows the nothing-to-push toast when the server reports nothing to push', async () => {
    const deps = makeDeps({ pushGit: vi.fn().mockResolvedValue(true) })

    await runPush(9, { commits_behind: 0, commits_ahead: 0 }, deps)

    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.instance.git.push.nothing')
  })

  it('refetches the status on a token error before the error toast', async () => {
    const deps = makeDeps({ pushGit: vi.fn().mockRejectedValue(gitError('git_access_denied', 'Denied.')) })

    expect(await runPush(9, { commits_behind: 0, commits_ahead: 0 }, deps)).toBe('failed')
    expect(deps.refreshGitStatus).toHaveBeenCalled()
    expect(deps.addErrorAlert).toHaveBeenCalledWith('Denied.')
  })
})

describe('a failed refetch after a successful mutation', () => {
  it('does not turn the success into an error toast (branch, pull, revert, push)', async () => {
    const failingRefetch = () => makeDeps({
      refreshGitStatus: vi.fn().mockRejectedValue({ message: 'Refetch failed.' }),
      fetchGitLogs: vi.fn().mockRejectedValue({ message: 'Logs failed.' }),
    })

    const branch = failingRefetch()
    await runChangeBranch(9, { branch: 'main' }, branch)
    expect(branch.addSuccessAlert).toHaveBeenCalledWith('notification.instance.git.branch.success')
    expect(branch.addErrorAlert).not.toHaveBeenCalled()

    const pull = failingRefetch()
    expect(await runPull(9, undefined, pull)).toBe('done')
    expect(pull.addSuccessAlert).toHaveBeenCalledWith('notification.instance.git.pull.success')
    expect(pull.addErrorAlert).not.toHaveBeenCalled()

    const revert = failingRefetch()
    expect(await runRevert(9, revert)).toBe(true)
    expect(revert.addSuccessAlert).toHaveBeenCalledWith('notification.instance.git.revert.success')
    expect(revert.addErrorAlert).not.toHaveBeenCalled()

    const push = failingRefetch()
    expect(await runPush(9, { commits_behind: 0, commits_ahead: 1 }, push)).toBe('done')
    expect(push.addSuccessAlert).toHaveBeenCalledWith('notification.instance.git.push.success')
    expect(push.addErrorAlert).not.toHaveBeenCalled()
    expect(push.setSubmitting).toHaveBeenLastCalledWith('push', false)
  })
})

describe('runIgnoreDrift', () => {
  it('ignores the drift, reads the status silently and shows the success toast', async () => {
    const deps = makeDeps()

    await runIgnoreDrift(9, deps)

    expect(deps.ignoreGitDrift).toHaveBeenCalledWith(9)
    expect(deps.fetchGitStatus).toHaveBeenCalledWith({ silent: true })
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.instance.git.drift.ignore.success')
    expect(deps.setSubmitting).toHaveBeenNthCalledWith(1, 'ignoreDrift', true)
    expect(deps.setSubmitting).toHaveBeenLastCalledWith('ignoreDrift', false)
  })

  it('shows the error toast and does not read the status when the request fails', async () => {
    const deps = makeDeps({ ignoreGitDrift: vi.fn().mockRejectedValue({ message: 'Boom.' }) })

    await runIgnoreDrift(9, deps)

    expect(deps.addErrorAlert).toHaveBeenCalledWith('Boom.')
    expect(deps.fetchGitStatus).not.toHaveBeenCalled()
    expect(deps.setSubmitting).toHaveBeenLastCalledWith('ignoreDrift', false)
  })
})

describe('runRepair', () => {
  it('repairs, reads the status again and shows the success toast', async () => {
    const deps = makeDeps()

    await runRepair(9, deps)

    expect(deps.repairGit).toHaveBeenCalledWith(9)
    expect(deps.refreshGitStatus).toHaveBeenCalled()
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.instance.git.repair.success')
    expect(deps.setSubmitting).toHaveBeenLastCalledWith('repair', false)
  })

  it('reads the status again on git_local_repository_exists, then shows the error toast', async () => {
    const deps = makeDeps({ repairGit: vi.fn().mockRejectedValue(gitError('git_local_repository_exists', 'Already here.')) })

    await runRepair(9, deps)

    expect(deps.refreshGitStatus).toHaveBeenCalledTimes(1)
    expect(deps.addErrorAlert).toHaveBeenCalledWith('Already here.')
    expect(deps.setSubmitting).toHaveBeenLastCalledWith('repair', false)
  })

  it('shows only the error toast for any other error', async () => {
    const deps = makeDeps({ repairGit: vi.fn().mockRejectedValue(gitError('git_repair_failed', 'Nope.')) })

    await runRepair(9, deps)

    expect(deps.refreshGitStatus).not.toHaveBeenCalled()
    expect(deps.addErrorAlert).toHaveBeenCalledWith('Nope.')
  })
})
