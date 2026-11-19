import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'
import {
  createDatabase,
  createUser,
  deleteDatabase,
  deleteUser,
  getPrivileges,
  getServerInfo,
  listDatabases,
  listDatabasesCached,
  listUsers,
  renameDatabase,
  updatePrivileges,
  updateUser,
} from './databases.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

describe('databases.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAllCachedGet()
  })

  it('listDatabases GETs the account databases and returns the whole body (data + meta)', async () => {
    const body = { data: [{ database: 'example_shop', disk_usage: 1024, created_at: null, updated_at: null }], meta: { actions: { rename: true } } }
    vi.mocked(api.get).mockResolvedValue({ data: body })
    await expect(listDatabases(11)).resolves.toBe(body)
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/mysql/databases')
  })

  it('listUsers GETs the account users and returns the whole body (data + meta)', async () => {
    const body = { data: [], meta: { require_database_to_create: false, privileges_supported: true, rename_supported: false } }
    vi.mocked(api.get).mockResolvedValue({ data: body })
    await expect(listUsers(11)).resolves.toBe(body)
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/mysql/users')
  })

  it('createDatabase POSTs the typed name to the account databases', async () => {
    // Posts `formData` to `…/mysql/databases`.
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } })
    await createDatabase(11, 'shop')
    expect(api.post).toHaveBeenCalledWith('/server-accounts/11/mysql/databases', { name: 'shop' })
  })

  it('renameDatabase PUTs the new name to the encoded full database name', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } })
    await renameDatabase(11, 'example_sh op', 'blog')
    expect(api.put).toHaveBeenCalledWith('/server-accounts/11/mysql/databases/example_sh%20op/name', { name: 'blog' })
  })

  it('deleteDatabase DELETEs the encoded full database name with the dialog\'s confirmation', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } })
    await deleteDatabase(11, 'example_shop')
    expect(api.delete).toHaveBeenCalledWith('/server-accounts/11/mysql/databases/example_shop', { data: { confirm: true } })
  })

  it('listDatabasesCached returns the database rows and reads them through the cache', async () => {
    // Reads `response.data.data` from the cached `get`.
    const rows = [{ database: 'example_shop', disk_usage: 1024, created_at: null, updated_at: null }]
    vi.mocked(api.get).mockResolvedValue({ data: { data: rows, meta: {} } })

    await expect(listDatabasesCached(11)).resolves.toEqual(rows)
    await expect(listDatabasesCached(11)).resolves.toEqual(rows)
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/mysql/databases', undefined)
  })

  it('getServerInfo returns the host and port of the server-info body through the cache', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: { host: 'localhost', port: 3306 } } })

    await expect(getServerInfo(11)).resolves.toEqual({ host: 'localhost', port: 3306 })
    await expect(getServerInfo(11)).resolves.toEqual({ host: 'localhost', port: 3306 })
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/mysql/server-info', undefined)
  })

  it('createUser POSTs the modal values to the account users', async () => {
    // Posts `formData` to `…/mysql/users`.
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } })
    await createUser(11, { name: 'shop', password: 'Secret1!' })
    expect(api.post).toHaveBeenCalledWith('/server-accounts/11/mysql/users', { name: 'shop', password: 'Secret1!' })
  })

  it('updateUser PUTs the modal values to the user path, the user name not encoded as in legacy', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } })
    await updateUser(11, 'example_admin', { name: 'admin', hiddenPassword: null, password: null })
    expect(api.put).toHaveBeenCalledWith('/server-accounts/11/mysql/users/example_admin', { name: 'admin', hiddenPassword: null, password: null })
  })

  it('deleteUser DELETEs the user path', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } })
    await deleteUser(11, 'example_admin')
    expect(api.delete).toHaveBeenCalledWith('/server-accounts/11/mysql/users/example_admin')
  })

  it('getPrivileges reads the privileges of the user on the database through the cache, the database encoded', async () => {
    // Cached `get` of `…/mysql/privileges/{user}/{db}`.
    vi.mocked(api.get).mockResolvedValue({ data: { data: ['SELECT', 'INSERT'] } })

    await expect(getPrivileges(11, 'example_admin', 'example shop')).resolves.toEqual(['SELECT', 'INSERT'])
    await expect(getPrivileges(11, 'example_admin', 'example shop')).resolves.toEqual(['SELECT', 'INSERT'])
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/mysql/privileges/example_admin/example%20shop', undefined)
  })

  it.each([
    ['ALL PRIVILEGES', ['ALL PRIVILEGES']],
    ['SELECT, INSERT', ['SELECT', 'INSERT']],
    ['', []],
  ])('getPrivileges turns the string answer %j of the Engine-backed panel into a list', async (answer, expected) => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: answer } })

    await expect(getPrivileges(11, 'example_admin', `db_${expected.length}`)).resolves.toEqual(expected)
  })

  it('updatePrivileges PUTs the comma-joined list, then the next read of the privileges is a new request', async () => {
    // `put`, then the cache entry of the URL is cleared.
    vi.mocked(api.get).mockResolvedValue({ data: { data: ['SELECT'] } })
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } })
    await getPrivileges(11, 'example_admin', 'example_shop')

    await updatePrivileges(11, 'example_admin', 'example_shop', ['SELECT', 'INSERT'])
    expect(api.put).toHaveBeenCalledWith('/server-accounts/11/mysql/privileges/example_admin/example_shop', { privileges: 'SELECT,INSERT' })

    await getPrivileges(11, 'example_admin', 'example_shop')
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['createDatabase', () => createDatabase(11, 'shop')],
    ['renameDatabase', () => renameDatabase(11, 'example_shop', 'shop2')],
    ['deleteDatabase', () => deleteDatabase(11, 'example_shop')],
  ])('%s drops the cached database list and the cached privileges of the account (review F4)', async (_name, mutate) => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [] } })
    vi.mocked(api.post).mockResolvedValue({ data: {} })
    vi.mocked(api.put).mockResolvedValue({ data: {} })
    vi.mocked(api.delete).mockResolvedValue({ data: {} })
    await listDatabasesCached(11)
    await getPrivileges(11, 'example_admin', 'example_shop')
    await getPrivileges(12, 'example_admin', 'example_shop')
    vi.mocked(api.get).mockClear()

    await mutate()
    await listDatabasesCached(11)
    await getPrivileges(11, 'example_admin', 'example_shop')
    await getPrivileges(12, 'example_admin', 'example_shop')

    // Account 11 reads again, account 12 stays cached.
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['updateUser', () => updateUser(11, 'example_admin', { name: 'renamed' })],
    ['deleteUser', () => deleteUser(11, 'example_admin')],
    ['createUser', () => createUser(11, { name: 'example_admin', password: 'x' })],
  ])('%s drops the cached privileges of that user only (review F4)', async (_name, mutate) => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [] } })
    vi.mocked(api.post).mockResolvedValue({ data: {} })
    vi.mocked(api.put).mockResolvedValue({ data: {} })
    vi.mocked(api.delete).mockResolvedValue({ data: {} })
    await getPrivileges(11, 'example_admin', 'example_shop')
    await getPrivileges(11, 'other_user', 'example_shop')
    vi.mocked(api.get).mockClear()

    await mutate()
    await getPrivileges(11, 'example_admin', 'example_shop')
    await getPrivileges(11, 'other_user', 'example_shop')

    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('updatePrivileges sends a DELETE without a body for an empty list', async () => {
    // A `delete` with no body, axios drops it.
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } })
    await updatePrivileges(11, 'example_admin', 'example_shop', [])
    expect(api.delete).toHaveBeenCalledWith('/server-accounts/11/mysql/privileges/example_admin/example_shop')
  })
})
