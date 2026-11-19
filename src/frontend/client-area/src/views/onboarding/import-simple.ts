import type { WordpressConnectionBody, WordpressConnectionResult } from './onboarding.api'
import { apiBaseUrl } from '@/shared/api/client'

// The WordPress admin login form of the plugin
// import. The modal keeps the state and the DOM; this module holds the rules that do not need them.

/** The path legacy appends to a bare site url. */
const LOGIN_PATH = '/wp-login.php'

/** Legacy host-only pattern: a scheme, a host and an optional trailing slash, nothing else. */
const HOST_ONLY_PATTERN = /^https?:\/\/[^/]+\/?$/i

/** A protocol check: an `http://` or `https://` scheme, in any case. */
const PROTOCOL_PATTERN = /^https?:\/\//i

/**
 * What the plugin form reads: the import data of the URL step and the
 * admin login fields.
 */
export interface PluginFormValues {
  importUrl: string | null | undefined
  importIp: string | null | undefined
  loginUrl: string
  username: string
  password: string
}

/**
 * The login url starts from the site url. A site url with a root path
 * (or none) gets `/wp-login.php`; any other url is kept as it is. The trailing slash of the site url is dropped first.
 */
export function initialLoginUrl (url: string | null | undefined): string {
  const rawUrl = (url ?? '').trim()
  if (!rawUrl) {
    return ''
  }

  let isRootUrl: boolean
  try {
    const parsed = new URL(rawUrl)
    isRootUrl = parsed.pathname === '/' || parsed.pathname === ''
  } catch {
    isRootUrl = HOST_ONLY_PATTERN.test(rawUrl)
  }

  if (!isRootUrl) {
    return rawUrl
  }
  return `${rawUrl.replace(/\/$/, '')}${LOGIN_PATH}`
}

/**
 * Run on the login url's blur: an empty field becomes `https://` (legacy, kept as
 * it is), a url with no scheme gets `https://` in front, a url with a scheme is kept as typed.
 */
export function normalizeLoginUrl (value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') {
    return 'https://'
  }
  return PROTOCOL_PATTERN.test(trimmed) ? value : `https://${trimmed}`
}

/**
 * The plugin shape of `POST /instances/import/test-wordpress-connection`. Every value is
 * trimmed as legacy trims it; `using_admin_login_credentials` is true only while the admin login panel is the open one. `ip_address`
 * goes only when the import data holds one.
 */
export function buildPluginTestBody (values: PluginFormValues, serviceId: number | string, panelOpen: number | null | undefined): WordpressConnectionBody {
  const ipAddress = (values.importIp ?? '').trim()
  return {
    type: 'plugin',
    service_id: serviceId,
    url: (values.importUrl ?? '').trim(),
    login_url: values.loginUrl.trim(),
    username: values.username,
    password: values.password,
    using_admin_login_credentials: panelOpen === 0,
    ...(ipAddress ? { ip_address: ipAddress } : {}),
  }
}

/** The API base plus the plugin download path. */
export function pluginDownloadUrl (): string {
  return `${apiBaseUrl()}/instances/import/download-plugin`
}

/**
 * What the import step receives from a successful connection test: the answer's `import_details` (the site's own url and login url)
 * plus the password typed here, which the panel never echoes back. The manual plugin method has no password.
 */
export function handOnDetails (result: WordpressConnectionResult, password: string): Record<string, unknown> {
  const details: Record<string, unknown> = { ...result.import_details }
  if (details.using_admin_login_credentials === true) {
    details.password = password
  }
  return details
}
