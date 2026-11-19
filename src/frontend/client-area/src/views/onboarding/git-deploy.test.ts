import { describe, expect, it, vi } from 'vitest'
import { canContinue, connectGitRepo, type GitConnectDeps, type GitConnectStatus } from './git-deploy'

const FAILED_COPY = 'heading.onboarding.gitDeploy.connectionFailed'

function deps (overrides: Partial<GitConnectDeps> = {}): GitConnectDeps {
  return {
    testGitUrl: vi.fn(async () => ({ success: true })),
    getGitBranches: vi.fn(async () => ({ success: true, branches: ['main', 'dev'], default_branch: 'main' })),
    previewEnvExample: vi.fn(async () => ({ has_example: true, variables: [{ key: 'DB_HOST' }] as never })),
    translate: vi.fn((key: string) => `t:${key}`),
    ...overrides,
  }
}

const PUBLIC_INPUT = { repoUrl: '  https://example.com/repo.git  ', isPrivate: false, token: 'ignored' }

describe('connectGitRepo', () => {
  it('runs the three requests in order and reports each status', async () => {
    const statuses: GitConnectStatus[] = []
    const d = deps({ onStatus: status => statuses.push(status) })

    const outcome = await connectGitRepo(d, PUBLIC_INPUT)

    expect(statuses).toEqual(['connecting', 'detectingBranches', 'detectingEnv'])
    expect(d.testGitUrl).toHaveBeenCalledWith({ repo_url: 'https://example.com/repo.git', token: null })
    expect(d.getGitBranches).toHaveBeenCalledWith({ repo_url: 'https://example.com/repo.git', token: null })
    expect(d.previewEnvExample).toHaveBeenCalledWith({ repo_url: 'https://example.com/repo.git', token: null, branch: 'main' })
    expect(outcome).toEqual({
      ok: true,
      deploy: {
        repo_url: 'https://example.com/repo.git',
        token: null,
        branches: ['main', 'dev'],
        default_branch: 'main',
        preview: { has_example: true, variables: [{ key: 'DB_HOST' }] },
      },
    })
  })

  it('sends the trimmed token only for a private repo', async () => {
    const d = deps()
    const outcome = await connectGitRepo(d, { repoUrl: 'https://x.test/r', isPrivate: true, token: '  abc  ' })

    expect(d.testGitUrl).toHaveBeenCalledWith({ repo_url: 'https://x.test/r', token: 'abc' })
    expect(outcome.ok && outcome.deploy.token).toBe('abc')
  })

  it('drops the token of a public repo even when one was typed', async () => {
    const d = deps()
    await connectGitRepo(d, { repoUrl: 'https://x.test/r', isPrivate: false, token: 'typed' })

    expect(d.testGitUrl).toHaveBeenCalledWith({ repo_url: 'https://x.test/r', token: null })
  })

  it('fails with the result error_message first', async () => {
    const d = deps({ testGitUrl: vi.fn(async () => ({ success: false, error_message: 'Bad credentials' })) })

    const outcome = await connectGitRepo(d, PUBLIC_INPUT)

    expect(outcome).toEqual({ ok: false, message: 'Bad credentials' })
    expect(d.getGitBranches).not.toHaveBeenCalled()
    expect(d.previewEnvExample).not.toHaveBeenCalled()
  })

  it('falls back to the connection-failed copy when there is no error_message', async () => {
    const d = deps({ testGitUrl: vi.fn(async () => ({ success: false, error_message: '' })) })

    const outcome = await connectGitRepo(d, PUBLIC_INPUT)

    expect(d.translate).toHaveBeenCalledWith(FAILED_COPY)
    expect(outcome).toEqual({ ok: false, message: `t:${FAILED_COPY}` })
  })

  it('uses the thrown error message when the url test request fails', async () => {
    const error = { response: { data: { message: 'Server exploded' } } }
    const d = deps({ testGitUrl: vi.fn(async () => {
      throw error
    }) })

    const outcome = await connectGitRepo(d, PUBLIC_INPUT)

    expect(outcome).toEqual({ ok: false, message: 'Server exploded' })
    expect(d.translate).not.toHaveBeenCalled()
  })

  it('uses a thrown string as the message as it is', async () => {
    const d = deps({ testGitUrl: vi.fn(async () => {
      throw 'plain text'
    }) })

    expect(await connectGitRepo(d, PUBLIC_INPUT)).toEqual({ ok: false, message: 'plain text' })
  })

  it('swallows a failed branches request and goes on with no branches and no branch for the preview', async () => {
    const d = deps({ getGitBranches: vi.fn(async () => {
      throw new Error('boom')
    }) })

    const outcome = await connectGitRepo(d, PUBLIC_INPUT)

    expect(d.previewEnvExample).toHaveBeenCalledWith(expect.objectContaining({ branch: null }))
    expect(outcome).toMatchObject({ ok: true, deploy: { branches: [], default_branch: null } })
  })

  it('keeps no branches when the branches answer is not a success', async () => {
    const d = deps({ getGitBranches: vi.fn(async () => ({ success: false, branches: ['x'], default_branch: 'x' })) })

    const outcome = await connectGitRepo(d, PUBLIC_INPUT)

    expect(outcome).toMatchObject({ ok: true, deploy: { branches: [], default_branch: null } })
  })

  it('swallows a failed env preview and keeps an empty preview', async () => {
    const d = deps({ previewEnvExample: vi.fn(async () => {
      throw new Error('nope')
    }) })

    const outcome = await connectGitRepo(d, PUBLIC_INPUT)

    expect(outcome).toMatchObject({ ok: true, deploy: { preview: { has_example: false, variables: [] } } })
  })
})

describe('canContinue', () => {
  it('needs a non-blank repo url', () => {
    expect(canContinue('', false, '')).toBe(false)
    expect(canContinue(' '.repeat(3), false, '')).toBe(false)
    expect(canContinue('https://x.test/r', false, '')).toBe(true)
  })

  it('needs a non-blank token for a private repo only', () => {
    expect(canContinue('https://x.test/r', true, '')).toBe(false)
    expect(canContinue('https://x.test/r', true, ' '.repeat(3))).toBe(false)
    expect(canContinue('https://x.test/r', true, 'tok')).toBe(true)
  })
})
