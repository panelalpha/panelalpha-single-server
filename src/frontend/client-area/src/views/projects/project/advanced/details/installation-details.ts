/** `GET /instances/{id}/installation-details` → `data.data`. */
export interface InstallationDetails {
  directory: string
  database_name: string
  database_user: string
  database_password: string
  database_host: string
  redis_host: string | null
  redis_port: string | number | null
  redis_password: string | null
}

export type RedisField = 'host' | 'port' | 'password'

export interface RedisRow {
  field: RedisField
  /** `null` for a password that is not set; the card shows `general.noPassword` in italics for it. */
  value: string | number | null
}

/**
 * The redis rows exist only when `redis_host` is set. The host and port fall back to
 * `127.0.0.1` and `6379`, as in legacy (the fallback host is never reached while the rows are rendered at all).
 */
export function redisRows (details: Partial<InstallationDetails>): RedisRow[] {
  if (!details.redis_host) {
    return []
  }

  return [
    { field: 'host', value: details.redis_host || '127.0.0.1' },
    { field: 'port', value: details.redis_port || '6379' },
    { field: 'password', value: details.redis_password || null },
  ]
}
