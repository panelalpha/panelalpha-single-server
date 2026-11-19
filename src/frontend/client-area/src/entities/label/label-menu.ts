/** Palette of the add-label panel, in legacy order. */
export const LABEL_COLORS: readonly string[] = [
  '#EB6464',
  '#EB64AD',
  '#EB64D5',
  '#D064EB',
  '#9F64EB',
  '#6764EB',
  '#448ED6',
  '#44B3D6',
  '#44CDD6',
  '#44D6BB',
  '#44D690',
  '#51CC56',
  '#07C07E',
  '#91D23E',
  '#C9BC44',
  '#C5944B',
  '#EE8F49',
  '#D72E23',
]

/** Legacy limits of a new label title. */
export const LABEL_TITLE_MIN_LENGTH = 3
export const LABEL_TITLE_MAX_LENGTH = 18

/** Which check of `validateNewLabel` failed; the component turns it into the legacy `form.validation.*` copy. */
export type LabelValidationError = 'min-length' | 'max-length' | 'color-required'

export interface LabelIdentity {
  id?: unknown
  title: string
  color?: string
}

/**
 * Same label on both sides. A pair with ids compares by id (the account list, when the server sends one). Otherwise it
 * falls back to the legacy identity, title and colour.
 */
export function isSameLabel (a: LabelIdentity, b: LabelIdentity): boolean {
  if (a.id !== undefined && b.id !== undefined) {
    return a.id === b.id
  }
  return a.title === b.title && a.color === b.color
}

/** Account labels not yet on the instance, matched by title only. */
export function labelsToAssign<T extends { title: string }> (accountLabels: T[], instanceLabels: Array<{ title: string }>): T[] {
  const assigned = new Set(instanceLabels.map(label => label.title))
  return accountLabels.filter(label => !assigned.has(label.title))
}

/**
 * Validation of a new label, in the legacy order: title shorter than 3, then longer than 18, then no colour.
 * Returns `null` when the label may be created.
 */
export function validateNewLabel (label: { title: string, color?: string }): LabelValidationError | null {
  if (label.title.length < LABEL_TITLE_MIN_LENGTH) {
    return 'min-length'
  }
  if (label.title.length > LABEL_TITLE_MAX_LENGTH) {
    return 'max-length'
  }
  if (!label.color) {
    return 'color-required'
  }
  return null
}

/**
 * Top of the labels menu in the viewport (legacy `offset-y` + `nudge-bottom="8px"`): under the activator, and moved up when it would
 * end below the viewport minus `margin`. Legacy V2 never flips it above the activator; V4 would, so the component uses this instead.
 */
export function labelMenuTop (activatorBottom: number, contentHeight: number, viewportHeight: number, gap = 8, margin = 12): number {
  return Math.max(margin, Math.min(activatorBottom + gap, viewportHeight - margin - contentHeight))
}

/**
 * Left of the labels menu in the viewport (legacy `width="100vw"`, `max-width="354px"`, shifted left when it would end past the
 * viewport minus 12px). Same rule as the top: legacy V2 shifts to fit, V4 would clamp to its own margin instead.
 */
export function labelMenuLeft (activatorLeft: number, contentWidth: number, viewportWidth: number, margin = 12): number {
  return Math.max(0, Math.min(activatorLeft, viewportWidth - margin - contentWidth))
}
