// Compile-time guard, checked by `npm run type-check` (test files are not type-checked).
// Legacy passes `FormRulesMixin` arrays straight into modal fields,
// so every `useFormRules()` array must fit `ModalField.rules`.
import type { ModalFieldRule } from './basic-modal.types'
import type { FormRules } from '@/shared/ui/form/use-form-rules'

export const formRulesFitModalFields = true satisfies (
  FormRules[keyof FormRules] extends ModalFieldRule[] ? true : false
)
