import type { HomeApp, HomeUser } from '@/shared/session/session.api'
import type { FormRule } from '@/shared/ui/form/use-form-rules'

type Translate = (key: string, options?: Record<string, unknown>) => string

export type SelectItem = {
  text: string
  value: string
}

/** Value of the item a kit select emitted (it emits the item, `returnObject`), or '' when cleared. */
export function selectedValue (item: unknown): string {
  return typeof item === 'object' && item !== null ? String((item as { value?: unknown }).value ?? '') : ''
}

export interface PersonalInformationField {
  title: string
  name: 'first_name' | 'last_name' | 'company_name' | 'language'
  type: 'text' | 'select'
  rules?: FormRule[]
  options?: SelectItem[]
}

export interface AccountFormValue {
  first_name: string
  last_name: string
  company_name: string
  language: string
  new_device_detection: string
}

export const DEVICE_DETECTION_OPTIONS: SelectItem[] = [
  { value: 'ip, device, browser', text: 'deviceDetection.ipDeviceBrowser' },
  { value: 'ip, device', text: 'deviceDetection.ipDevice' },
  { value: 'ip, browser', text: 'deviceDetection.ipBrowser' },
  { value: 'device, browser', text: 'deviceDetection.deviceBrowser' },
  { value: 'ip', text: 'deviceDetection.ip' },
  { value: 'device', text: 'deviceDetection.device' },
  { value: 'browser', text: 'deviceDetection.browser' },
]

const NAME_MAX_LENGTH = 20

export function languageOptions (app: HomeApp | undefined): SelectItem[] {
  return (app?.languages ?? []).map(lang => ({ text: `languages.${lang}`, value: lang }))
}

function nameRules (t: Translate, labelKey: string): FormRule[] {
  return [
    v => !!v || t('form.validation.required', { field: t(labelKey) }),
    v => (typeof v === 'string' && v.length <= NAME_MAX_LENGTH)
      || t('form.validation.maxLength', { field: t(labelKey), length: NAME_MAX_LENGTH }),
  ]
}

/**
 * The language rule is inert in legacy: `SelectDropdown` has no `rules` prop and no `$attrs` passthrough, so it never
  * runs. It is built (and not wired to the select) so the table matches legacy.
 */
export function buildPersonalInformation (t: Translate, languages: SelectItem[]): PersonalInformationField[] {
  return [
    { title: t('form.label.firstName'), name: 'first_name', type: 'text', rules: nameRules(t, 'form.label.firstName') },
    { title: t('form.label.lastName'), name: 'last_name', type: 'text', rules: nameRules(t, 'form.label.lastName') },
    { title: t('form.label.companyName'), name: 'company_name', type: 'text' },
    {
      title: t('form.label.language'),
      name: 'language',
      type: 'select',
      options: languages,
      rules: [v => !!v || t('form.validation.required', { field: t('form.label.language') })],
    },
  ]
}

export function formValueFromUser (user: HomeUser | undefined): AccountFormValue {
  return {
    first_name: String(user?.first_name ?? ''),
    last_name: String(user?.last_name ?? ''),
    company_name: String(user?.company_name ?? ''),
    language: String(user?.language ?? ''),
    new_device_detection: String(user?.new_device_detection ?? ''),
  }
}

export function findOption (options: SelectItem[], value: string | undefined): SelectItem | null {
  return options.find(option => option.value === value) ?? null
}
