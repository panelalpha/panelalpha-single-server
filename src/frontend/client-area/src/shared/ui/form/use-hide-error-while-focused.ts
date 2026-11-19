import type { Ref } from 'vue'
import { ref, watch } from 'vue'

// Legacy V2 `validate-on-blur` shows a message only while the field has no focus (`shouldValidate = hasFocused && !isFocused`): the message
// goes away at the focus (click, Tab, or Enter in the field) and comes back at the next blur. V4 `validate-on="blur"` only moves the moment of
// the validation, so the old message stayed under the field while the user typed a new value. The session fields (`EmailField`,
// `PasswordField`) use this; the validation itself still runs on blur.

/** What the composable needs from the `v-text-field` instance (`VInput` exposes both). */
export interface ValidatedFieldHandle {
  /** `false` once the field is validated and invalid (messages shown), `null` while pristine. */
  isValid?: boolean | null
  resetValidation: () => void
}

export function useHideErrorWhileFocused (field: Ref<ValidatedFieldHandle | null | undefined>) {
  const focused = ref(false)

  function hide () {
    if (focused.value) {
      field.value?.resetValidation()
    }
  }

  // The focus itself (click, Tab).
  watch(focused, hide)
  // A validation that ends while the field is focused (Enter in the field submits the form, V4 `v-form` validates on every native submit). The
  // message list itself is no signal: a field with rules validates silently at mount, so the list is already full when the form validates.
  watch(() => field.value?.isValid === false, invalid => {
    if (invalid) {
      hide()
    }
  })

  return {
    focused,
    onFocusedChange (value: boolean) {
      focused.value = value
    },
  }
}
