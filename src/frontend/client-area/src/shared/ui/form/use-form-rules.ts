import { useTranslation } from 'i18next-vue'

type RuleValue = string | null | undefined
// Parameter `unknown`, not `RuleValue`, so the arrays fit every kit field (`FieldRule`,
// guarded by `modal/form-rules-fit.type-check.ts`).
export type FormRule = (value: unknown) => true | string
export type CheckboxRule = FormRule
export type Translate = (key: string, options?: Record<string, unknown>) => string

export type FormRules = {
  emailRules: FormRule[]
  nameRules: FormRule[]
  siteNameRules: FormRule[]
  domainRules: FormRule[]
  domainRulesTld: FormRule[]
  checkboxRules: CheckboxRule[]
  adminPasswordRules: FormRule[]
  policyPasswordRules: FormRule[]
  setupPasswordRules: FormRule[]
  urlRules: FormRule[]
  usernameRules: FormRule[]
  passwordRules: FormRule[]
}

// Laravel's `email` rule (RFCValidation) accepts plus tags, subdomains, digits, quoted
// local parts and domain literals. This linear rule refuses only what cannot be an
// address (an empty local part or domain, an empty label, whitespace, a second `@`);
// the server stays the authority for the rest.
const EMAIL_PATTERN = /^(?:"(?:[^"\\]|\\.)*"|[^\s@.]+(?:\.[^\s@.]+)*)@(?:\[[^\s\]]+\]|[^\s@.]+(?:\.[^\s@.]+)*)$/u

// Legacy regexes, kept byte-for-byte so accepted input is identical.
/* eslint-disable regexp/no-unused-capturing-group, regexp/use-ignore-case, regexp/prefer-w, regexp/prefer-d */
const DOMAIN_PATTERN = /^[a-zA-Z0-9.-]*$/
const DOMAIN_TLD_PATTERN = /[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*\.[a-zA-Z]{2,9}(:[0-9]{1,5})?(\/[a-zA-Z0-9_~-]+)*$/
/** The backend's panel-user password policy (`Password::defaults()`: `min(8)`, `max(255)`). */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 255

// Unicode classes, as Laravel's `Password` rule: mixedCase `\p{Ll}` and `\p{Lu}`, numbers `\pN`,
// symbols `\p{Z}`, `\p{S}` and `\p{P}` (a letter such as `é` is not a symbol).
// Used only by the fields that the backend checks with `Password::defaults()`.
export const PASSWORD_LOWER_PATTERN = /\p{Ll}/u
export const PASSWORD_UPPER_PATTERN = /\p{Lu}/u
export const PASSWORD_DIGIT_PATTERN = /\p{N}/u
export const PASSWORD_SYMBOL_PATTERN = /[\p{Z}\p{S}\p{P}]/u

// Setup wizard (`POST /community/setup`, `setupPasswordRules` and the wizard hint): legacy ASCII
// patterns, kept byte-for-byte so accepted input is identical. Do not share them with the
// Unicode constants above.
export const SETUP_PASSWORD_LOWER_PATTERN = /[a-z]/
export const SETUP_PASSWORD_UPPER_PATTERN = /[A-Z]/
export const SETUP_PASSWORD_DIGIT_PATTERN = /[0-9]/
export const SETUP_PASSWORD_SYMBOL_PATTERN = /[^A-Za-z0-9]/
/* eslint-enable regexp/no-unused-capturing-group, regexp/use-ignore-case, regexp/prefer-w, regexp/prefer-d */

/**
 * The rules of every field that sets a panel-user password (reset, invitation, sign-up, change password):
 * `Password::defaults()` of AppServiceProvider, so the field refuses what the server would refuse.
 * `labelKey` names the field in the messages; the change-password dialog names its own.
 */
export function passwordPolicyRules (t: Translate, labelKey = 'form.label.password'): FormRule[] {
  const field = () => t(labelKey)
  // Read as a string, as the legacy rule sets do.
  const length = (v: unknown) => (v as string | null | undefined)?.length ?? 0
  return [
    v => (!!v || t('form.validation.required', { field: field() })) as true | string,
    v => ((length(v) <= PASSWORD_MAX_LENGTH) || t('form.validation.maxLength', { field: field(), length: PASSWORD_MAX_LENGTH })) as true | string,
    v => ((length(v) >= PASSWORD_MIN_LENGTH) || t('form.validation.minLength', { field: field(), length: PASSWORD_MIN_LENGTH })) as true | string,
    v => ([PASSWORD_LOWER_PATTERN, PASSWORD_UPPER_PATTERN, PASSWORD_DIGIT_PATTERN, PASSWORD_SYMBOL_PATTERN].every(pattern => pattern.test(v as string))
      || t('form.validation.passwordCharacters', { field: field() })) as true | string,
  ]
}

/**
 * Legacy `FormRulesMixin` as a composable. Every rule calls `t` when it runs, so a language
 * change applies to the next validation. The messages stay lazy: the arrays hold no text.
 */
export function useFormRules (): FormRules {
  const { t } = useTranslation()
  // Legacy rules are untyped JS; the value is read as a string, as there.
  const rule = (fn: (v: RuleValue) => true | string): FormRule => value => fn(value as RuleValue)

  const required = (labelKey: string): FormRule => rule(v => (
    !!v || t('form.validation.required', { field: t(labelKey) })
  ))
  const maxLength = (labelKey: string, length: number): FormRule => rule(v => (
    (v && v.length <= length) || t('form.validation.maxLength', { field: t(labelKey), length })
  ) as true | string)
  const minLength = (labelKey: string, length: number): FormRule => rule(v => (
    (v && v.length >= length) || t('form.validation.minLength', { field: t(labelKey), length })
  ) as true | string)
  const valid = (labelKey: string, pattern: RegExp): FormRule => rule(v => (
    // `test` coerces like legacy: undefined and null are tested as the strings "undefined" / "null".
    pattern.test(v as string) || t('form.validation.valid', { field: t(labelKey) })
  ))

  return {
    emailRules: [
      required('form.label.email'),
      valid('form.label.email', EMAIL_PATTERN),
    ],
    nameRules: [
      required('form.label.name'),
      maxLength('form.label.name', 10),
    ],
    siteNameRules: [
      required('form.label.siteName'),
      maxLength('form.label.siteName', 25),
    ],
    domainRules: [
      required('form.label.domain'),
      maxLength('form.label.domain', 255),
      minLength('form.label.domain', 4),
      // domain can contain letters, numbers dots hyphen
      valid('form.label.domain', DOMAIN_PATTERN),
    ],
    domainRulesTld: [
      required('form.label.domain'),
      maxLength('form.label.domain', 255),
      minLength('form.label.domain', 4),
      valid('form.label.domain', DOMAIN_TLD_PATTERN),
    ],
    checkboxRules: [
      v => !!v || t('form.validation.required', { field: t('form.label.item') }),
    ],
    adminPasswordRules: [
      required('form.label.password'),
      maxLength('form.label.password', PASSWORD_MAX_LENGTH),
      minLength('form.label.password', 6),
    ],
    policyPasswordRules: passwordPolicyRules(t),
    // Messages come from the `setup.validation.*` keys.
    setupPasswordRules: [
      rule(v => !!v || t('setup.validation.required', { field: t('setup.password') })),
      rule(v => ((v && v.length >= 8) || t('setup.validation.passwordMin')) as true | string),
      // `test` coerces like legacy: undefined and null are tested as the strings "undefined" / "null".
      rule(v => SETUP_PASSWORD_LOWER_PATTERN.test(v as string) || t('setup.validation.passwordLower')),
      rule(v => SETUP_PASSWORD_UPPER_PATTERN.test(v as string) || t('setup.validation.passwordUpper')),
      rule(v => SETUP_PASSWORD_DIGIT_PATTERN.test(v as string) || t('setup.validation.passwordDigit')),
      rule(v => SETUP_PASSWORD_SYMBOL_PATTERN.test(v as string) || t('setup.validation.passwordSymbol')),
    ],
    urlRules: [required('form.label.url')],
    usernameRules: [required('form.label.username')],
    passwordRules: [required('form.label.password')],
  }
}
