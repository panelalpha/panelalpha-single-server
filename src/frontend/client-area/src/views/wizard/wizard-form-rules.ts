export type Translate = (key: string, options?: Record<string, unknown>) => string

export function serverNameRules (t: Translate): Array<(value: unknown) => true | string> {
  return [
    (value: unknown) => {
      const text = typeof value === 'string' ? value.trim() : ''
      return text !== '' || t('setup.validation.required', { field: t('setup.serverName') })
    },
  ]
}

export function confirmRules (t: Translate, password: () => string): Array<(value: unknown) => true | string> {
  return [
    (value: unknown) => value === password() || t('setup.validation.passwordMismatch'),
  ]
}
