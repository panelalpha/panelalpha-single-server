<template>
  <div
    class="text-select-input"
    :class="[
      hasError ? 'text-select-input--error' : '',
      isSelected ? 'text-select-input--focus' : '',
    ]"
  >
    <div class="text-select-input__suffix">
      <span class="p-2">www.</span>
    </div>

    <v-text-field
      ref="textField"
      v-model="text"
      class="v-input--md text-select-input__text-input"
      density="compact"
      :error-messages="errorMessages"
      hide-details="auto"
      :placeholder="placeholder"
      :rules="rules"
      validate-on="blur"
      variant="outlined"
      @update:focused="setFocus"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { FieldRule } from './field-rule'
  import { computed, ref, useTemplateRef, watch } from 'vue'
  import { useHideErrorWhileFocused } from './use-hide-error-while-focused'

  type TextFieldInstance = {
    validate: () => Promise<string[]>
    reset: () => void
    resetValidation: () => void
    isValid: boolean | null
  }

  const props = withDefaults(defineProps<{
    placeholder?: string
    rules?: FieldRule[]
    /** A message the screen has for this field (a refused request), shown like a rule's own. */
    errorMessages?: string[]
  }>(), {
    placeholder: '',
    rules: () => [],
    errorMessages: () => [],
  })

  const text = defineModel<string>('text', { default: '' })

  const textField = useTemplateRef<TextFieldInstance>('textField')
  const isSelected = ref(false)

  // Legacy `validate-on-blur`: the message goes away at the focus and while typing, but the red frame of the wrapper stays
  // until the next blur (V2 `hasError = !$refs.text.valid` is read after blur and text change, and `valid` only changes on a validation).
  // The hook resets the field at the focus, so the frame is held in `heldError` from that focus to the next validation.
  const { onFocusedChange } = useHideErrorWhileFocused(textField)
  const heldError = ref(false)
  const hasError = computed(() => textField.value?.isValid === false || heldError.value || props.errorMessages.length > 0)

  watch(() => textField.value?.isValid, valid => {
    if (valid !== null && valid !== undefined) {
      heldError.value = false
    }
  })

  function setFocus (value: boolean): void {
    isSelected.value = value
    if (value) {
      heldError.value = textField.value?.isValid === false
    }
    onFocusedChange(value)
  }

  async function validate (): Promise<boolean> {
    if (!textField.value) {
      return true
    }
    return (await textField.value.validate()).length === 0
  }

  function reset (): void {
    heldError.value = false
    textField.value?.reset()
  }

  function resetValidation (): void {
    heldError.value = false
    textField.value?.resetValidation()
  }

  defineExpose({ validate, reset, resetValidation })
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;
@use 'sass:map';

// V2 `fieldset` is the V4 `.v-field__outline`; the wrapper draws the one shared border (the V2
// `.error--text ... fieldset` border-color rules only repeated what hiding the outline already does).
.text-select-input {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  position: relative;

  .v-input {
    :deep(.v-field__outline) {
      display: none;
    }
  }

  &::before,
  &::after {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    height: 46px;
    width: 100%;
    border-radius: 3px;
    pointer-events: none;
    transition: outline 0.24s ease, border 0.24s ease, width 0.24s ease,
      margin 0.24s ease;
  }

  &::before {
    border: 1px solid var(--v-gray-lighten2);
    z-index: 11;
  }

  &::after {
    border: 2px solid transparent;
    z-index: 10;
  }

  &:hover {
    &::before {
      border-color: transparent !important;
    }

    &::after {
      border: 1px solid map.get(v.$primary, base);
    }
  }

  &--error {
    // V2 `.v-input__icon--append` is the V4 `.v-field__append-inner`
    .v-input :deep(.v-field__append-inner) {
      svg {
        color: map.get(v.$error, base);
      }
    }

    &::before {
      border-color: transparent !important;
    }

    &::after {
      border: 2px solid map.get(v.$error, base);
    }
  }

  &--focus {
    .v-input :deep(.v-field__append-inner) {
      svg {
        color: map.get(v.$primary, base);
      }
    }

    &::before {
      border-color: transparent !important;
    }

    &::after {
      border: 2px solid map.get(v.$primary, base);
    }
  }

  &__text-input {
    display: flex;
    // The message sits under the control, not beside it.
    flex-direction: column;

    // V2 `.v-input__control` grew inside the flex `.v-input`; V4's is a grid area that, under `display: flex`, shrinks to the text.
    :deep(.v-input__control) {
      flex: 1 1 auto;
    }
  }

  &__suffix {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 69px;
    height: 46px;
    border-top-left-radius: 3px;
    border-bottom-left-radius: 3px;
    background: var(--v-gray-lighten5);

    span {
      color: map.get(v.$gray, darken1);
    }
  }
}
</style>
