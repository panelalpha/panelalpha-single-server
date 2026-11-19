import type { ServiceRow } from './services.types'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useServiceProjects } from './use-service-projects'

const apiMock = vi.hoisted(() => ({ getInstance: vi.fn() }))

vi.mock('@/entities/project/project-limits.api', () => ({ getInstance: apiMock.getInstance }))

function service (id: number, status = 'active', instances: ServiceRow['instances'] = [{ id: id * 10, domain: `p${id}.test` }]): ServiceRow {
  return { id, plan_name: `Plan ${id}`, status, plan_settings: { instance_limit: 1 }, instances, instances_count: instances.length }
}

describe('useServiceProjects', () => {
  beforeEach(() => {
    apiMock.getInstance.mockReset()
    apiMock.getInstance.mockImplementation(async (id: number) => ({ id, resources: null }) as unknown as InstanceResource)
  })

  it('fetches the project of each plan with limits, once, and not for cancelled or empty plans', async () => {
    const { load, stateOf } = useServiceProjects()
    const rows = [service(1), service(2, 'cancelled'), service(3, 'active', [])]

    await load(rows, true, null)
    await load(rows, true, null)

    expect(apiMock.getInstance).toHaveBeenCalledTimes(1)
    expect(apiMock.getInstance).toHaveBeenCalledWith(10, null)
    expect(stateOf(rows[0]!, true)?.status).toBe('ready')
    expect(stateOf(rows[1]!, true)).toBeUndefined()
  })

  it('fetches nothing in the Community panel', async () => {
    const { load } = useServiceProjects()
    await load([service(1)], false, null)
    expect(apiMock.getInstance).not.toHaveBeenCalled()
  })

  it('marks a project that failed and does not ask for it again', async () => {
    apiMock.getInstance.mockRejectedValue(new Error('down'))
    const { load, stateOf } = useServiceProjects()

    await load([service(1)], true, null)
    await load([service(1)], true, null)

    expect(stateOf(service(1), true)?.status).toBe('failed')
    expect(apiMock.getInstance).toHaveBeenCalledTimes(1)
  })

  it('shows loading while the request runs and keeps the resources of a save', async () => {
    let resolve: (value: InstanceResource) => void = () => {}
    apiMock.getInstance.mockReturnValue(new Promise(done => {
      resolve = done
    }))
    const { load, stateOf, updateResources } = useServiceProjects()

    const loading = load([service(1)], true, null)
    expect(stateOf(service(1), true)?.status).toBe('loading')
    resolve({ id: 10, resources: null } as unknown as InstanceResource)
    await loading
    await flushPromises()

    const resources = { usage: null, disk: null, limits: {}, ceilings: {} } as never
    updateResources(10, resources)
    const state = stateOf(service(1), true)
    expect(state?.status === 'ready' && state.instance.resources).toEqual(resources)
  })
})
