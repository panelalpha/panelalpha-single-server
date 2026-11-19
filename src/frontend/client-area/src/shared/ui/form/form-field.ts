// Defaults of the form field patterns: `PasswordField` and `EmailField` (session screens) and `SettingsSelect`
// (settings selects). One place for the attributes the templates used to repeat. A consumer attribute always wins because Vue merges the
// fallthrough attributes over the root props (`mergeProps(root.props, attrs)`); the filter below only keeps the bound defaults free of keys the
// consumer passes (kebab or camel spelling). `Object.keys(attrs)` is read once (the attrs proxy does not track keys), so a key a consumer adds
// later is still covered by that merge. No key is ever set to `undefined`.

export type FormFieldKind = 'password' | 'email' | 'select'

export interface FormFieldDefaults {
  density?: 'compact'
  flat?: true
  hideDetails?: 'auto'
  prependInnerIcon?: string
  singleLine?: true
  type?: 'password'
  validateOn?: 'blur'
  variant?: 'outlined'
}

// Session fields (login, register, reset password, accept invite, forgot password): one look, the default 48px field (no `v-input--lg`).
// `validateOn: 'blur'` validates on blur; the message is hidden while the field has the focus by `use-hide-error-while-focused.ts`.
const SESSION: FormFieldDefaults = { flat: true, hideDetails: 'auto', singleLine: true, validateOn: 'blur', variant: 'outlined' }

const BY_KIND: Record<FormFieldKind, FormFieldDefaults> = {
  password: { ...SESSION, prependInnerIcon: '$lockoutline', type: 'password' },
  email: { ...SESSION, prependInnerIcon: '$email' },
  select: { density: 'compact', singleLine: true, variant: 'outlined' },
}

function camelize (name: string): string {
  return name.replaceAll(/-(\w)/g, (_, c: string) => c.toUpperCase())
}

export function formFieldDefaults (kind: FormFieldKind, present: readonly string[]): FormFieldDefaults {
  const taken = new Set(present.map(name => camelize(name)))
  const result: FormFieldDefaults = {}
  for (const [key, value] of Object.entries(BY_KIND[kind])) {
    if (!taken.has(key)) {
      Object.assign(result, { [key]: value })
    }
  }
  return result
}
