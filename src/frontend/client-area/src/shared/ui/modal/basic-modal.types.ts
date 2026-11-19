import type { FieldRule } from '@/shared/ui/form/field-rule'
// The `modalOptions` / `formFields` shapes of legacy, consumed by `BasicModal`.
import type { InjectionKey, Ref } from 'vue'

export type { ModalButton } from './basic-modal-buttons'

/**
 * The grey item box of an install dialog with a rating: the name, then the kit star
 * and the number. The star is a component, so this cannot be the `targetBox` HTML. `border` and `flat` pick the box look like the
 * arguments of `targetItemBox` (plugins: `gray-lighten3` with a 16px top margin; themes: `gray-lighten2` and `flat`); `labelHtml` comes in
 * already escaped.
 */
export type ModalTargetRatingBox = {
  labelHtml: string
  rating: string
  /** Share of the star that is filled, 0 to 1. */
  percent?: number
  border?: 'gray-lighten3' | 'gray-lighten2'
  flat?: boolean
}

export type ModalAffixLink = {
  /** `a href` when true, `router-link` otherwise. */
  external?: boolean
  hidden?: boolean
  url: string
  message: string
}

export type ModalFieldRule = FieldRule

export type ModalSelectOption = {
  [key: string]: unknown
  label: string
  value: unknown
}

export type ModalInputDefinition = {
  name: string
  placeholder?: string
  readonly?: boolean
  prefix?: string
  suffix?: string
}

type ModalFieldBase = {
  label?: string
  /** i18n key, translated by the renderer. */
  tooltip?: string
  description?: string
  required?: boolean
  rules?: ModalFieldRule[]
  hidden?: boolean
  loading?: boolean
}

export type ModalTextField = ModalFieldBase & {
  type: 'text'
  name: string
  placeholder?: string
  readonly?: boolean
  prefix?: string
  suffix?: string
  /** A message the screen holds for this field (a refused request), shown like a rule's own. */
  errorMessages?: string[]
}

export type ModalMultiTextField = ModalFieldBase & {
  type: 'multiText'
  inputs: ModalInputDefinition[]
}

export type ModalTextSelectField = ModalFieldBase & {
  type: 'text-select'
  textName: string
  selectName: string
  options: ModalSelectOption[]
  suffix?: string
  placeholder?: string
}

export type ModalDomainInputField = ModalFieldBase & {
  type: 'domain-input'
  textName: string
  placeholder?: string
  /** A message the screen holds for this field (a refused request), shown like a rule's own. */
  errorMessages?: string[]
}

export type ModalSelectField = ModalFieldBase & {
  type: 'select'
  name: string
  options: ModalSelectOption[]
  multiple?: boolean
  readonly?: boolean
  customClass?: string
  /**
   * A select named `role` shows its options as plain text (`UserRoleLabel` is not rendered). Lite-only screens set it, as lite
   * comments the role slots out. Default (unset) is the app behaviour.
   */
  plainOptions?: boolean
}

/**
 * A select whose text the user may also type: a branch name the list does not offer is still sent (the server refuses it with its own
 * message), where a plain select would keep the value picked before and report success for something else (the Git Branch dialog).
 */
export type ModalComboboxField = ModalFieldBase & {
  type: 'combobox'
  name: string
  options: ModalSelectOption[]
  readonly?: boolean
  customClass?: string
}

export type ModalCheckboxField = ModalFieldBase & {
  type: 'checkbox'
  name: string
  /** HTML (`v-safe-html`, profile `copy`), rendered above the checkbox; escape interpolated API/user values. */
  message?: string
  messageClass?: string
}

export type ModalTextareaField = ModalFieldBase & {
  type: 'textarea'
  name: string
  placeholder?: string
  height?: number | string
  /** HTML (`v-safe-html`, profile `copy`), rendered above the textarea; escape interpolated API/user values. */
  message?: string
  messageClass?: string
}

export type ModalGeneratePasswordField = ModalFieldBase & {
  type: 'generatePassword'
  name: string
  /** A refused request's message, shown like a rule's own. */
  errorMessages?: string[]
}

export type ModalPasswordField = ModalFieldBase & {
  type: 'password'
  name: string
  /** A refused request's message, shown like a rule's own. */
  errorMessages?: string[]
}

export type ModalHiddenPasswordField = ModalFieldBase & {
  type: 'hiddenPassword'
  name?: string
}

export type ModalSwitchField = ModalFieldBase & {
  type: 'switch'
  name: string
}

export type ModalField
  = | ModalTextField
    | ModalMultiTextField
    | ModalTextSelectField
    | ModalDomainInputField
    | ModalSelectField
    | ModalComboboxField
    | ModalCheckboxField
    | ModalTextareaField
    | ModalGeneratePasswordField
    | ModalPasswordField
    | ModalHiddenPasswordField
    | ModalSwitchField

/**
 * Legacy kept the password visibility flag in `BasicModal` data, shared by every password field of the modal.
 * `BasicModal` provides the ref; `BasicModalField` falls back to its own when used outside a modal.
 */
export const showPasswordKey: InjectionKey<Ref<boolean>> = Symbol('basic-modal-show-password')
