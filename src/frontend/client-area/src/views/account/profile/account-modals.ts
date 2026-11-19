import {
  type FormRule,
  type FormRules,
  passwordPolicyRules,
  type Translate,
} from '@/shared/ui/form/use-form-rules'

export interface AccountModalInputField {
  name: 'current_password' | 'password' | 'password_confirmation' | 'email'
  label: string
  type: 'password' | 'email'
  rules: FormRule[]
}

/** An info entry: bold text, no input, label or rules. */
export interface AccountModalInfoField {
  type: 'info'
  description: string
}

export type AccountModalField = AccountModalInputField | AccountModalInfoField

export interface AccountModalButton {
  label: string
  /** `normal` is the text button (Cancel). */
  color: 'primary' | 'normal'
  /** `cancel` closes; `switch` asks the parent for another modal without validating. */
  type?: 'cancel' | 'switch'
}

export interface AccountModalOptions {
  title: string
  icon: string
  fields: AccountModalField[]
  buttons: AccountModalButton[]
}

/** The buttons of a modal: the primary action first, then Cancel. */
function withCancel (t: Translate, primaryLabel: string, primaryType?: 'switch'): AccountModalButton[] {
  return [
    { label: primaryLabel, color: 'primary', ...(primaryType ? { type: primaryType } : {}) },
    { label: t('button.cancel'), color: 'normal', type: 'cancel' },
  ]
}

/** The current password only has to be given: the server compares it with the stored hash and caps new passwords only. */
function currentPasswordRules (t: Translate): FormRule[] {
  return [v => !!v || t('form.validation.required', { field: t('form.label.passwordCurrent') })]
}

/** `getPassword` reads the live "new password" value. */
export function changePasswordOptions (
  t: Translate,
  getPassword: () => string | null | undefined,
  generated = false,
): AccountModalOptions {
  return {
    title: t(generated ? 'heading.accountPage.modal.setPassword.title' : 'heading.accountPage.modal.changePassword.title'),
    icon: '$lock',
    fields: [
      // A generated password was never seen, so there is no current one to ask for.
      ...(generated
        ? []
        : [{
            label: t('form.label.passwordCurrent'),
            name: 'current_password' as const,
            type: 'password' as const,
            rules: currentPasswordRules(t),
          }]),
      {
        label: t('form.label.passwordNew'),
        name: 'password',
        type: 'password',
        rules: passwordPolicyRules(t, 'form.label.passwordNew'),
      },
      {
        label: t('form.label.passwordConfirm'),
        name: 'password_confirmation',
        type: 'password',
        rules: [
          v => !!v || t('form.validation.required', { field: t('form.label.passwordConfirm') }),
          v => (!!v && !!getPassword() && v === getPassword())
            || t('form.validation.passwordMismatch'),
        ],
      },
    ],
    buttons: withCancel(t, t(generated ? 'button.password.set' : 'button.password.change')),
  }
}

export function changeEmailOptions (
  t: Translate,
  rules: Pick<FormRules, 'emailRules'>,
  generated = false,
): AccountModalOptions {
  // The change needs the current password, which a Connect-created admin does not know.
  if (generated) {
    return {
      title: t('heading.accountPage.modal.changeEmail.title'),
      icon: '$edit',
      fields: [
        { type: 'info', description: t('heading.accountPage.modal.changeEmail.setPasswordFirst') },
      ],
      buttons: withCancel(t, t('button.password.set'), 'switch'),
    }
  }
  return {
    title: t('heading.accountPage.modal.changeEmail.title'),
    icon: '$edit',
    fields: [
      { label: t('form.label.passwordCurrent'), name: 'password', type: 'password', rules: currentPasswordRules(t) },
      { label: t('form.label.emailAddress'), name: 'email', type: 'email', rules: rules.emailRules },
    ],
    buttons: withCancel(t, t('button.emailAddress.change')),
  }
}

interface LaravelError {
  response?: { status?: number, data?: { message?: string, errors?: Record<string, string[] | undefined> } }
}

export function responseStatus (error: unknown): number | undefined {
  return (error as LaravelError).response?.status
}

/** The server message, used by Save and the 2FA calls. */
export function responseMessage (error: unknown): string | undefined {
  return (error as LaravelError).response?.data?.message
}

/** The first error of the field, else the message. */
export function accountModalErrorMessage (error: unknown, field: 'password' | 'email'): string | undefined {
  const data = (error as LaravelError).response?.data
  const messages = data?.errors?.[field]
  return messages?.length ? messages[0] : data?.message
}
