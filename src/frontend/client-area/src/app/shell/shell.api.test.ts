import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { putUserDarkMode } from './shell.api'

vi.mock('@/shared/api/client', () => ({
  api: { put: vi.fn() },
}))

describe('shell.api', () => {
  beforeEach(() => {
    vi.mocked(api.put).mockReset()
  })

  it('putUserDarkMode sends PUT /user/dark-mode with dark_mode', async () => {
    vi.mocked(api.put).mockResolvedValueOnce({ data: {} })

    await putUserDarkMode(true)
    await putUserDarkMode(false)

    expect(api.put).toHaveBeenNthCalledWith(1, '/user/dark-mode', { dark_mode: true })
    expect(api.put).toHaveBeenNthCalledWith(2, '/user/dark-mode', { dark_mode: false })
  })
})
