import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  changeBranch,
  connectGit,
  createGitDeployKey,
  deleteGitDeployKey,
  disconnectGit,
  getGitBranches,
  getGitDeployKey,
  getGitLogs,
  getGitStatus,
  ignoreGitDrift,
  pullGit,
  pushGit,
  repairGit,
  revertGit,
  setAutoDeploy,
  updateGitCredentials,
} from './git.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

describe('git.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the status from GET /instances/{id}/git and returns data.data', async () => {
    const status = { connected: true, repo_url: 'https://example.test/acme.git' }
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: status } })

    expect(await getGitStatus(7)).toEqual(status)
    expect(api.get).toHaveBeenCalledWith('/instances/7/git')
  })

  it('reads one page of logs with the fixed newest-first sort and returns data with meta', async () => {
    const rows = [{ action: 'pull', status: 'success' }]
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: rows, meta: { total: 12, last_page: 3 } } })

    expect(await getGitLogs(7, { page: 2, perPage: 5 })).toEqual({ data: rows, meta: { total: 12, last_page: 3 } })
    expect(api.get).toHaveBeenCalledWith('/instances/7/git/logs', {
      params: { page: 2, per_page: 5, sort_by: 'date', sort_dir: 'desc' },
    })
  })

  it('falls back to an empty page when the logs response has no data or meta', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: {} })

    expect(await getGitLogs(7, { page: 1, perPage: 15 })).toEqual({ data: [], meta: { total: 0, last_page: 1 } })
  })

  it('reads the branch list from GET /instances/{id}/git/branches', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: ['main', 'dev'] } })

    expect(await getGitBranches(7)).toEqual(['main', 'dev'])
    expect(api.get).toHaveBeenCalledWith('/instances/7/git/branches')
  })

  it('posts a reuse connect as { git_repository_id } and reports no missing branch by default', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: {} })

    expect(await connectGit(7, { git_repository_id: 3 })).toEqual({ branchMissing: false })
    expect(api.post).toHaveBeenCalledWith('/instances/7/git/connect', { git_repository_id: 3 })
  })

  it('posts a manual public connect with a null auth type and token', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: {} })

    await connectGit(7, { repo_url: 'https://example.test/acme.git', auth_type: null, token: null })

    expect(api.post).toHaveBeenCalledWith('/instances/7/git/connect', {
      repo_url: 'https://example.test/acme.git',
      auth_type: null,
      token: null,
    })
  })

  it('posts an SSH connect as { repo_url, branch } and reads branch_missing from data', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { data: { branch_missing: true } } })

    expect(await connectGit(7, { repo_url: 'git@example.test:acme.git', branch: 'main' })).toEqual({ branchMissing: true })
    expect(api.post).toHaveBeenCalledWith('/instances/7/git/connect', { repo_url: 'git@example.test:acme.git', branch: 'main' })
  })

  it('reads the deploy key from GET /instances/{id}/git/deploy-key and returns null when there is none', async () => {
    const key = { public_key: 'ssh-ed25519 AAAA', fingerprint: 'SHA256:abc' }
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: key } })
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: null } })

    expect(await getGitDeployKey(7)).toEqual(key)
    expect(await getGitDeployKey(7)).toBeNull()
    expect(api.get).toHaveBeenCalledWith('/instances/7/git/deploy-key')
  })

  it('posts the deploy key with repo_url, or null to keep the stored address, and returns the key', async () => {
    const key = { public_key: 'ssh-ed25519 AAAA', fingerprint: null }
    vi.mocked(api.post).mockResolvedValueOnce({ data: { data: key } })
    vi.mocked(api.post).mockResolvedValueOnce({ data: { data: key } })

    expect(await createGitDeployKey(7, 'git@example.test:acme.git')).toEqual(key)
    expect(await createGitDeployKey(7, null)).toEqual(key)
    expect(vi.mocked(api.post).mock.calls).toEqual([
      ['/instances/7/git/deploy-key', { repo_url: 'git@example.test:acme.git' }],
      ['/instances/7/git/deploy-key', { repo_url: null }],
    ])
  })

  it('deletes the deploy key with DELETE /instances/{id}/git/deploy-key', async () => {
    await deleteGitDeployKey(7)

    expect(api.delete).toHaveBeenCalledWith('/instances/7/git/deploy-key')
  })

  it('posts the action paths without a body', async () => {
    await disconnectGit(7)
    await revertGit(7)
    await ignoreGitDrift(7)
    await repairGit(7)
    vi.mocked(api.post).mockResolvedValueOnce({ data: { nothing_to_push: false } })
    await pushGit(7)

    expect(vi.mocked(api.post).mock.calls).toEqual([
      ['/instances/7/git/disconnect'],
      ['/instances/7/git/revert'],
      ['/instances/7/git/drift/ignore'],
      ['/instances/7/git/repair'],
      ['/instances/7/git/push'],
    ])
  })

  it('posts pull with an empty body without a strategy and with the strategy otherwise', async () => {
    await pullGit(7)
    await pullGit(7, 'force')
    await pullGit(7, 'push_first')

    expect(vi.mocked(api.post).mock.calls).toEqual([
      ['/instances/7/git/pull', {}],
      ['/instances/7/git/pull', { strategy: 'force' }],
      ['/instances/7/git/pull', { strategy: 'push_first' }],
    ])
  })

  it('puts the PAT credentials and returns the new status', async () => {
    const status = { connected: true }
    vi.mocked(api.put).mockResolvedValueOnce({ data: { data: status } })

    expect(await updateGitCredentials(7, 'secret')).toEqual(status)
    expect(api.put).toHaveBeenCalledWith('/instances/7/git/credentials', { token: 'secret', auth_type: 'pat' })
  })

  it('puts the auto-deploy flag and returns the new status', async () => {
    const status = { connected: true, auto_deploy_enabled: true }
    vi.mocked(api.put).mockResolvedValueOnce({ data: { data: status } })

    expect(await setAutoDeploy(7, true)).toEqual(status)
    expect(api.put).toHaveBeenCalledWith('/instances/7/auto-deploy', { auto_deploy_enabled: true })
  })

  it('puts the branch name to change-branch', async () => {
    await changeBranch(7, 'release')

    expect(api.put).toHaveBeenCalledWith('/instances/7/change-branch', { branch: 'release' })
  })
})
