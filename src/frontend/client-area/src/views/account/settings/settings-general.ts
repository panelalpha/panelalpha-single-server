// The pure half of the General form.
import { formatDate } from '@/shared/time/date-format'

/** The request keys whose 422 errors show under a field of the General form. */
export const GENERAL_FIELDS = ['name', 'default_language', 'default_date_format']

export interface GeneralForm {
  name: string
  defaultLanguage: string
  defaultDateFormat: string
}

export interface SelectItem {
  title: string
  value: string
}

export type Translate = (key: string, options?: Record<string, unknown>) => string

/** Save is active only while some field differs (strictly) from the last load or save. */
export function generalChanged (form: GeneralForm, saved: GeneralForm): boolean {
  return (Object.keys(form) as Array<keyof GeneralForm>).some(key => form[key] !== saved[key])
}

/** The `name` rules: required after trim, at most 255 characters. Each returns `true` or the message. */
export function nameRules (t: Translate): Array<(value: string | null | undefined) => true | string> {
  return [
    value => !!(value && value.trim()) || t('settings.validation.required', { field: t('settings.name') }),
    value => !value || value.length <= 255 || t('settings.validation.maxLength', { length: 255 }),
  ]
}

/** `languages.<code>` when it is translated, otherwise the code itself. */
export function languageItems (languages: string[], t: Translate): SelectItem[] {
  return languages.map(code => {
    const key = `languages.${code}`
    const label = t(key)
    return { title: label && label !== key ? label : code, value: code }
  })
}

/** `<format> — <today in that format>`. */
export function dateFormatItems (formats: string[], now: Date = new Date()): SelectItem[] {
  return formats.map(format => ({ title: `${format} — ${formatDate(now, { format })}`, value: format }))
}
