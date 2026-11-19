import type { ProjectState } from './service-limits'
import type { ServiceRow } from './services.types'
import type { HomeLike, RawProjectResources } from '@/entities/project/instance-resource'
import { ref } from 'vue'
import { getInstance } from '@/entities/project/project-limits.api'
import { hasLimits, limitsProject } from './service-limits'

/**
 * The projects of the plan rows whose limits the table shows (paid editions). `/services` lists only a project's id and domain, so
 * each one is fetched (`GET /instances/{id}`) once: a reload of the list (sort, page, search) keeps what is already loaded or loading,
 * and a project that failed is not asked for again until the page opens anew. A save in the Limits modal goes through `updateResources`,
 * and the map is reactive, so the Limits cell follows.
 */
export function useServiceProjects () {
  const projects = ref(new Map<number, ProjectState>())

  async function fetchOne (id: number, home: HomeLike | null | undefined): Promise<void> {
    projects.value.set(id, { status: 'loading' })
    try {
      projects.value.set(id, { status: 'ready', instance: await getInstance(id, home) })
    } catch {
      projects.value.set(id, { status: 'failed' })
    }
  }

  async function load (services: ServiceRow[], enabled: boolean, home: HomeLike | null | undefined): Promise<void> {
    const ids = services
      .filter(service => hasLimits(service, enabled))
      .map(service => limitsProject(service)!.id)
      .filter((id, index, list) => list.indexOf(id) === index && !projects.value.has(id))
    await Promise.all(ids.map(id => fetchOne(id, home)))
  }

  function stateOf (service: ServiceRow, enabled: boolean): ProjectState | undefined {
    const project = hasLimits(service, enabled) ? limitsProject(service) : null
    return project ? projects.value.get(project.id) : undefined
  }

  /** A save in the Limits modal: the answer is the project's new `resources` block. */
  function updateResources (id: number, resources: RawProjectResources): void {
    const state = projects.value.get(id)
    if (state?.status === 'ready') {
      state.instance.resources = resources
    }
  }

  return { projects, load, stateOf, updateResources }
}
