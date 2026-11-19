import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { apiErrorStatus, confirmPassword, revealProjectSecret } from './secret.api'

vi.mock('@/shared/api/client', () => ({ api: { get: vi.fn(), post: vi.fn() } }))

const post = vi.mocked(api.post)

describe('secret.api', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('asks the reveal endpoint for one named secret of the project', async () => {
    post.mockResolvedValue({ data: { data: { secret: 'DB_PASSWORD', value: 'db-secret' } } })

    expect(await revealProjectSecret(7, 'DB_PASSWORD')).toEqual({ secret: 'DB_PASSWORD', value: 'db-secret' })
    expect(post).toHaveBeenCalledWith('/instances/7/secrets/reveal', { secret: 'DB_PASSWORD' })
  })

  it('confirms the password on the panel route', async () => {
    post.mockResolvedValue({ data: {} })

    await confirmPassword('Secret-Password1!')

    expect(post).toHaveBeenCalledWith('/user/confirm-password', { password: 'Secret-Password1!' })
  })

  it('reads the status of a failed call, and nothing from another failure', () => {
    expect(apiErrorStatus({ response: { status: 423 } })).toBe(423)
    expect(apiErrorStatus(new Error('network'))).toBeUndefined()
    expect(apiErrorStatus(null)).toBeUndefined()
  })
})
