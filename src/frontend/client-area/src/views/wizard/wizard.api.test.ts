import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  createFreeSetup,
  defaultServerName,
  getWizardSettings,
  saveWizardServerName,
} from './wizard.api'

vi.mock('@/shared/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

describe('wizard.api', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    vi.mocked(api.put).mockReset()
  })

  it('createFreeSetup posts the snake_case body', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} })
    await createFreeSetup({ serverName: 'S', name: 'N', email: 'a@b.c', password: 'p', passwordConfirmation: 'q' })
    expect(api.post).toHaveBeenCalledWith('/community/setup', {
      server_name: 'S',
      name: 'N',
      email: 'a@b.c',
      password: 'p',
      password_confirmation: 'q',
    })
  })

  it('getWizardSettings reads GET /community/settings', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { name: 'Box', default_language: 'en', default_date_format: 'YYYY-MM-DD' } })
    await expect(getWizardSettings()).resolves.toMatchObject({ name: 'Box' })
    expect(api.get).toHaveBeenCalledWith('/community/settings')
  })

  it('saveWizardServerName puts the new name with the unchanged defaults', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} })
    await saveWizardServerName('New', { name: 'Box', default_language: 'pl', default_date_format: 'DD.MM.YYYY' })
    expect(api.put).toHaveBeenCalledWith('/community/settings', { name: 'New', default_language: 'pl', default_date_format: 'DD.MM.YYYY' })
  })

  it('defaultServerName trims the panel name and falls back to My server', () => {
    expect(defaultServerName({ app: { name: '  Box ' } })).toBe('Box')
    expect(defaultServerName({ app: { name: ' '.repeat(3) } })).toBe('My server')
    expect(defaultServerName({ app: {} })).toBe('My server')
    expect(defaultServerName(null)).toBe('My server')
  })
})
