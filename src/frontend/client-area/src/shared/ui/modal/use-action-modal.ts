import type { ActionModal } from '@/shared/ui/modal/action-modal'
import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import { computed, ref } from 'vue'
import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
import { initialFormValues } from '@/shared/ui/modal/initial-form-values'

// The legacy action modal mixin as one composable: the state of the single `BasicModal` dialog, its open and close, and the dispatch of
// its buttons to the handlers of the screen (the list or the instance frame). The view builds the handlers; the dialog markup is
// `ActionModalHost`.

export type ActionValues = Record<string, unknown>

export interface ActionContext<T, M extends ActionModal = ActionModal> {
  /** The instance the dialog acts on (`null` for the mass actions of the selection). */
  target: T | null
  /** The id of the clicked dialog button (`submit`, or one of a multi-button dialog such as `revert`). */
  button: string
  /** Shows the next step; no `target` keeps the current one (the copy step 2 reuses it). */
  open: (modal: M, target?: T | null) => void
  close: () => void
}

export interface ActionHandler<T, M extends ActionModal = ActionModal> {
  run: (values: ActionValues, ctx: ActionContext<T, M>) => unknown
  /** `false` for a button with no request (legacy `suspend`): the dialog does not go busy or submitting. Default `true`. */
  busy?: boolean
}

/** The `BasicModal` field name (the key of its value), as the dialog keys it. */
export function fieldName (field: ModalField): string {
  return 'name' in field ? String(field.name) : ''
}

// Legacy `loadingMode: 'active'`: the clicked button gets `loading: true` for the request. The copy keeps the
// other buttons as they are, so `buttonState` disables them while the request runs.
function setButtonLoading (modal: ActionModal, id: string, loading: boolean): void {
  modal.props.buttons = modal.props.buttons.map(button => (button.id === id ? { ...button, loading } : button))
}

export function useActionModal<T, M extends ActionModal = ActionModal> (handlers: Record<string, ActionHandler<T, M>>) {
  const modal = ref<M | null>(null)
  const modalOpen = ref(false)
  const submitting = ref(false)
  // Re-creates the `BasicModal` (its field values start again) on every open, as legacy did.
  const render = ref(0)
  const values = ref<ActionValues>({})
  const busy = ref(false)
  // The dialog ignores outside clicks while a request runs, or always for the unsuspend prompt.
  const persistent = computed(() => busy.value || Boolean(modal.value?.persistent))
  let target: T | null = null

  useBodyScrollLock(modalOpen)

  function open (next: M, nextTarget?: T | null): void {
    if (nextTarget !== undefined) {
      target = nextTarget
    }
    render.value++
    values.value = { ...initialFormValues(next.fields), ...next.values }
    modal.value = next
    modalOpen.value = true
  }

  function close (): void {
    modalOpen.value = false
  }

  // Merges a partial update (one changed field from the dialog). A full replace would let a second field changed before the
  // re-render overwrite the first with its stale value.
  function setValues (patch: ActionValues): void {
    values.value = { ...values.value, ...patch }
  }

  /** The dialog button `id`: `cancel` and `close` close; any other button runs the handler of the modal type. */
  async function onButton (id: string): Promise<void> {
    const current = modal.value
    if (!current) {
      return
    }
    if (id === 'cancel' || id === 'close') {
      close()
      return
    }
    const handler = handlers[current.type]
    if (!handler) {
      return
    }

    const tracksBusy = handler.busy !== false
    const activeLoading = current.props.loadingMode === 'active'
    if (activeLoading) {
      setButtonLoading(current, id, true)
    }
    if (tracksBusy) {
      busy.value = true
      submitting.value = true
    }
    try {
      await handler.run({ ...values.value }, { target, button: id, open, close })
    } finally {
      if (activeLoading) {
        setButtonLoading(current, id, false)
      }
      if (tracksBusy) {
        busy.value = false
        submitting.value = false
      }
    }
  }

  return { modal, modalOpen, submitting, render, values, persistent, open, close, setValues, onButton }
}
