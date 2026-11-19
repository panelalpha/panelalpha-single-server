import type { WordpressConnectionResult } from './onboarding.api'
import { rebrandResourceCopy } from '@/shared/api/resource-paths'

/** What a connection test leads to. `unknown` is the legacy fall-through to `notification.connectionFailed`. */
export type PluginConnectionOutcome = 'error' | 'connection_error' | 'warning' | 'success' | 'unknown'
export type FtpConnectionOutcome = 'error' | 'warning' | 'success' | 'unknown'

/**
 * The plugin contract: `error_type` is checked in order, then `success`.
 * A `success` flag alone is not enough when `error_type` names an outcome.
 */
export function pluginOutcome (result: WordpressConnectionResult): PluginConnectionOutcome {
  if (result.error_type === 'error') {
    return 'error'
  }
  if (result.error_type === 'connection_error') {
    return 'connection_error'
  }
  if (result.error_type === 'warning') {
    return 'warning'
  }
  if (result.success === true) {
    return 'success'
  }
  return 'unknown'
}

/**
 * The sentence an unsuccessful answer shows: its own `message`, or the flow's failure sentence when it carries none.
 * Rebranded like the panel's HTTP errors.
 */
export function failureMessage (result: WordpressConnectionResult, fallback: string): string {
  const message = result.message ?? ''
  return message.trim() === '' ? fallback : rebrandResourceCopy(message)
}

/** The FTP contract: `severity` is checked in order, then `success`. */
export function ftpOutcome (result: WordpressConnectionResult): FtpConnectionOutcome {
  if (result.severity === 'error') {
    return 'error'
  }
  if (result.severity === 'warning') {
    return 'warning'
  }
  if (result.success === true) {
    return 'success'
  }
  return 'unknown'
}
