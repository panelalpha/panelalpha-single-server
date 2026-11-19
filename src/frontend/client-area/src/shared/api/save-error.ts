// Shared by the account Settings tabs and the project Limits modal, so
// neither view group imports the other one.
import { getErrorMessages } from '@/shared/api/error-message'

export interface SaveFailure {
  fields: Record<string, string[]>
  messages: string[]
}

/**
 * A 422 gives the messages of the request keys in `fieldKeys` for which `isShown(key)` holds,
 * by key and without the key's prefix, and the rest in a list for the tab. Any other failure gives `null`: the caller shows a toast.
 */
export function splitSaveError (error: unknown, fieldKeys: string[], isShown: (key: string) => boolean = () => true): SaveFailure | null {
  const response = (error as { response?: { status?: number, data?: { errors?: unknown } } } | null | undefined)?.response
  if (!response || response.status !== 422) {
    return null
  }
  const raw = (response.data?.errors && typeof response.data.errors === 'object' ? response.data.errors : {}) as Record<string, unknown>
  const fields: Record<string, string[]> = {}
  const messages: string[] = []
  for (const key of Object.keys(raw)) {
    const list = (Array.isArray(raw[key]) ? raw[key] : [raw[key]]).map(String)
    if (fieldKeys.includes(key) && isShown(key)) {
      fields[key] = list
    } else {
      messages.push(...list)
    }
  }
  // A 422 with only a `message`.
  if (Object.keys(raw).length === 0) {
    messages.push(...getErrorMessages(error))
  }
  return { fields, messages }
}
