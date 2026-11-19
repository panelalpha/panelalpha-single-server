import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  clearChangeDomainOptions,
  getChangeDomainOptions,
  getGitCommits,
  getGitSourceStatus,
  putChangeDomain,
  putChangeSubdomain,
  redeployInstance,
  redeployUploadedArchive,
  uploadVersionArchive,
} from './instance.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  apiBaseUrl: () => '/api',
}))

describe('instance.api source cards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the live status from GET /instances/{id}/git and falls back to an empty object', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: { commits_behind: 4 } } })
    expect(await getGitSourceStatus(9)).toEqual({ commits_behind: 4 })
    expect(api.get).toHaveBeenCalledWith('/instances/9/git')

    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: null } })
    expect(await getGitSourceStatus(9)).toEqual({})
  })

  it('reads commits of a branch with the branch param and lite fallbacks', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: { commits: [{ hash: 'a' }], from: 1, to: 1, total: 1, branch_fetched: true } } })
    expect(await getGitCommits(9, 'main')).toEqual({ commits: [{ hash: 'a' }], from: 1, to: 1, total: 1, branchFetched: true })
    expect(api.get).toHaveBeenCalledWith('/instances/9/git/commits', { params: { branch: 'main' } })

    // An answer without the flag (an older panel) is a branch that is in the checkout.
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: { commits: [], from: 1, to: 1, total: 0 } } })
    expect(await getGitCommits(9, 'main')).toEqual({ commits: [], from: 1, to: 1, total: 0, branchFetched: true })

    // A branch the checkout has not fetched: the panel sent an empty list with the flag.
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: { commits: [], from: null, to: null, total: 0, branch_fetched: false } } })
    expect(await getGitCommits(9, 'dev')).toEqual({ commits: [], from: null, to: null, total: 0, branchFetched: false })

    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: null } })
    expect(await getGitCommits(9, 'dev')).toEqual({ commits: [], from: undefined, to: undefined, total: 0, branchFetched: true })
  })

  it('posts the redeploy payload to /instances/{id}/redeploy and returns the target and log ids', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { target_id: 12, deploy_log_id: 7, extra: 1 } })
    const payload = { branch: 'main', strategy: undefined, deploy_staging: false, skip: ['build' as const] }
    expect(await redeployInstance(9, payload)).toEqual({ target_id: 12, deploy_log_id: 7 })
    expect(api.post).toHaveBeenCalledWith('/instances/9/redeploy', payload)
  })

  it('uploads the archive as an octet stream with filename and deploy_staging as 0/1', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { remote_filepath: '/tmp/a.zip' } })
    const file = new File(['x'], 'a.zip')
    const onProgress = vi.fn()
    expect(await uploadVersionArchive(5, file, { deployStaging: true, onProgress })).toBe('/tmp/a.zip')
    expect(api.post).toHaveBeenCalledWith('/instances/5/deploy/upload', file, {
      headers: { 'Content-Type': 'application/octet-stream' },
      params: { filename: 'a.zip', deploy_staging: 1 },
      onUploadProgress: onProgress,
    })
    await uploadVersionArchive(5, file, { deployStaging: false })
    expect(vi.mocked(api.post).mock.calls[1]![2]).toMatchObject({ params: { deploy_staging: 0 } })
  })

  it('redeploys the uploaded archive and returns the target and log ids', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { target_id: 7, deploy_log_id: 9, extra: 1 } })
    const payload = { remote_filepath: '/tmp/a.zip', mode: 'replace' as const, deploy_staging: false }
    expect(await redeployUploadedArchive(5, payload)).toEqual({ target_id: 7, deploy_log_id: 9 })
    expect(api.post).toHaveBeenCalledWith('/instances/5/redeploy', payload)
  })
})

describe('instance.api change domain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearChangeDomainOptions(31)
  })

  it('reads the options from GET change-domain/options and caches them for 300 s', async () => {
    const options = { subdomains: ['.panelalpha.online'], ip_address: '192.0.2.1', ipv4_addresses: ['192.0.2.1'], cdn_dns_records: [], nameservers: ['ns1.example'] }
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: options } })
    expect(await getChangeDomainOptions(31)).toEqual(options)
    expect(await getChangeDomainOptions(31)).toEqual(options)
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.get).mock.calls[0][0]).toBe('/instances/31/change-domain/options')
  })

  it('fetches again after clearChangeDomainOptions', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { data: { subdomains: ['a.io'] } } })
      .mockResolvedValueOnce({ data: { data: { subdomains: ['b.io'] } } })
    expect(await getChangeDomainOptions(31)).toEqual({ subdomains: ['a.io'] })
    clearChangeDomainOptions(31)
    expect(await getChangeDomainOptions(31)).toEqual({ subdomains: ['b.io'] })
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('puts the domain and returns the raw instance', async () => {
    vi.mocked(api.put).mockResolvedValueOnce({ data: { data: { id: 31, domain: 'shop.example' } } })
    expect(await putChangeDomain(31, 'shop.example')).toEqual({ id: 31, domain: 'shop.example' })
    expect(api.put).toHaveBeenCalledWith('/instances/31/change-domain/domain', { domain: 'shop.example' })
  })

  it('puts the subdomain payload and returns the raw instance', async () => {
    vi.mocked(api.put).mockResolvedValueOnce({ data: { data: { id: 31, domain: 'x.panelalpha.online' } } })
    expect(await putChangeSubdomain(31, { subdomain: 'x', domain: '.panelalpha.online' })).toEqual({ id: 31, domain: 'x.panelalpha.online' })
    expect(api.put).toHaveBeenCalledWith('/instances/31/change-domain/subdomain', { subdomain: 'x', domain: '.panelalpha.online' })
  })
})
