import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  createWordpressUser,
  deleteWordpressUser,
  listWordpressUsers,
  resetWordpressUserPassword,
  updateWordpressUser,
} from './wordpress-users.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

describe('wordpress-users.api', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    vi.mocked(api.put).mockReset()
    vi.mocked(api.delete).mockReset()
  })

  it('reads the users from data.data', async () => {
    const users = [{ id: 1, username: 'admin', display_name: 'Admin', email: 'a@b.io', role: 'administrator', user_registered: null }]
    vi.mocked(api.get).mockResolvedValue({ data: { data: users } })

    await expect(listWordpressUsers(7)).resolves.toEqual(users)
    expect(api.get).toHaveBeenCalledWith('/instances/7/wordpress/users')
  })

  it('returns an empty list when the body has no data', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} })

    await expect(listWordpressUsers(7)).resolves.toEqual([])
  })

  it('posts the new user to the instance', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} })
    const body = { username: 'jan', email: 'jan@example.com', display_name: 'Jan', password: 'secret123', role: 'editor', send_email: true }

    await createWordpressUser(7, body)
    expect(api.post).toHaveBeenCalledWith('/instances/7/wordpress/users', body)
  })

  it('puts the body to the user path', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} })
    const body = { username: 'jan', role: 'editor' }

    await updateWordpressUser(7, 3, body)
    expect(api.put).toHaveBeenCalledWith('/instances/7/wordpress/users/3', body)
  })

  it('puts the whole user to the reset-password path and returns the new password', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { new_password: 'Xk29-pQz' } })
    const user = { id: 3, username: 'jan', email: 'jan@example.com', role: 'editor' }

    await expect(resetWordpressUserPassword(7, user)).resolves.toBe('Xk29-pQz')
    expect(api.put).toHaveBeenCalledWith('/instances/7/wordpress/users/3/reset-password', user)
  })

  it('returns undefined when the reset response has no new password', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} })

    await expect(resetWordpressUserPassword(7, { id: 3 })).resolves.toBeUndefined()
  })

  it('deletes the user by its email with the email encoded in the path', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } })

    await deleteWordpressUser(7, 'a+b@x.io')
    expect(api.delete).toHaveBeenCalledWith('/instances/7/wordpress/users/a%2Bb%40x.io')
  })
})
