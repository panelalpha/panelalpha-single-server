import type { PhpSettingRow, SuggestedDirective } from './developer-settings.api'

// Pure functions, no Vue: the card and the modal call them.

function isDirectiveObject (value: unknown): value is { directive: string } {
  return typeof value === 'object' && value !== null && 'directive' in value
}

/** A row from the GET gets `type` / `options` only when a suggestion matches; `editing` is always `false`. */
export function enrichDirective (row: PhpSettingRow, suggested: SuggestedDirective[]): PhpSettingRow {
  const enriched: PhpSettingRow = { ...row, editing: false }
  const match = suggested.find(d => d.directive === row.directive)
  if (match) {
    enriched.type = match.type === 'select' ? 'select' : 'text'
    enriched.options = match.options || []
  }
  return enriched
}

/**
 * Flattens a suggestion object (the combobox can hand back the whole object) to its name, then sets
 * `type` / `options` from the matching suggestion, or `text` / `[]` for a name that is not suggested.
 */
export function applySuggestedMeta (row: PhpSettingRow, suggested: SuggestedDirective[]): void {
  const raw: unknown = row.directive
  const name = isDirectiveObject(raw) ? raw.directive : row.directive
  row.directive = name

  const match = suggested.find(d => d.directive === name)
  if (match) {
    row.type = match.type === 'select' ? 'select' : 'text'
    row.options = match.options || []
  } else {
    row.type = 'text'
    row.options = []
  }
}

/**
 * Applies the suggestion meta, then clears the value when it is a select whose options are not empty
 * and do not contain the current value (a value from outside the list would be invalid).
 */
export function onDirectiveChange (row: PhpSettingRow, suggested: SuggestedDirective[]): void {
  applySuggestedMeta(row, suggested)
  if (row.type === 'select' && row.options && row.options.length > 0 && !row.options.includes(row.value)) {
    row.value = ''
  }
}

/** A new custom row, in edit mode, typed as text with no options. */
export function newDirectiveRow (): PhpSettingRow {
  return { directive: '', value: '', editing: true, type: 'text', options: [] }
}

/** A deep copy of the rows (including `options`), so editing the working copy never touches the card's state. */
export function workingCopy (rows: PhpSettingRow[]): PhpSettingRow[] {
  return rows.map(row => ({
    ...row,
    ...(row.options ? { options: [...row.options] } : {}),
  }))
}
