import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { getControlPanelSsoUrl } from './control-panel-sso.api'

vi.mock('@/shared/api/client', () => ({
  api: { post: vi.fn() },
}))

describe('control-panel-sso.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts to the control panel SSO endpoint without a body and answers the url', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { url: 'https://cp.example.com/login?t=1' } } })

    await expect(getControlPanelSsoUrl(11)).resolves.toBe('https://cp.example.com/login?t=1')
    expect(api.post).toHaveBeenCalledWith('/server-accounts/11/control-panel-sso-url')
  })
})
