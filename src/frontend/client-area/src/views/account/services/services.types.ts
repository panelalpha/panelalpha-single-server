export interface ServiceInstance {
  id: number
  domain: string
  domain_type?: string | null
  parent_id?: number | null
}

/** `GET /services` row, as the legacy screen reads it. */
export interface Service {
  id: number
  plan_name: string
  status: 'active' | 'suspended' | 'cancelled' | string
  is_trial?: boolean
  trial_expiry_at?: string | null
  plan_settings: { instance_limit: number | string }
  plan_upgrade_link?: string | null
  instances: ServiceInstance[]
}

/** The row the table works on: `loadServices` adds the number of top-level instances. */
export interface ServiceRow extends Service {
  instances_count: number
}
