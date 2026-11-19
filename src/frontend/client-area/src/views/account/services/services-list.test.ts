import type { Service } from './services.types'
import { describe, expect, it } from 'vitest'
import { filterByStatus, SERVICES_SEARCH_KEYS, statusFilterOptions, withInstancesCount } from './services-list'

function service (id: number, status: string, instances: Service['instances'] = []): Service {
  return { id, plan_name: `Plan ${id}`, status, plan_settings: { instance_limit: 5 }, instances }
}

describe('services-list', () => {
  it('counts only instances without a parent', () => {
    const rows = withInstancesCount([
      service(1, 'active', [
        { id: 1, domain: 'a.test' },
        { id: 2, domain: 'b.test', parent_id: 1 },
        { id: 3, domain: 'c.test', parent_id: null },
      ]),
      service(2, 'active'),
    ])
    expect(rows.map(row => row.instances_count)).toEqual([2, 0])
    expect(rows[0]!.instances).toHaveLength(3)
  })

  it('offers Active, Cancelled and All with a capital letter on every word', () => {
    const options = statusFilterOptions(key => (key === 'general.all' ? 'all plans' : key))
    expect(options).toEqual([
      { text: 'general.active', value: 'active' },
      { text: 'general.cancelled', value: 'cancelled' },
      { text: 'All Plans', value: 'all' },
    ])
  })

  it('filters Active as active + suspended, Cancelled as cancelled, All as everything', () => {
    const list = [service(1, 'active'), service(2, 'suspended'), service(3, 'cancelled')]
    const [active, cancelled, all] = statusFilterOptions(key => key)
    expect(filterByStatus(list, active).map(item => item.id)).toEqual([1, 2])
    expect(filterByStatus(list, cancelled).map(item => item.id)).toEqual([3])
    expect(filterByStatus(list, all).map(item => item.id)).toEqual([1, 2, 3])
    expect(filterByStatus(list, null).map(item => item.id)).toEqual([1, 2])
  })

  it('searches the plan name and the instance count only (D3)', () => {
    expect(SERVICES_SEARCH_KEYS).toEqual(['plan_name', 'instances_count'])
  })
})
