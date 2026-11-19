/**
 * Selection order: network error, `errors` bag, `message`, `error`, fallback.
 * Unlike legacy, a message of the `errors` bag has no `field: ` prefix: the message
 * names its field already ("The password field must contain at least one number."), so the prefix repeated it.
 * Under app-lite single server string messages go through `rebrandResourceCopy`.
 * Deliberate edge-case deviations from legacy: a non-array bag value is
 * pushed whole (legacy `for...of` splits a string into characters); a truthy non-object `errors`
 * falls through to `message`; `data: null` falls back to `String(error)` (legacy throws).
 */

import type { AxiosError } from 'axios'
import { rebrandResourceCopy } from './resource-paths'

interface ErrorLike {
  response?: {
    data?: {
      errors?: unknown
      message?: unknown
      error?: unknown
      error_code?: unknown
    } | null
  }
}

const NETWORK_ERROR_MESSAGE = 'Something went wrong. Please try again.'

/** Same rule as `axios.isAxiosError`: an object with `isAxiosError === true`. Lets views check for HTTP errors without importing axios. */
export function isApiError (error: unknown): error is AxiosError {
  return typeof error === 'object' && error !== null && (error as { isAxiosError?: unknown }).isAxiosError === true
}

export function getErrorMessages (error: unknown): string[] {
  const response = (error as ErrorLike | null | undefined)?.response
  if (!response) {
    return [NETWORK_ERROR_MESSAGE]
  }

  const data = response.data ?? {}
  const messages: string[] = []

  if (data.errors && typeof data.errors === 'object') {
    for (const list of Object.values(data.errors as Record<string, unknown>)) {
      const items = Array.isArray(list) ? list : [list]
      for (const item of items) {
        messages.push(`${item}`)
      }
    }
  } else if (data.message) {
    messages.push(String(data.message))
  } else if (data.error) {
    messages.push(String(data.error))
  }

  if (messages.length === 0) {
    messages.push(String(error))
  }

  return messages.map(message => rebrandResourceCopy(message))
}

export function getErrorMessage (error: unknown): string {
  return getErrorMessages(error).join(' ')
}

/** The `error_code` of the error body, e.g. `git_working_tree_dirty` from `GitException`. */
export function getErrorCode (error: unknown): string | undefined {
  const code = (error as ErrorLike | null | undefined)?.response?.data?.error_code
  return typeof code === 'string' ? code : undefined
}
