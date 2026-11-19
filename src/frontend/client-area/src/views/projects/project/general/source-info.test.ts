import { describe, expect, it } from 'vitest'
import {
  containersPath,
  gitCardAction,
  gitPageRouteName,
  initialGitLiveStatus,
  isGitConnected,
  parseCommitsBehind,
  repoName,
  resourceBase,
  shortCommit,
  showBehind,
  showUpToDate,
  sourceBranch,
  sourceCardView,
} from './source-info'

describe('resourceBase / containersPath', () => {
  it('uses /projects under a projects route and /instances otherwise', () => {
    expect(resourceBase('/projects/5/general')).toBe('/projects')
    expect(resourceBase('/instances/5/general')).toBe('/instances')
    expect(containersPath('/projects/5/general', 5)).toBe('/projects/5/advanced/containers')
  })
})

describe('repository card', () => {
  it('reads repo name and prefers the connected branch', () => {
    expect(repoName({ repo_name: 'acme/site' })).toBe('acme/site')
    expect(repoName(null)).toBe('')
    expect(sourceBranch({ branch: 'main' }, { connected: true, branch: 'dev' })).toBe('dev')
    expect(sourceBranch({ branch: 'main' }, { connected: false, branch: 'dev' })).toBe('main')
    expect(sourceBranch({ branch: 'main' }, { connected: true, branch: '' })).toBe('main')
    expect(sourceBranch(null, null)).toBe('')
  })

  it('is connected only on a strict true', () => {
    expect(isGitConnected({ connected: true })).toBe(true)
    expect(isGitConnected({ connected: false })).toBe(false)
    expect(isGitConnected(null)).toBe(false)
  })

  it('parses commits_behind', () => {
    expect(parseCommitsBehind({ commits_behind: 3 })).toBe(3)
    expect(parseCommitsBehind({ commits_behind: '2' })).toBe(2)
    expect(parseCommitsBehind({ commits_behind: 0 })).toBe(0)
    expect(parseCommitsBehind({ commits_behind: null })).toBeNull()
    expect(parseCommitsBehind({})).toBeNull()
  })

  it('starts loading only when connected', () => {
    expect(initialGitLiveStatus(true)).toEqual({ loading: true, loaded: false, commitsBehind: null })
    expect(initialGitLiveStatus(false).loading).toBe(false)
  })

  it('shows up to date or behind only after the status loaded', () => {
    expect(showUpToDate({ loaded: true, commitsBehind: 0 })).toBe(true)
    expect(showUpToDate({ loaded: false, commitsBehind: 0 })).toBe(false)
    expect(showUpToDate({ loaded: true, commitsBehind: null })).toBe(false)
    expect(showBehind({ loaded: true, commitsBehind: 2 })).toBe(true)
    expect(showBehind({ loaded: true, commitsBehind: 0 })).toBe(false)
    expect(showBehind({ loaded: true, commitsBehind: null })).toBe(false)
    expect(showBehind({ loaded: false, commitsBehind: 2 })).toBe(false)
  })

  it('picks the footer action by connection and privilege', () => {
    expect(gitCardAction(false, { manageGit: true, redeploy: true })).toBe('manage')
    expect(gitCardAction(false, { manageGit: false, redeploy: true })).toBeNull()
    expect(gitCardAction(true, { manageGit: false, redeploy: true })).toBe('redeploy')
    expect(gitCardAction(true, { manageGit: true, redeploy: false })).toBeNull()
  })

  it('names the page route by the path', () => {
    expect(gitPageRouteName('/projects/5/general')).toBe('ProjectGit')
    expect(gitPageRouteName('/instances/5/general')).toBe('Git')
  })
})

describe('shortCommit', () => {
  it('keeps the first 7 characters', () => {
    expect(shortCommit('a1b2c3d4e5f6')).toBe('a1b2c3d')
    expect(shortCommit('abc')).toBe('abc')
    expect(shortCommit('')).toBe('')
    expect(shortCommit(null)).toBe('')
  })
})

describe('sourceCardView', () => {
  const instance = {
    source: { database: { present: true, label: 'MySQL 8' }, last_deploy: { status: 'failed', finished_at: '2026-10-05T14:03:00' } },
    details: { detected_stack: { label: 'Node.js' } },
  } as const

  it('reads /source when the Engine answered', () => {
    const view = sourceCardView({
      available: true,
      stack: { label: 'Next.js' },
      database: { present: false, label: '' },
      last_deploy: { status: 'finished', commit: 'a1b2c3d4e5f6', finished_at: '2026-10-29T10:00:00Z' },
    }, instance)
    expect(view).toEqual({
      stackLabel: 'Next.js',
      database: { present: false, label: '' },
      deploy: { state: 'finished', commit: 'a1b2c3d', at: '2026-10-29T10:00:00Z', waitingForFiles: false },
    })
  })

  it('falls back to the payload when available is false or the answer is null', () => {
    const expected = {
      stackLabel: 'Node.js',
      database: { present: true, label: 'MySQL 8' },
      deploy: { state: 'failed', commit: '', at: '2026-10-05T14:03:00', waitingForFiles: false },
    }
    expect(sourceCardView({ available: false, stack: { label: 'Other' }, last_deploy: { status: 'finished', commit: 'ffffffff' } }, instance)).toEqual(expected)
    expect(sourceCardView(null, instance)).toEqual(expected)
    expect(sourceCardView(undefined, instance)).toEqual(expected)
  })

  it('takes the payload last_deploy when /source has none', () => {
    const view = sourceCardView({ available: true, last_deploy: null }, instance)
    expect(view.deploy).toEqual({ state: 'failed', commit: '', at: '2026-10-05T14:03:00', waitingForFiles: false })
  })

  it('leaves the state empty for an unknown status', () => {
    const view = sourceCardView({ available: true, last_deploy: { status: 'queued', commit: 'abc1234' } }, instance)
    expect(view.deploy).toEqual({ state: '', commit: 'abc1234', at: '', waitingForFiles: false })
  })

  it('returns empty values when neither /source nor the payload has them', () => {
    expect(sourceCardView(null, { source: null, details: null })).toEqual({
      stackLabel: '',
      database: { present: false, label: '' },
      deploy: { state: '', commit: '', at: '', waitingForFiles: false },
    })
  })

  it('marks the deploy of a files project that waits for its archive', () => {
    // FX-20's backend flag: the Engine's create deploy keeps running until the archive arrives, which is not a deploy in flight.
    const fromSource = sourceCardView({
      available: true,
      last_deploy: { status: 'running', finished_at: null, waiting_for_files: true },
    }, instance)
    expect(fromSource.deploy).toEqual({ state: 'running', commit: '', at: '', waitingForFiles: true })

    const fromPayload = sourceCardView(null, {
      source: { last_deploy: { status: 'running', waiting_for_files: true } },
      details: {},
    } as never)
    expect(fromPayload.deploy.waitingForFiles).toBe(true)
  })

  it('does not mark a deploy that only asked for files in the past', () => {
    const view = sourceCardView({ available: true, last_deploy: { status: 'finished', finished_at: '2026-11-14T10:00:00Z', waiting_for_files: false } }, instance)
    expect(view.deploy.waitingForFiles).toBe(false)
  })
})
