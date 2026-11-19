// Shape of `GET /services` as the hosting frame uses it (backend `ServiceResource` / `ServerAccountResource`), plus the
// fields the legacy frame adds to each server account while mapping the response.

export interface HostingServerAccount {
  [key: string]: unknown
  id: number
  domain: string
  additional_domains?: string[]
  main_domain_nameservers?: string[]
  ipv4_addresses?: string[]
  host_c_names?: string[]
  details?: {
    homedir?: string
    mysql_db_prefix?: string
    ip_address?: string
    /** Host the phpMyAdmin SSO flow compares with the DNS record (`DeveloperSettings` reads it too). */
    mysql_php_my_admin_sso_host?: string | null
  } | null
  status?: string
  diagnostic_mode?: boolean
  owned?: boolean
  privileges?: string[]
  /** Added by the frame: `details.homedir` with a trailing `/`. */
  homedir?: string
  mysql_db_prefix?: string
  nameservers?: string[]
  ip_address?: string | null
  /** `cpanel`, `wp-cloud`, … (backend `ServerAccountResource`); Databases reads it for the phpMyAdmin SSO flow. */
  server_type?: string
}

export interface HostingPlanSettings {
  [key: string]: unknown
  instance_limit?: number | null
  dns_management_enabled?: boolean
  allow_user_enable_ssh_access?: boolean
  default_ssh_access_enabled?: boolean
  eager_domain_dns_verification_enabled?: boolean
  /** The domain transfer modal offers the steps (`TransferDomainModal`), otherwise it says transfer is impossible. */
  domain_transfer_enabled?: boolean
}

export interface HostingServerSettings {
  [key: string]: unknown
  /** Add domain asks the backend to verify the domain first (`GET /services/{id}/domains/verify`). */
  domain_transfer_allowed?: boolean
}

export interface HostingDnsSettings {
  [key: string]: unknown
  verification_methods?: unknown[]
  display_options?: unknown[]
  valid_cname_addresses?: string[]
}

export interface HostingService {
  [key: string]: unknown
  id: number
  domain: string
  plan_name: string
  plan_upgrade_link?: string | null
  status: string
  owned?: boolean
  privileges?: string[]
  instances_count?: number | null
  plan_settings: HostingPlanSettings
  server_settings?: HostingServerSettings
  /** `Service::getHostingServerType()`; `wp-cloud` changes the domain types, columns and actions of Domains, and the cron presets. */
  hosting_server_type?: string
  dns_settings?: HostingDnsSettings
  dns_server_enabled?: boolean
  /** Internal DNS server: the account selector shows only with it and with more than one account. */
  dns_server_internal?: boolean
  email_server_enabled?: boolean
  server_accounts: HostingServerAccount[]
  /** Added by the frame: `"${plan_name} - ${domain}"`. */
  name?: string
}

// Shape of `GET /server/metrics/*` (single-server only; engine `ServerMetricsController`).

/** `GET /server/metrics/current`: RAM in KB, disk in bytes. */
export interface ServerMetricsCurrent {
  cpu_usage_percent: number
  ram_total: number
  ram_free?: number
  ram_used: number
  ram_usage_percent: number
  disk_total: number
  disk_free?: number | null
  disk_used: number
  disk_usage_percent: number
  memory_budget?: number
}

export type MetricsPeriod = 'last-5-minutes' | 'last-hour' | 'last-12-hours'

/** One bucket of `GET /server/metrics/{period}`; an empty bucket carries only `period` (`Y-m-d H:i:s`, UTC). */
export interface ServerMetricsBucket {
  [key: string]: number | string | undefined
  period: string
  cpu_percent?: number
  disk_read_bps?: number
  disk_write_bps?: number
  disk_read_iops?: number
  disk_write_iops?: number
  net_in_bps?: number
  net_out_bps?: number
  net_in_pps?: number
  net_out_pps?: number
}

// Shape of the MySQL calls of the Databases screen (backend `Mysql/{Database,User}Controller`). Dates are ISO strings.

/** One row of `GET /server-accounts/{id}/mysql/databases`, newest first. `id` is set on Plesk only (the SSO `database_id`). */
export interface MysqlDatabase {
  id?: number
  database: string
  /** Bytes; the table shows it through `formatBytes`. */
  disk_usage: number
  created_at: string | null
  updated_at: string | null
}

export interface MysqlDatabasesResponse {
  data: MysqlDatabase[]
  meta: { actions?: { rename?: boolean } }
}

/** One row of `GET /server-accounts/{id}/mysql/users`; `databases` are the names the user has privileges on. */
export interface MysqlUser {
  user: string
  databases: string[]
  created_at: string | null
  updated_at: string | null
}

export interface MysqlUsersResponse {
  data: MysqlUser[]
  meta: {
    require_database_to_create: boolean
    privileges_supported: boolean
    rename_supported: boolean
  }
}

/**
 * `GET …/mysql/privileges/{user}/{db}`: the privileges, e.g. `["ALL PRIVILEGES"]`. The Engine-backed
 * panel answers with the raw list as one string (`"ALL PRIVILEGES"`, `"SELECT,INSERT"`), so `data` may be a string too.
 */
export interface MysqlPrivilegesResponse {
  data: string[] | string
}

/** `GET …/mysql/server-info`: the host and port the Access details modal shows. */
export interface MysqlServerInfoResponse {
  data: { host: string, port: number | string }
}
