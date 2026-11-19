import type { InstanceResource } from '@/entities/project/instance-resource'
import { describe, expect, it } from 'vitest'
import { canReuseConnection, connectFieldErrors, connectFieldRefusal, connectionHealthMessageKey, connectPayload, connectReplacesSiteFiles, connectSyncFailure, gitActionDisabled, gitPair, gitSyncActionDisabled, hasAccessToken, hasErrorTooltip, hasLastCommit, isAutoDeployInProgress, isConnectionHealthError, isDiverged, isHostingUnsupported, isSameBranchAsPair, isSshConnect, lastCommitDeployedAt, logActionLabel, logBranchChange, logCommitSummary, logErrorTooltip, logStatusColor, logStatusLabel, setupBannerAction, shortHash, showAccessTokenCard, showConnectedDeployKey, showDeployKeyCard, showDriftBanner, showSetupBanner, toRepositoryHref } from './git-status'

function pairInstance (id: number, connected: boolean): InstanceResource {
  return { id, git_repository: { connected } } as unknown as InstanceResource
}

function instanceWith (parent: InstanceResource | null, stagings: InstanceResource[]) {
  return { parentInstance: parent, subInstances: stagings } as unknown as Pick<InstanceResource, 'parentInstance' | 'subInstances'>
}

describe('gitPair', () => {
  it('prefers the parent instance over the stagings', () => {
    const parent = pairInstance(1, true)
    const staging = pairInstance(9, true)

    expect(gitPair(instanceWith(parent, [staging]))).toBe(parent)
  })

  it('picks the staging with the highest id, whatever the input order', () => {
    const stagings = [pairInstance(4, false), pairInstance(12, true), pairInstance(7, false)]

    expect(gitPair(instanceWith(null, stagings))?.id).toBe(12)
    expect(gitPair(instanceWith(null, [stagings[2]!, stagings[0]!, stagings[1]!]))?.id).toBe(12)
  })

  it('does not reorder the staging list it reads', () => {
    const stagings = [pairInstance(4, false), pairInstance(12, true), pairInstance(7, false)]

    gitPair(instanceWith(null, stagings))

    expect(stagings.map(item => item.id)).toEqual([4, 12, 7])
  })

  it('returns null without a parent and without stagings', () => {
    expect(gitPair(instanceWith(null, []))).toBeNull()
  })
})

describe('canReuseConnection', () => {
  it('is true when the pair has a connected repository', () => {
    expect(canReuseConnection(instanceWith(pairInstance(1, true), []))).toBe(true)
  })

  it('is false when the pair is not connected or there is no pair', () => {
    expect(canReuseConnection(instanceWith(pairInstance(1, false), []))).toBe(false)
    expect(canReuseConnection(instanceWith(null, []))).toBe(false)
  })
})

describe('shortHash', () => {
  it('keeps a hash of 10 characters or fewer as it is', () => {
    expect(shortHash('abcdef1234')).toBe('abcdef1234')
  })

  it('shortens a longer hash to 7 characters, an ellipsis and the last 3', () => {
    expect(shortHash('0123456789abcdef')).toBe('0123456…def')
  })

  it('trims the input and returns an empty string for a missing hash', () => {
    expect(shortHash('  abc  ')).toBe('abc')
    expect(shortHash(null)).toBe('')
    expect(shortHash(' '.repeat(3))).toBe('')
  })
})

describe('toRepositoryHref', () => {
  it('drops the .git suffix of an https URL', () => {
    expect(toRepositoryHref('https://example.test/acme/shop.git')).toBe('https://example.test/acme/shop')
  })

  it('keeps an https URL without the suffix', () => {
    expect(toRepositoryHref('https://example.test/acme/shop')).toBe('https://example.test/acme/shop')
  })

  it('turns an scp-like git@ URL into https', () => {
    expect(toRepositoryHref('git@example.test:acme/shop.git')).toBe('https://example.test/acme/shop')
  })

  it('turns an ssh:// git@ URL into https', () => {
    expect(toRepositoryHref('ssh://git@example.test/acme/shop.git')).toBe('https://example.test/acme/shop')
  })

  it('returns null for an unknown or empty URL', () => {
    expect(toRepositoryHref('file:///srv/repo')).toBeNull()
    expect(toRepositoryHref(' '.repeat(3))).toBeNull()
    expect(toRepositoryHref(null)).toBeNull()
  })
})

describe('isHostingUnsupported', () => {
  function error (message: string) {
    return { response: { status: 422, data: { message } } }
  }

  it('matches the English "not supported" text of the error', () => {
    expect(isHostingUnsupported(error('Git is not supported on this hosting.'))).toBe(true)
  })

  it('does not match other errors', () => {
    expect(isHostingUnsupported(error('Too many attempts.'))).toBe(false)
    expect(isHostingUnsupported(new Error('Network Error'))).toBe(false)
  })
})

describe('connectFieldErrors', () => {
  // Echoes the key and the field name, so a test can tell which required message was raised.
  const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}|${String(options.field)}` : key)

  const manual = { connected: false, reuse: false, repoUrl: 'https://example.test/acme/shop.git', isPrivate: false, patToken: '', branch: '' }
  const ssh = { ...manual, repoUrl: 'git@example.test:acme/shop.git' }

  it('reports an empty URL as required', () => {
    expect(connectFieldErrors({ ...manual, repoUrl: '' }, t).repoUrl).toEqual([
      'form.validation.required|heading.instance.advanced.git.connect.repoUrl',
    ])
  })

  it('treats a URL of spaces only as empty', () => {
    expect(connectFieldErrors({ ...manual, repoUrl: ' '.repeat(3) }, t).repoUrl).toHaveLength(1)
  })

  it('accepts a public repository without a token', () => {
    expect(connectFieldErrors(manual, t)).toEqual({ repoUrl: [], patToken: [], branch: [] })
  })

  it('requires a token for a private repository', () => {
    expect(connectFieldErrors({ ...manual, isPrivate: true, patToken: '  ' }, t).patToken).toEqual([
      'form.validation.required|heading.instance.advanced.git.connect.token',
    ])
  })

  it('accepts a private repository with a token', () => {
    expect(connectFieldErrors({ ...manual, isPrivate: true, patToken: 'ghp_x' }, t).patToken).toEqual([])
  })

  it('has no errors in reuse mode, even with an empty form', () => {
    expect(connectFieldErrors({ ...manual, reuse: true, repoUrl: '', isPrivate: true, patToken: '' }, t)).toEqual({ repoUrl: [], patToken: [], branch: [] })
  })

  it('requires only the branch for an SSH address', () => {
    expect(connectFieldErrors({ ...ssh, branch: ' '.repeat(3) }, t)).toEqual({
      repoUrl: [],
      patToken: [],
      branch: ['form.validation.required|heading.onboarding.gitDeploy.branch.label'],
    })
  })

  it('accepts an SSH address with a branch, even when it is private', () => {
    expect(connectFieldErrors({ ...ssh, isPrivate: true, patToken: '', branch: ' main ' }, t)).toEqual({ repoUrl: [], patToken: [], branch: [] })
  })

  it('does not apply the SSH rules to a connected page or to reuse', () => {
    expect(connectFieldErrors({ ...ssh, connected: true, branch: '' }, t).repoUrl).toEqual([])
    expect(connectFieldErrors({ ...ssh, reuse: true, branch: '' }, t).branch).toEqual([])
  })
})

describe('connectFieldRefusal', () => {
  const rejected = (status: number, data: Record<string, unknown>) => ({ response: { status, data } })

  it('puts the refusal on the field the errors bag names', () => {
    const refused = rejected(422, { errors: { token: ['The repository refused this token.'] } })
    expect(connectFieldRefusal(refused)).toEqual({ repoUrl: [], patToken: ['The repository refused this token.'], branch: [] })

    const notFound = rejected(422, { errors: { repo_url: ['The repository was not found.'] } })
    expect(connectFieldRefusal(notFound)?.repoUrl).toEqual(['The repository was not found.'])
  })

  it('shows the Engine\'s own keys of the same two fields in the same place', () => {
    const truncated = rejected(422, { errors: { git_token: ['This starts like a GitHub token but is 39 characters.'] } })
    expect(connectFieldRefusal(truncated)?.patToken).toEqual(['This starts like a GitHub token but is 39 characters.'])

    const unreadable = rejected(422, { errors: { source: ['The repository could not be read.'] } })
    expect(connectFieldRefusal(unreadable)?.repoUrl).toEqual(['The repository could not be read.'])
  })

  it('puts the panel\'s refusal of the address under the URL field', () => {
    const refused = rejected(422, { errors: { host: ['The host cannot be reached from the panel.'] } })
    expect(connectFieldRefusal(refused)).toEqual({ repoUrl: ['The host cannot be reached from the panel.'], patToken: [], branch: [] })
  })

  it('keeps every message of a field, and both fields of one answer', () => {
    const both = rejected(422, { errors: { token: ['The repository refused this token.', 'Save a token with read access.'], repo_url: ['The repository was not found.'] } })
    expect(connectFieldRefusal(both)).toEqual({
      repoUrl: ['The repository was not found.'],
      patToken: ['The repository refused this token.', 'Save a token with read access.'],
      branch: [],
    })
  })

  it('answers null when no key has a field, so the alert keeps the message', () => {
    expect(connectFieldRefusal(rejected(422, { message: 'Bad token.' }))).toBeNull()
    expect(connectFieldRefusal(rejected(422, { errors: { branch: ['Enter the branch to deploy.'] } }))).toBeNull()
    expect(connectFieldRefusal(rejected(422, { errors: { token: [] } }))).toBeNull()
    expect(connectFieldRefusal(rejected(500, { errors: { token: ['Boom.'] } }))).toBeNull()
    expect(connectFieldRefusal({ response: { status: 422, data: null } })).toBeNull()
    expect(connectFieldRefusal(new Error('Network Error'))).toBeNull()
  })
})

describe('isSshConnect', () => {
  it('is true for an SSH address on a page that is not connected and not reusing', () => {
    expect(isSshConnect({ connected: false, reuse: false, repoUrl: '  git@github.com:o/r.git ' })).toBe(true)
    expect(isSshConnect({ connected: false, reuse: false, repoUrl: 'ssh://git@example.com/o/r' })).toBe(true)
  })

  it('is false for HTTPS, an empty URL, a connected page or reuse', () => {
    expect(isSshConnect({ connected: false, reuse: false, repoUrl: 'https://github.com/o/r.git' })).toBe(false)
    expect(isSshConnect({ connected: false, reuse: false, repoUrl: '' })).toBe(false)
    expect(isSshConnect({ connected: true, reuse: false, repoUrl: 'git@github.com:o/r.git' })).toBe(false)
    expect(isSshConnect({ connected: false, reuse: true, repoUrl: 'git@github.com:o/r.git' })).toBe(false)
  })
})

describe('showConnectedDeployKey', () => {
  const connectedSsh = { connected: true, repo_url: 'git@github.com:o/r.git' }

  it('shows the key card for a connected SSH repository when git can be managed', () => {
    expect(showConnectedDeployKey(connectedSsh, true)).toBe(true)
  })

  it('hides it without the git privilege, for HTTPS, or when not connected', () => {
    expect(showConnectedDeployKey(connectedSsh, false)).toBe(false)
    expect(showConnectedDeployKey({ connected: true, repo_url: 'https://github.com/o/r' }, true)).toBe(false)
    expect(showConnectedDeployKey({ connected: false, repo_url: 'git@github.com:o/r.git' }, true)).toBe(false)
  })
})

describe('showDeployKeyCard', () => {
  const connectedSsh = { connected: true, repo_url: 'git@github.com:o/r.git' }
  const connectedHttps = { connected: true, repo_url: 'https://github.com/o/r' }
  const notConnected = { connected: false, repo_url: null }

  it('shows the card for a connected SSH repository, as before', () => {
    expect(showDeployKeyCard(connectedSsh, true, false)).toBe(true)
    expect(showDeployKeyCard(connectedSsh, true, true)).toBe(true)
  })

  it('shows the card whenever the read answered a key, whatever the repository state', () => {
    expect(showDeployKeyCard(notConnected, true, true)).toBe(true)
    expect(showDeployKeyCard({ connected: false, repo_url: 'git@github.com:o/r.git' }, true, true)).toBe(true)
    expect(showDeployKeyCard(connectedHttps, true, true)).toBe(true)
  })

  it('hides it without a key or without the git privilege', () => {
    expect(showDeployKeyCard(notConnected, true, false)).toBe(false)
    expect(showDeployKeyCard(connectedHttps, true, false)).toBe(false)
    expect(showDeployKeyCard(connectedSsh, false, false)).toBe(false)
    expect(showDeployKeyCard(notConnected, false, true)).toBe(false)
  })
})

describe('showAccessTokenCard', () => {
  it('shows the card for a connected HTTPS repository', () => {
    expect(showAccessTokenCard({ connected: true, repo_url: 'https://github.com/o/r' })).toBe(true)
  })

  it('hides it for SSH, without an address, or when not connected', () => {
    expect(showAccessTokenCard({ connected: true, repo_url: 'git@github.com:o/r.git' })).toBe(false)
    expect(showAccessTokenCard({ connected: true, repo_url: null })).toBe(false)
    expect(showAccessTokenCard({ connected: false, repo_url: 'https://github.com/o/r' })).toBe(false)
  })
})

describe('hasAccessToken', () => {
  it('is true only for a saved token', () => {
    expect(hasAccessToken({ auth_type: 'pat' })).toBe(true)
    expect(hasAccessToken({ auth_type: null })).toBe(false)
    expect(hasAccessToken({})).toBe(false)
  })
})

describe('connectPayload', () => {
  const pair = { id: 4, git_repository: { id: 77, connected: true } } as unknown as InstanceResource
  const manual = { connected: false, reuse: false, repoUrl: '', isPrivate: false, patToken: '', branch: '' }

  it('sends the pair repository id in reuse mode', () => {
    expect(connectPayload({ ...manual, reuse: true }, pair)).toEqual({ git_repository_id: 77 })
  })

  it('sends the trimmed URL with auth_type null and token null for a public repository', () => {
    expect(connectPayload({ ...manual, repoUrl: '  https://example.test/acme/shop.git ', patToken: 'ignored' }, null)).toEqual({
      repo_url: 'https://example.test/acme/shop.git',
      auth_type: null,
      token: null,
    })
  })

  it('sends the PAT for a private repository', () => {
    expect(connectPayload({ ...manual, repoUrl: 'https://example.test/acme/shop.git', isPrivate: true, patToken: ' ghp_x ' }, pair)).toEqual({
      repo_url: 'https://example.test/acme/shop.git',
      auth_type: 'pat',
      token: 'ghp_x',
    })
  })

  it('sends the trimmed URL and branch, without a PAT, for an SSH address', () => {
    expect(connectPayload({ ...manual, repoUrl: ' git@example.test:acme/shop.git ', isPrivate: true, patToken: 'ghp_x', branch: ' main ' }, null)).toEqual({
      repo_url: 'git@example.test:acme/shop.git',
      branch: 'main',
    })
  })
})

describe('connectReplacesSiteFiles', () => {
  it('is true for a site without a checkout: the Engine resets it to the branch', () => {
    expect(connectReplacesSiteFiles({ connected: false, local_repository_exists: null, managed_by: null })).toBe(true)
    expect(connectReplacesSiteFiles({ connected: false })).toBe(true)
  })

  it('is false for a site that already has a checkout: the Engine leaves its files', () => {
    expect(connectReplacesSiteFiles({ connected: false, local_repository_exists: true, managed_by: 'site_git' })).toBe(false)
  })

  it('is false for a connected project, where a connect repairs the checkout instead of cloning', () => {
    expect(connectReplacesSiteFiles({ connected: true, local_repository_exists: false, managed_by: 'site_git' })).toBe(false)
  })

  it('is false for a deploy-managed checkout, which the Engine owns', () => {
    expect(connectReplacesSiteFiles({ connected: false, local_repository_exists: false, managed_by: 'deploy' })).toBe(false)
  })
})

describe('connectSyncFailure', () => {
  it('reads the trimmed message of a 422 that says the repository is connected', () => {
    expect(connectSyncFailure({ response: { status: 422, data: { connected: true, message: '  Sync failed.  ' } } })).toEqual({ message: 'Sync failed.' })
  })

  it('returns an empty message when the body has none', () => {
    expect(connectSyncFailure({ response: { status: 422, data: { connected: true } } })).toEqual({ message: '' })
  })

  it('returns null for a 422 without the connected flag and for other statuses', () => {
    expect(connectSyncFailure({ response: { status: 422, data: { message: 'Bad URL.' } } })).toBeNull()
    expect(connectSyncFailure({ response: { status: 500, data: { connected: true } } })).toBeNull()
    expect(connectSyncFailure(new Error('Network Error'))).toBeNull()
  })
})

describe('gitActionDisabled', () => {
  const idle = { connect: false, pull: false, push: false, revert: false, ignoreDrift: false, check: false, autoDeploy: false, credentials: false, repair: false }

  it('is false when nothing is busy', () => {
    expect(gitActionDisabled({ submitting: idle, setupBannerChecking: false })).toBe(false)
  })

  it('is true while any action, the setup check or a modal is busy', () => {
    expect(gitActionDisabled({ submitting: { ...idle, connect: true }, setupBannerChecking: false })).toBe(true)
    expect(gitActionDisabled({ submitting: idle, setupBannerChecking: true })).toBe(true)
    expect(gitActionDisabled({ submitting: idle, setupBannerChecking: false, modalSubmitting: true })).toBe(true)
  })
})

describe('connectionHealthMessageKey', () => {
  const ok = 'heading.instance.advanced.git.connection.ok'
  const unknown = 'heading.instance.advanced.git.connection.error.unknown'

  it('returns null when the pair is not connected', () => {
    expect(connectionHealthMessageKey({ connected: false, connection_health: { status: 'error', reason: 'token' } })).toBeNull()
  })

  it('returns the ok copy when the health is ok or missing', () => {
    expect(connectionHealthMessageKey({ connected: true, connection_health: { status: 'ok', reason: null } })).toBe(ok)
    expect(connectionHealthMessageKey({ connected: true, connection_health: null })).toBe(ok)
  })

  it.each([
    ['token', 'heading.instance.advanced.git.connection.error.token'],
    ['network', 'heading.instance.advanced.git.connection.error.network'],
    ['not_found', 'heading.instance.advanced.git.connection.error.not_found'],
    ['local_repo_missing', 'heading.instance.advanced.git.connection.error.localRepoMissing'],
    ['something_new', unknown],
    [null, unknown],
  ])('maps the error reason %s to its copy', (reason, key) => {
    expect(connectionHealthMessageKey({ connected: true, connection_health: { status: 'error', reason } })).toBe(key)
  })
})

describe('isConnectionHealthError', () => {
  it('is true only for an error status', () => {
    expect(isConnectionHealthError({ connection_health: { status: 'error', reason: 'token' } })).toBe(true)
    expect(isConnectionHealthError({ connection_health: { status: 'ok', reason: null } })).toBe(false)
    expect(isConnectionHealthError({ connection_health: null })).toBe(false)
  })
})

describe('logActionLabel', () => {
  const t = (key: string) => `T:${key}`
  const has = (...keys: string[]) => (key: string) => keys.includes(key)

  it('uses the logs action key first', () => {
    const key = 'heading.instance.advanced.git.logs.action.pull'
    expect(logActionLabel('Pull', t, has(key, 'heading.instance.advanced.git.pull.title'))).toBe(`T:${key}`)
  })

  it('falls back to the title of the git action', () => {
    const key = 'heading.instance.advanced.git.clone.title'
    expect(logActionLabel('clone', t, has(key))).toBe(`T:${key}`)
  })

  it('falls back to the raw action when neither key exists', () => {
    expect(logActionLabel('custom_step', t, () => false)).toBe('custom_step')
  })

  it('is empty for a blank action', () => {
    expect(logActionLabel(' '.repeat(3), t, () => true)).toBe('')
    expect(logActionLabel(null, t, () => true)).toBe('')
  })
})

describe('logStatusLabel', () => {
  const t = (key: string) => `T:${key}`

  it('translates a known status and keeps the raw one otherwise', () => {
    const key = 'heading.instance.advanced.git.logs.status.success'
    expect(logStatusLabel('success', t, key2 => key2 === key)).toBe(`T:${key}`)
    expect(logStatusLabel('weird', t, () => false)).toBe('weird')
    expect(logStatusLabel('', t, () => true)).toBe('')
  })
})

describe('hasErrorTooltip', () => {
  it('is true for a failed or skipped row with an error message', () => {
    expect(hasErrorTooltip({ status: 'failed', error_message: 'boom' })).toBe(true)
    expect(hasErrorTooltip({ status: 'skipped', error_message: 'not needed' })).toBe(true)
  })

  it('is false without a message, for another status, or for a blank message', () => {
    expect(hasErrorTooltip({ status: 'failed', error_message: null })).toBe(false)
    expect(hasErrorTooltip({ status: 'failed', error_message: ' '.repeat(3) })).toBe(false)
    expect(hasErrorTooltip({ status: 'success', error_message: 'boom' })).toBe(false)
  })

  it('returns the trimmed message as the tooltip text', () => {
    expect(logErrorTooltip({ status: 'failed', error_message: '  Clone failed  ' })).toBe('Clone failed')
  })
})

describe('logStatusColor', () => {
  it.each([
    ['success', 'success'],
    ['failed', 'error'],
    ['skipped', 'warning'],
    ['running', 'info'],
    ['other', 'gray'],
    [null, 'gray'],
  ])('maps %s to %s', (status, color) => {
    expect(logStatusColor(status)).toBe(color)
  })
})

describe('logCommitSummary', () => {
  it('joins the hash and the message, or keeps whichever is present', () => {
    expect(logCommitSummary({ commit_hash: 'abc1234', commit_message: 'Fix' })).toBe('abc1234 Fix')
    expect(logCommitSummary({ commit_hash: 'abc1234', commit_message: null })).toBe('abc1234')
    expect(logCommitSummary({ commit_hash: null, commit_message: ' Fix ' })).toBe('Fix')
    expect(logCommitSummary({ commit_hash: null, commit_message: null })).toBe('')
  })
})

describe('logBranchChange', () => {
  it('names the old and the new branch of a switch', () => {
    expect(logBranchChange({ branch_from: 'main', branch_to: 'develop' })).toBe('main → develop')
  })

  it('keeps the new branch alone when the old one is unknown', () => {
    expect(logBranchChange({ branch_from: null, branch_to: 'develop' })).toBe('develop')
    expect(logBranchChange({ branch_from: '  ', branch_to: ' develop ' })).toBe('develop')
  })

  it('is empty for a row recorded without the branches', () => {
    expect(logBranchChange({ branch_from: null, branch_to: null })).toBe('')
    expect(logBranchChange({})).toBe('')
  })
})

describe('isAutoDeployInProgress', () => {
  it('is true only for the in_progress async status', () => {
    expect(isAutoDeployInProgress({ async_status: { git_auto_deploy: 'in_progress' } })).toBe(true)
    expect(isAutoDeployInProgress({ async_status: { git_auto_deploy: 'finished' } })).toBe(false)
    expect(isAutoDeployInProgress({ async_status: null })).toBe(false)
    expect(isAutoDeployInProgress({})).toBe(false)
  })
})

describe('hasLastCommit', () => {
  it('needs a non-blank hash', () => {
    expect(hasLastCommit({ last_deployed_commit_hash: 'abc1234def' })).toBe(true)
    expect(hasLastCommit({ last_deployed_commit_hash: ' '.repeat(3) })).toBe(false)
    expect(hasLastCommit({ last_deployed_commit_hash: null })).toBe(false)
  })
})

describe('lastCommitDeployedAt', () => {
  const formatDate = (value: string, options: { time: boolean }) => `formatted(${value},${options.time})`
  const fromNow = (date: string) => `ago(${date})`

  it('shows the formatted date with the relative time in brackets', () => {
    expect(lastCommitDeployedAt('2026-10-19T10:15:30Z', formatDate, fromNow)).toBe('formatted(2026-10-19T10:15:30Z,true) (ago(2026-10-19T10:15:30Z))')
  })

  it('accepts an ISO date with microseconds', () => {
    expect(lastCommitDeployedAt('2026-10-19T10:15:30.123456+00:00', formatDate, fromNow))
      .toBe('formatted(2026-10-19T10:15:30.123456+00:00,true) (ago(2026-10-19T10:15:30.123456+00:00))')
  })

  it('shows an unparsable value as it is', () => {
    expect(lastCommitDeployedAt('yesterday-ish', formatDate, fromNow)).toBe('yesterday-ish')
  })

  it('has no date row for an empty value', () => {
    expect(lastCommitDeployedAt(null, formatDate, fromNow)).toBeNull()
    expect(lastCommitDeployedAt('', formatDate, fromNow)).toBeNull()
  })
})

describe('gitSyncActionDisabled', () => {
  const idle = { submitting: { connect: false, pull: false, push: false, revert: false, ignoreDrift: false, check: false, autoDeploy: false, credentials: false, repair: false }, setupBannerChecking: false }

  it('follows the busy flags like gitActionDisabled', () => {
    expect(gitSyncActionDisabled(idle, { connected: true, local_repository_exists: true })).toBe(false)
    expect(gitSyncActionDisabled({ ...idle, setupBannerChecking: true }, { connected: true, local_repository_exists: true })).toBe(true)
  })

  it('is disabled while the local repository is missing', () => {
    expect(gitSyncActionDisabled(idle, { connected: true, local_repository_exists: false })).toBe(true)
  })
})

describe('showDriftBanner', () => {
  it('shows for a connected pair with the drift flag, and hides otherwise', () => {
    expect(showDriftBanner({ connected: true, show_drift_banner: true })).toBe(true)
    expect(showDriftBanner({ connected: true, show_drift_banner: false })).toBe(false)
    expect(showDriftBanner({ connected: true, show_drift_banner: undefined })).toBe(false)
    expect(showDriftBanner({ connected: false, show_drift_banner: true })).toBe(false)
  })
})

describe('showSetupBanner', () => {
  it('shows for a connected pair that has not synced, with has_synced_once undefined or false', () => {
    expect(showSetupBanner({ connected: true, has_synced_once: undefined })).toBe(true)
    expect(showSetupBanner({ connected: true, has_synced_once: false })).toBe(true)
  })

  it('hides once the pair has synced', () => {
    expect(showSetupBanner({ connected: true, has_synced_once: true })).toBe(false)
  })

  it('hides for an unconnected instance', () => {
    expect(showSetupBanner({ connected: false, has_synced_once: false })).toBe(false)
  })
})

describe('setupBannerAction', () => {
  it('has no button while the remote counts are unknown', () => {
    expect(setupBannerAction({ commits_behind: null, commits_ahead: null })).toBeNull()
  })

  it('pulls with the count when the remote is ahead of the site', () => {
    expect(setupBannerAction({ commits_behind: 3, commits_ahead: 0 })).toBe('pull-behind')
  })

  it('pulls with the count when the pair is diverged, as legacy does not recommend a push then', () => {
    expect(setupBannerAction({ commits_behind: 1, commits_ahead: 2 })).toBe('pull-behind')
  })

  it('recommends a push when the site is ahead of the remote', () => {
    expect(setupBannerAction({ commits_behind: 0, commits_ahead: 2 })).toBe('push')
  })

  it('recommends a push when the remote branch is missing or the tree is dirty', () => {
    expect(setupBannerAction({ commits_behind: 0, commits_ahead: 0, remote_branch_exists: false })).toBe('push')
    expect(setupBannerAction({ commits_behind: 0, commits_ahead: 0, drift_status: 'dirty' })).toBe('push')
  })

  it('pulls plainly when the sides are in sync', () => {
    expect(setupBannerAction({ commits_behind: 0, commits_ahead: 0, remote_branch_exists: true, drift_status: 'clean' })).toBe('pull')
  })
})

describe('isDiverged', () => {
  it('is true only when both sides have commits the other does not', () => {
    expect(isDiverged({ commits_behind: 1, commits_ahead: 1 })).toBe(true)
    expect(isDiverged({ commits_behind: 2, commits_ahead: 0 })).toBe(false)
    expect(isDiverged({ commits_behind: 0, commits_ahead: 2 })).toBe(false)
    expect(isDiverged({ commits_behind: null, commits_ahead: null })).toBe(false)
  })
})

describe('isSameBranchAsPair', () => {
  const pair = { id: 1 } as unknown as InstanceResource

  it('is true when the branches match and the instance has a parent or a staging', () => {
    expect(isSameBranchAsPair({ branch: 'main', pair_branch: 'main' }, { parentInstance: pair, subInstances: [] })).toBe(true)
    expect(isSameBranchAsPair({ branch: 'main', pair_branch: ' main ' }, { parentInstance: null, subInstances: [pair] })).toBe(true)
  })

  it('is false without a pair, for other branches, or for a blank branch', () => {
    expect(isSameBranchAsPair({ branch: 'main', pair_branch: 'main' }, { parentInstance: null, subInstances: [] })).toBe(false)
    expect(isSameBranchAsPair({ branch: 'main', pair_branch: 'develop' }, { parentInstance: pair, subInstances: [] })).toBe(false)
    expect(isSameBranchAsPair({ branch: ' ', pair_branch: ' ' }, { parentInstance: pair, subInstances: [] })).toBe(false)
  })
})
