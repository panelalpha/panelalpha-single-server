import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  containerLogs,
  createProxyRule,
  deleteProxyRule,
  listContainerGroups,
  listProxyRules,
  projectAction,
  type ProxyRulePayload,
  serviceAction,
} from './containers.api'

vi.mock('@/shared/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

const group = { account: { id: 11, username: 'example', domain: 'example.com' }, containers: [] }

const payload: ProxyRulePayload = {
  transport: 'http',
  listen_ip: null,
  listen_port: 8080,
  server_name: null,
  upstream_host: 'example',
  upstream_port: 8080,
  upstream_protocol: 'http',
  enabled: true,
}

describe('containers.api', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('lists the container groups of the service and returns data.data', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [group] } })

    await expect(listContainerGroups(1)).resolves.toEqual([group])
    expect(api.get).toHaveBeenCalledWith('/services/1/containers')
  })

  it('reads a body without the data envelope as the list', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [group] })

    await expect(listContainerGroups(1)).resolves.toEqual([group])
  })

  it('turns a body that is not an array into an empty list', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: { message: 'nope' } } })
    await expect(listContainerGroups(1)).resolves.toEqual([])

    vi.mocked(api.get).mockResolvedValue({ data: null })
    await expect(listProxyRules(1)).resolves.toEqual([])
  })

  it('lists the proxy rules of the service', async () => {
    const rules = [{ id: 4, transport: 'http', upstream_port: 8080, upstream_protocol: 'http', listen_port: 80, server_name: null }]
    vi.mocked(api.get).mockResolvedValue({ data: { data: rules } })

    await expect(listProxyRules(1)).resolves.toEqual(rules)
    expect(api.get).toHaveBeenCalledWith('/services/1/proxy-rules')
  })

  it('posts a project action with its action in the body', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } })

    await projectAction(1, 11, 'up')

    expect(api.post).toHaveBeenCalledWith('/services/1/containers/11/action', { action: 'up' })
  })

  it('posts a container action on the container of the account', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } })

    await serviceAction(1, 11, 'web', 'restart')

    expect(api.post).toHaveBeenCalledWith('/services/1/containers/11/web/action', { action: 'restart' })
  })

  it('encodes the service name in the path of a container action and of its logs', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } })
    vi.mocked(api.get).mockResolvedValue({ data: { data: '' } })

    await serviceAction(1, 11, 'web/../x y', 'stop')
    await containerLogs(1, 11, 'web/../x y')

    expect(api.post).toHaveBeenCalledWith('/services/1/containers/11/web%2F..%2Fx%20y/action', { action: 'stop' })
    expect(api.get).toHaveBeenCalledWith('/services/1/containers/11/web%2F..%2Fx%20y/logs?lines=200')
  })

  it('reads the logs with 200 lines and returns the text', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: 'line 1\nline 2' } })

    await expect(containerLogs(1, 11, 'web')).resolves.toBe('line 1\nline 2')
    expect(api.get).toHaveBeenCalledWith('/services/1/containers/11/web/logs?lines=200')
  })

  it('returns an empty string for logs without text', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: '' } })
    await expect(containerLogs(1, 11, 'web')).resolves.toBe('')

    vi.mocked(api.get).mockResolvedValue({ data: 'plain text' })
    await expect(containerLogs(1, 11, 'web')).resolves.toBe('plain text')
  })

  it('posts a proxy rule to the service and deletes one by id', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } })
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } })

    await createProxyRule(1, payload)
    await deleteProxyRule(1, 4)

    expect(api.post).toHaveBeenCalledWith('/services/1/proxy-rules', payload)
    expect(api.delete).toHaveBeenCalledWith('/services/1/proxy-rules/4')
  })

  it('rejects when the request fails, so the caller can show the error', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Server Error'))

    await expect(listContainerGroups(1)).rejects.toThrow('Server Error')
  })
})
