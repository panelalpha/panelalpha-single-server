import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  getEnvFile,
  getEnvFileMeta,
  putEnvFile,
} from './env-file.api'

vi.mock('@/shared/api/client', () => ({ api: { get: vi.fn(), put: vi.fn() } }))

describe('env-file.api', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.put).mockReset()
  })

  it('reads the env-file meta and returns the bare JSON body', async () => {
    const meta = {
      is_git_repo: false,
      is_dind: true,
      supports_restart: true,
      default_env_dir: '/app',
      default_env_path: '/app/.env',
      app_type: 'node',
    }
    vi.mocked(api.get).mockResolvedValue({ data: meta })

    await expect(getEnvFileMeta(11, 7)).resolves.toEqual(meta)
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/instances/7/env-file/meta')
  })

  it('reads the file with the path in params and returns the bare JSON body', async () => {
    const contents = { path: '/app/.env', exists: true, contents: 'A=1', parsed: [{ type: 'variable', key: 'A', value: '1' }] }
    vi.mocked(api.get).mockResolvedValue({ data: contents })

    await expect(getEnvFile(11, 7, '/app/.env')).resolves.toEqual(contents)
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/instances/7/env-file', { params: { path: '/app/.env' } })
  })

  it('puts the body to the env-file and returns the bare JSON body', async () => {
    const body = { path: '/app/.env', mode: 'kv' as const, contents: 'A=1', restart: true }
    const result = { success: true, path: '/app/.env', restarted: true }
    vi.mocked(api.put).mockResolvedValue({ data: result })

    await expect(putEnvFile(11, 7, body)).resolves.toEqual(result)
    expect(api.put).toHaveBeenCalledWith('/server-accounts/11/instances/7/env-file', body)
  })
})
