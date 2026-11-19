import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  createUser,
  deleteUser,
  listUserRoles,
  listUsers,
  resetUserPassword,
} from './users.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

describe('users.api', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    vi.mocked(api.put).mockReset()
    vi.mocked(api.delete).mockReset()
  })

  it('reads the users from data.data', async () => {
    const users = [{ id: '1', username: 'admin', email: 'a@b.c', role: 'administrator' }]
    vi.mocked(api.get).mockResolvedValue({ data: { data: users } })

    await expect(listUsers(7)).resolves.toEqual(users)
    expect(api.get).toHaveBeenCalledWith('/instances/7/users')
  })

  it('returns an empty list when the body has no data', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} })

    await expect(listUsers(7)).resolves.toEqual([])
  })

  it('reads the role names from data.data', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: ['administrator', 'editor'] } })

    await expect(listUserRoles(7)).resolves.toEqual(['administrator', 'editor'])
    expect(api.get).toHaveBeenCalledWith('/instances/7/users-roles')
  })

  it('posts the new user to the instance', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} })
    const body = { username: 'jan', email: 'jan@example.com', password: 'secret123', role: 'editor' }

    await createUser(7, body)
    expect(api.post).toHaveBeenCalledWith('/instances/7/users', body)
  })

  it('puts the reset body to the user reset-password path', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} })
    const row = { id: '3', username: 'jan', email: 'jan@example.com', role: 'editor', password: 'secret123' }

    await resetUserPassword(7, '3', row)
    expect(api.put).toHaveBeenCalledWith('/instances/7/users/3/reset-password', row)
  })

  it('deletes the user of the instance', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } })

    await deleteUser(7, '3')
    expect(api.delete).toHaveBeenCalledWith('/instances/7/users/3')
  })
})
