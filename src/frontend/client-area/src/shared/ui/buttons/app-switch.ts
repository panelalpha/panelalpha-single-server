// Defaults of the `AppSwitch` `kind`. One place for the attributes the switches used to repeat in their templates.
// Two families: settings switches (`toggle`) and form-field switches (`inset`). A key the consumer already passes (in the kebab or the camel
// spelling) is never set here, so a consumer attribute always wins, and no key is ever set to `undefined`.

export type AppSwitchKind = 'toggle' | 'inset'

export interface AppSwitchDefaults {
  color?: 'primary'
  flat?: true
  inset?: true
  hideDetails?: true
  thumbColor?: string
}

// White thumb in both states, like legacy (V2 `color` only sets the thumb `color`); without it V4 paints the on thumb
// with `bg-<color>`, a green thumb on the green track.
const THUMB = 'var(--v-white-base)'
const TOGGLE: AppSwitchDefaults = { color: 'primary', flat: true, hideDetails: true, thumbColor: THUMB }
const INSET: AppSwitchDefaults = { color: 'primary', inset: true, hideDetails: true, thumbColor: THUMB }

function camelize (name: string): string {
  return name.replaceAll(/-(\w)/g, (_, c: string) => c.toUpperCase())
}

export function appSwitchDefaults (kind: AppSwitchKind | undefined, present: readonly string[]): AppSwitchDefaults {
  const base = kind === 'toggle' ? TOGGLE : (kind === 'inset' ? INSET : {})
  const taken = new Set(present.map(name => camelize(name)))
  const result: AppSwitchDefaults = {}
  for (const [key, value] of Object.entries(base)) {
    if (!taken.has(key)) {
      Object.assign(result, { [key]: value })
    }
  }
  return result
}
