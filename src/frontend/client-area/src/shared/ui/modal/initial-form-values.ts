import type { ModalField } from './basic-modal.types'

/** The initial `formValues` of `BasicModal`: every named field starts at `null`. */
export function initialFormValues (fields: ModalField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const field of fields) {
    if ('name' in field && field.name !== undefined) {
      values[field.name] = null
    }
  }
  return values
}
