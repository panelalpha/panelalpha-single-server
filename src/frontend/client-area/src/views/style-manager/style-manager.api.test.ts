import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { putResellerBranding, putUserappBranding } from './style-manager.api'

vi.mock('@/shared/api/client', () => ({
  api: { put: vi.fn() },
}))

const theme = {
  colors: { base: '#111111' },
  style: { darkMode: false, disableShadows: true, allowToChangeMode: false },
  logo: false as const,
  darkLogo: null,
  favicon: 'data:image/png;base64,A',
}

describe('style-manager.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('putResellerBranding PUTs /reseller/branding-settings with the theme under `theme`', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} })
    await expect(putResellerBranding(theme)).resolves.toBeUndefined()
    expect(api.put).toHaveBeenCalledWith('/reseller/branding-settings', { theme })
  })

  it('putUserappBranding PUTs /settings/userapp-branding with a flat body', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} })
    await expect(putUserappBranding(theme)).resolves.toBeUndefined()
    expect(api.put).toHaveBeenCalledWith('/settings/userapp-branding', theme)
  })

  it('propagates request errors', async () => {
    vi.mocked(api.put).mockRejectedValue(new Error('422'))
    await expect(putUserappBranding(theme)).rejects.toThrow('422')
  })
})
