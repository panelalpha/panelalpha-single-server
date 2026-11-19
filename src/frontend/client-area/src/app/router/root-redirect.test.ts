import type { HomeResponse } from '@/shared/session/session.api'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { instancesRoutes } from '@/views/projects/instances.routes'
import InstancesView from '@/views/projects/InstancesView.vue'
import { resolveRootRedirect } from './root-redirect'

const singleServer = { app: { single_server: { active: true } } } as unknown as HomeResponse
const multiServer = { app: {} } as unknown as HomeResponse

describe('resolveRootRedirect', () => {
  it('leads / to /projects under single server', () => {
    expect(resolveRootRedirect({ name: 'home' }, singleServer)).toEqual({ path: '/projects', replace: true })
  })

  it('leads / to /instances without single server or home', () => {
    expect(resolveRootRedirect({ name: 'home' }, multiServer)).toEqual({ path: '/instances', replace: true })
    expect(resolveRootRedirect({ name: 'home' }, null)).toEqual({ path: '/instances', replace: true })
  })

  it('leaves every other route alone', () => {
    expect(resolveRootRedirect({ name: 'projects' }, singleServer)).toBeUndefined()
    expect(resolveRootRedirect({ name: 'instances' }, singleServer)).toBeUndefined()
  })
})

describe('instances routes', () => {
  const router = createRouter({ history: createMemoryHistory(), routes: instancesRoutes })

  it('renders the same list on /projects and /instances, with no redirect between them', async () => {
    const projects = router.resolve('/projects')
    const instances = router.resolve('/instances')
    expect(projects.name).toBe('projects')
    expect(instances.name).toBe('instances')
    // One lazy loader for both records (a single chunk), resolving to the list view.
    const loader = projects.matched[0]!.components!.default as () => Promise<{ default: unknown }>
    expect(instances.matched[0]!.components!.default).toBe(loader)
    expect((await loader()).default).toBe(InstancesView)
    expect(projects.matched[0]!.redirect).toBeUndefined()
    expect(projects.meta).toEqual({ requiresAuth: true, displayNavbar: true, title: 'projects' })
  })
})
