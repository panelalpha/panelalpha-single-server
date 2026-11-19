import type { Service, ServiceRow } from './services.types'

export type StatusFilterValue = 'active' | 'cancelled' | 'all'

export interface StatusFilterOption {
  text: string
  value: StatusFilterValue
}

/** Instances without a parent. */
export function withInstancesCount (services: Service[]): ServiceRow[] {
  return services.map(service => ({
    ...service,
    instances_count: service.instances.filter(instance => !instance.parent_id).length,
  }))
}

/** The status filter options; `general.all` gets a capital letter on every word. */
export function statusFilterOptions (t: (key: string) => string): StatusFilterOption[] {
  return [
    { text: t('general.active'), value: 'active' },
    { text: t('general.cancelled'), value: 'cancelled' },
    { text: t('general.all').replace(/\b\w/g, char => char.toUpperCase()), value: 'all' },
  ]
}

/** Active is `active` + `suspended`. */
export function filterByStatus<T extends Pick<Service, 'status'>> (services: T[], option: StatusFilterOption | null | undefined): T[] {
  const status = option?.value || 'active'
  if (status === 'cancelled') {
    return services.filter(service => service.status === 'cancelled')
  }
  if (status === 'active') {
    return services.filter(service => service.status === 'active' || service.status === 'suspended')
  }
  return services
}

// The search matches the plan name and the instance count only, not `String(instances)` ("[object Object]").
export const SERVICES_SEARCH_KEYS = ['plan_name', 'instances_count']
