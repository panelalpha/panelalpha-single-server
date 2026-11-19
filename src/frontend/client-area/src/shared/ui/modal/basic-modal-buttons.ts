export type ModalButton = {
  id: string
  label: string
  /** Legacy V2 colour class, now the `color` prop (`primary`, `error`, ...). `normal` is the text button. */
  color: string
  /** `cancel` is exempt from the loading spinner and the confirm gate. */
  type?: string
  customClass?: string
  disabled?: boolean
  /** In `active` loading mode only buttons with `loading: true` spin while submitting. */
  loading?: boolean
  /** `data-testid` of the button itself. */
  testId?: string
  /** A class on the button itself (`customClass` sits on its wrapper): a hook of the consumer (`url-modal-submit`) or the legacy `disabled-gray`. */
  buttonClass?: string
  /** An icon after the label (the Continue arrow, `$arrowright`). */
  appendIcon?: string
  /** Text next to the spinner while the button loads (Hub Disconnect: `settings.hub.disconnecting`). */
  loadingLabel?: string
  /** The button is a link (`href`): Upgrade now of the trial modal. */
  href?: string
}

export type ModalButtonContext = {
  submitting?: boolean
  loading?: boolean
  loadingMode?: string
  confirmRequired?: boolean
  confirmed?: boolean
}

export type ModalButtonState = { loading: boolean, disabled: boolean }

/** The `:loading` / `:disabled` expressions of the modal action buttons. */
export function buttonState (button: ModalButton, context: ModalButtonContext): ModalButtonState {
  const submitting = context.submitting === true
  const active = context.loadingMode === 'active'
  const isCancel = button.type === 'cancel'

  const loading = active
    ? submitting && button.loading === true
    : (submitting || context.loading === true) && !isCancel

  const disabled
    = (context.confirmRequired === true && !isCancel && context.confirmed !== true)
      || button.disabled === true
      || (active && submitting && button.loading !== true)

  return { loading, disabled }
}
