import { getErrorMessages } from '@/shared/api/error-message'

interface ResponseLike {
  response?: {
    status?: number
    data?: {
      message?: string
      errors?: Record<string, unknown> | unknown[]
    } | null
  }
}

/** Legacy `Login.vue` strips only the first dot of each message. */
function stripFirstDot (message: unknown): string {
  return String(message).replace('.', '')
}

function asList (value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * Deliberate deviation: where legacy throws inside the catch and shows
 * nothing new (no response, 429 without `message`, no `errors` bag) or would show nothing
 * (empty bag / non-array values), this falls back to `getErrorMessages`.
 */
export function loginSubmitErrors (error: unknown): string[] {
  const response = (error as ResponseLike | null | undefined)?.response
  if (!response) {
    return getErrorMessages(error)
  }
  const data = response.data
  if (response.status === 429 && data?.message) {
    return [stripFirstDot(data.message)]
  }
  const bag = data?.errors
  if (!bag || typeof bag !== 'object') {
    return getErrorMessages(error)
  }
  const lists: unknown[] = Array.isArray(bag) ? bag : Object.values(bag)
  const messages = lists.flatMap(list => asList(list).map(item => stripFirstDot(item)))
  return messages.length > 0 ? messages : getErrorMessages(error)
}

export function twoFactorErrors (error: unknown, code: string): string[] {
  const response = (error as ResponseLike | null | undefined)?.response
  if (!response) {
    return getErrorMessages(error)
  }
  const data = response.data
  if (response.status === 429 && data?.message) {
    return [stripFirstDot(data.message)]
  }
  const bag = (data?.errors ?? {}) as Record<string, unknown>
  const list = code.length <= 6 ? bag.code : bag.recovery_code
  if (!Array.isArray(list)) {
    return getErrorMessages(error)
  }
  return list.map(item => stripFirstDot(item))
}
