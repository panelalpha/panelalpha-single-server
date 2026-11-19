import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
import type { ModalField, ModalTargetRatingBox } from '@/shared/ui/modal/basic-modal.types'

// Shape of the dialog the action builders return: the kit `BasicModal` props (`props`),
// the fields its default slot renders (`fields`) and the width the host sets on the card. The modal types of a domain are its own union
// (`ProjectModalType` in `@/entities/project/action-modal`); the kit only knows the type is a string.

export type Translate = (key: string, options?: Record<string, unknown>) => string

export const MODAL_WIDTH = '560px'

/** The cancel button every modal starts with. */
export function cancelButton (t: Translate): ModalButton {
  return { id: 'cancel', label: t('button.cancel'), type: 'cancel', color: 'normal', customClass: 'cancel-btn' }
}

/** The kit `BasicModal` props a builder fills. */
export interface ActionModalProps {
  title: string
  message: string
  icon: string
  color?: string
  alert?: string
  buttons: ModalButton[]
  /** A required checkbox field gates every button but `cancel`. */
  confirmRequired: boolean
  /** Custom class of the modal (`copy-instance-modal`, `hide-cancel`). */
  customClass?: string
  /** Loading mode: `active` spins only the clicked button and disables the others while the request runs. */
  loadingMode?: 'active'
  /** The push to live loading state (`showPushToLiveModal`): a spinner with a centred title and message. */
  messageLoader?: boolean
  messageTitle?: string
  messageTitleClass?: string
  messageClass?: string
  /** Legacy `custom` slot of `BasicModal` (the grey `target-item-box`): trusted HTML rendered after the message, outside its `<p>`. */
  targetBox?: string
  /** The same box with a rating (install plugin and theme): rendered by `BasicModal` with the kit star; used instead of `targetBox`. */
  targetRatingBox?: ModalTargetRatingBox
  /** The progress log shown while the action runs (`BasicModal.submittingProgressLog`); a handler appends lines to it. */
  submittingProgressLog?: string
}

/** Checkboxes of which one must be ticked before the action runs; `reason` says why it is off. */
export interface ActionModalChoice {
  names: readonly string[]
  reason: string
}

export interface ActionModal<TType extends string = string> {
  type: TType
  props: ActionModalProps
  /** The fields the default slot of `BasicModal` renders, one `BasicModalField` each. */
  fields: ModalField[]
  /** One of these checkboxes must be ticked before a non-cancel button emits. */
  choice?: ActionModalChoice
  /** Card width: 560px by default (360px for the suspend dialog). */
  width: string
  /** The dialog ignores outside clicks (set by the unsuspend dialog from the start). */
  persistent: boolean
  /** Values a field starts with (the preselected version or service). */
  values?: Record<string, unknown>
}
