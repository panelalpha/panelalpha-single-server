import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { completeHub, disconnectHub, getHubStatus, startHub } from './hub.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

describe('hub.api', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('getHubStatus reads GET /community/hub and returns the flat body', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { paired: true, account_name: 'Acme' } })

    await expect(getHubStatus()).resolves.toEqual({ paired: true, account_name: 'Acme' })
    expect(api.get).toHaveBeenCalledWith('/community/hub')
  })

  it('startHub sends only admin_url with POST /community/hub/start', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { link: 'https://hub.test/c' } })

    await expect(startHub({ admin_url: 'https://panel.test' })).resolves.toEqual({ link: 'https://hub.test/c' })
    expect(api.post).toHaveBeenCalledWith('/community/hub/start', { admin_url: 'https://panel.test' })
  })

  it('startHub sends server_name when given (the wizard), an empty name too', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { link: 'l' } })
    await startHub({ admin_url: 'https://panel.test', server_name: 'My server' })
    expect(api.post).toHaveBeenCalledWith('/community/hub/start', { admin_url: 'https://panel.test', server_name: 'My server' })
    await startHub({ admin_url: 'https://panel.test', server_name: '' })
    expect(api.post).toHaveBeenLastCalledWith('/community/hub/start', { admin_url: 'https://panel.test', server_name: '' })
  })

  it('completeHub sends state and result with POST /community/hub/complete', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { status: 'pending' } })

    await expect(completeHub({ state: 'abc', result: 'approved' })).resolves.toEqual({ status: 'pending' })
    expect(api.post).toHaveBeenCalledWith('/community/hub/complete', { state: 'abc', result: 'approved' })
  })

  it('disconnectHub posts to /community/hub/disconnect without a body', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { paired: false, account_name: null } })

    await expect(disconnectHub()).resolves.toEqual({ paired: false, account_name: null })
    expect(api.post).toHaveBeenCalledWith('/community/hub/disconnect')
  })
})
