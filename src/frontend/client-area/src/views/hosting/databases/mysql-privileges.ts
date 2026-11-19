// Port of the legacy privileges logic (the privileges list, the presets and the checkbox values, and the privileges a
// submitted form grants with the PUT or DELETE that stores them). Plain functions, as `databases-table.ts`.

/** The 18 MySQL privileges, in legacy order. `ALL PRIVILEGES` is a separate checkbox (see `ALL_PRIVILEGES`). */
export const MYSQL_PRIVILEGES: readonly string[] = [
  'ALTER',
  'ALTER ROUTINE',
  'CREATE',
  'CREATE ROUTINE',
  'CREATE TEMPORARY TABLES',
  'CREATE VIEW',
  'DELETE',
  'DROP',
  'EVENT',
  'EXECUTE',
  'INDEX',
  'INSERT',
  'LOCK TABLES',
  'REFERENCES',
  'SELECT',
  'SHOW VIEW',
  'TRIGGER',
  'UPDATE',
]

export const ALL_PRIVILEGES = 'ALL PRIVILEGES'

/** The preset value that shows the checkboxes. */
export const CUSTOM_PRESET = 'custom'

export interface PrivilegePreset {
  /** The value of the preset select and of `privileges_preset`. */
  value: string
  /** i18n key of the label. */
  labelKey: string
  privileges: string[]
}

/** The presets, in order: `determinePreset` returns the first match. */
export const PRIVILEGE_PRESETS: readonly PrivilegePreset[] = [
  { value: 'none', labelKey: 'form.option.none', privileges: [] },
  { value: 'read', labelKey: 'form.option.read', privileges: ['SELECT'] },
  { value: 'read_write', labelKey: 'form.option.readWrite', privileges: ['SELECT', 'DELETE', 'INSERT', 'UPDATE'] },
  { value: 'all', labelKey: 'form.option.full', privileges: [ALL_PRIVILEGES] },
]

/** The privileges a named preset grants. `custom` has none: its checkboxes decide (legacy reads a named preset only). */
export function presetPrivileges (preset: string): string[] {
  return PRIVILEGE_PRESETS.find(item => item.value === preset)?.privileges ?? []
}

/**
 * The same names, order aside. The lists carry no repeats (the backend reads them from the grants),
 * so a membership check in both directions gives the same answer as legacy's sorted compare.
 */
function sameList (a: string[], b: string[]): boolean {
  return a.length === b.length && a.every(privilege => b.includes(privilege)) && b.every(privilege => a.includes(privilege))
}

/** The first preset whose list matches, `custom` when none does. */
export function determinePreset (privileges: string[]): string {
  return PRIVILEGE_PRESETS.find(preset => sameList(preset.privileges, privileges))?.value ?? CUSTOM_PRESET
}

/** The 18 checkboxes follow the list. `ALL PRIVILEGES` is not set here, as in legacy. */
export function checkboxValues (privileges: string[]): Record<string, boolean> {
  return Object.fromEntries(MYSQL_PRIVILEGES.map(privilege => [privilege, privileges.includes(privilege)]))
}

/** Every checkbox, `ALL PRIVILEGES` included. */
export function allCheckboxValues (checked: boolean): Record<string, boolean> {
  return Object.fromEntries([ALL_PRIVILEGES, ...MYSQL_PRIVILEGES].map(name => [name, checked]))
}

/**
 * The privileges a submitted form grants: a named preset gives its list; `custom` gives
 * `ALL PRIVILEGES` when that box is checked, otherwise the checked boxes in legacy order.
 */
export function privilegesFromForm (values: Record<string, unknown>): string[] {
  const preset = String(values.privileges_preset)
  if (preset !== CUSTOM_PRESET) {
    return presetPrivileges(preset)
  }
  if (values[ALL_PRIVILEGES]) {
    return [ALL_PRIVILEGES]
  }
  return MYSQL_PRIVILEGES.filter(privilege => values[privilege])
}

export type PrivilegesRequest
  = | { method: 'PUT', body: { privileges: string } }
    | { method: 'DELETE' }

/** PUT with `A,B`, or DELETE for an empty list (axios sends no body with `delete`). */
export function privilegesRequest (privileges: string[]): PrivilegesRequest {
  if (privileges.length > 0) {
    return { method: 'PUT', body: { privileges: privileges.join(',') } }
  }
  return { method: 'DELETE' }
}
