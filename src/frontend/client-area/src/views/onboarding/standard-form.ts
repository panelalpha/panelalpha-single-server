import type { OnboardingService } from './onboarding-service'
import { cryptoRandom, type RandomSource } from '@/shared/ui/modal/generate-password'

// The pure part of the standard form modal: the form's
// model and its `mounted` defaults, the tab mapping of the install types, and the service flags the form reads. The modal
// keeps the state and the requests; these rules decide.

/** The install types of the three tabs, in tab order. */
export const INSTALL_TYPES = ['clean', 'clone', 'template'] as const
export type InstallType = (typeof INSTALL_TYPES)[number]

export const DOMAIN_PROTOCOLS: readonly string[] = ['https://', 'http://']

/** The languages of the Advanced tab, in legacy order; the label of each is `languages.<code>` (37 entries). */
export const STANDARD_LANGUAGES: readonly string[] = [
  'en', 'ar', 'sq', 'bg_BG', 'ca', 'zh_CN', 'zh_TW', 'hr', 'cs_CZ', 'da_DK', 'nl_NL', 'fi', 'fr_FR', 'de_DE', 'el', 'he_IL', 'hu_HU',
  'id_ID', 'it_IT', 'ja', 'ko_KR', 'nb_NO', 'fa_IR', 'pl_PL', 'pt_PT', 'pt_BR', 'ro_RO', 'ru_RU', 'sl_SI', 'sk_SK', 'es_ES', 'sv_SE',
  'th', 'tr_TR', 'uk', 'vi', 'zh_HK',
]

/** 10 letters and digits (not the BasicModal generator, which adds symbols). */
export const STANDARD_PASSWORD_LENGTH = 10
const PASSWORD_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * The form's values, sent as the base of the install body. The selects that start empty (`version`,
 * `clone_instance_id`, `instance_template_id`) start as `null`, not `''`.
 */
export type StandardFormValues = {
  /** Always `advanced`: the standard form never sends `standard`. */
  install_method: 'advanced'
  install_type: InstallType
  name: string
  domainProtocol: string
  domain: string
  dir: string
  protocol: string
  language: string
  admin_username: string
  admin_password: string
  admin_email: string
  db_name: string
  db_prefix: string
  version: string | null
  instance_template_id: number | string | null
  clone_instance_id: number | string | null
}

/** The form defaults; `admin_email` and `admin_password` are set on mount. */
export function createStandardForm (adminEmail: string, adminPassword: string): StandardFormValues {
  return {
    install_method: 'advanced',
    install_type: 'clean',
    name: '',
    domainProtocol: 'https://',
    domain: '',
    dir: '',
    protocol: 'https://',
    language: 'en',
    admin_username: 'admin',
    admin_password: adminPassword,
    admin_email: adminEmail,
    db_name: '',
    db_prefix: '',
    version: null,
    instance_template_id: null,
    clone_instance_id: null,
  }
}

/**
 * 10 letters and digits. A CSPRNG instead of `Math.random`, as in the shared modal; injectable so tests are deterministic.
 */
export function generateStandardFormPassword (random: RandomSource = cryptoRandom): string {
  let password = ''
  for (let i = 0; i < STANDARD_PASSWORD_LENGTH; i++) {
    password += PASSWORD_CHARS.charAt(Math.floor(random() * PASSWORD_CHARS.length))
  }
  return password
}

/** The tab for an install type: clean 0, clone 1, template 2. An unknown type reads as clean. */
export function tabForInstallType (type: string | null | undefined): number {
  const index = INSTALL_TYPES.indexOf(type as InstallType)
  return index === -1 ? 0 : index
}

/** The install type of a tab index (0 clean, 1 clone, 2 template). */
export function installTypeForTab (tab: number): InstallType {
  return INSTALL_TYPES[tab] ?? 'clean'
}

/**
 * Picking clone with no instance chosen takes the
 * first instance of the list. Mutates `form` (the modal's reactive copy).
 */
export function selectInstallType (form: StandardFormValues, type: InstallType, instances: readonly { id: number | string }[]): void {
  form.install_type = type
  const first = instances[0]
  if (type === 'clone' && (form.clone_instance_id === null || form.clone_instance_id === '') && first) {
    form.clone_instance_id = first.id
  }
}

/**
 * The form fields the loaders fill with the first list entry.
 * A Try again prefill of one of them wins over the loader (a deliberate departure from the legacy race).
 */
export type LoaderField = 'version' | 'clone_instance_id' | 'instance_template_id'
const LOADER_FIELDS: readonly LoaderField[] = ['version', 'clone_instance_id', 'instance_template_id']

/**
 * What a Try again opens the form with: the form's values from
 * `install_details`, the tab of its install type (null when the type is unknown: the tab stays), the directory panel, and the
 * install method the retry request sends back. The form itself keeps `install_method: 'advanced'`, so a later new install never sends `standard`.
 */
export interface StandardFormPrefill {
  values: Partial<StandardFormValues>
  tab: number | null
  subdirectoryOpen: boolean
  installMethod: 'standard' | 'advanced' | null
}

/** The form's own keys only, `install_method` excluded (see the interface). */
const PREFILL_KEYS = (Object.keys(createStandardForm('', '')) as Array<keyof StandardFormValues>)
  .filter(key => key !== 'install_method')

export function prefillFromInstallDetails (details: unknown): StandardFormPrefill {
  const source: Record<string, unknown> = details !== null && typeof details === 'object' ? details as Record<string, unknown> : {}
  const values: Record<string, unknown> = {}
  for (const key of PREFILL_KEYS) {
    if (source[key] !== undefined) {
      values[key] = source[key]
    }
  }
  const type = source.install_type
  const method = source.install_method
  return {
    values: values as Partial<StandardFormValues>,
    tab: typeof type === 'string' && INSTALL_TYPES.includes(type as InstallType) ? tabForInstallType(type) : null,
    subdirectoryOpen: Boolean(source.dir),
    installMethod: method === 'standard' || method === 'advanced' ? method : null,
  }
}

/** The loader fields a prefill sets to a real value: a loader leaves them alone (null or blank means the loader's default applies). */
export function prefilledLoaderFields (values: Partial<StandardFormValues>): LoaderField[] {
  return LOADER_FIELDS.filter(field => values[field] !== undefined && values[field] !== null && values[field] !== '')
}

/**
 * A loader's default: the first list entry goes into the form, unless
 * a Try again prefill already holds that field. The loader answers after the prefill, so the prefill must stay.
 */
export function setLoaderDefault<K extends LoaderField> (
  form: StandardFormValues,
  field: K,
  value: StandardFormValues[K],
  prefilled: readonly LoaderField[],
): void {
  if (!prefilled.includes(field)) {
    form[field] = value
  }
}

/** Any `standard_fields` flag set to `true` opens the Advanced tab. */
export function hasAdvancedFields (standardFields: Record<string, unknown> | undefined): boolean {
  return Object.values(standardFields ?? {}).includes(true)
}

/**
 * The service flags the form reads. Legacy reads them on the service itself; the `onboarding` block of the service type is
 * the fallback (they are typed there), so both shapes work.
 */
export function standardFieldsOf (service: OnboardingService | null | undefined): Record<string, unknown> | undefined {
  return service?.standard_fields ?? service?.onboarding?.standard_fields
}

/** The install type tabs are hidden and the form installs the default. */
export function forcesTemplate (service: OnboardingService | null | undefined): boolean {
  return (service?.standard_force_template ?? service?.onboarding?.standard_force_template) === true
}

/** When off, the version select is locked to the latest. */
export function asksForWordpressVersion (service: OnboardingService | null | undefined): boolean {
  return (service?.ask_for_wordpress_version ?? service?.onboarding?.ask_for_wordpress_version) === true
}
