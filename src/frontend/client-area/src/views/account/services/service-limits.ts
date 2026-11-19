import type { ServiceInstance, ServiceRow } from './services.types'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { limitsSummary, type Translate } from '@/entities/project/project-usage'

// Limits of a plan's project on My plans (paid editions): the Limits column and the Manage limits action, the same summary and modal
// as Project details > Limits. A plan holds one project.

/** A save from the Limits modal of a plan row: the project and whether a limit waits for a rebuild. */
export interface LimitsSaved {
  id: number
  domain: string
  needsRebuild: boolean
}

/** The project of a plan row, fetched (`GET /instances/{id}`) because `/services` lists only its id and domain. */
export type ProjectState
  = | { status: 'loading' }
    | { status: 'ready', instance: InstanceResource }
    | { status: 'failed' }

/** The project a plan row shows the limits of: its first top-level one. A staging copy keeps the limits it was created with. */
export function limitsProject (service: Pick<ServiceRow, 'instances'>): ServiceInstance | null {
  return service.instances.find(instance => !instance.parent_id) ?? null
}

/** A plan row has limits in a paid edition, while the plan is not cancelled and holds a project. */
export function hasLimits (service: Pick<ServiceRow, 'instances' | 'status'>, enabled: boolean): boolean {
  return enabled && service.status !== 'cancelled' && limitsProject(service) !== null
}

/** The fetched project, when it has limits to show: not a staging copy, and a payload with the `resources` block. */
export function limitsInstance (state: ProjectState | undefined): InstanceResource | null {
  if (state?.status !== 'ready' || state.instance.staging || !state.instance.resources) {
    return null
  }
  return state.instance
}

export type LimitsCell
  = | { kind: 'none' }
    | { kind: 'loading' }
    | { kind: 'unlimited' }
    | { kind: 'chips', chips: string[], more: number }

/** What the Limits cell shows: the chips of the main limits that are set and how many others are, as Project details sums them up. */
export function limitsCell (state: ProjectState | undefined, t?: Translate): LimitsCell {
  if (state?.status === 'loading') {
    return { kind: 'loading' }
  }
  const instance = limitsInstance(state)
  if (!instance?.resources) {
    return { kind: 'none' }
  }
  const { main, more } = limitsSummary(instance.resources.limits, t)
  return main.length === 0 && more === 0 ? { kind: 'unlimited' } : { kind: 'chips', chips: main, more }
}
