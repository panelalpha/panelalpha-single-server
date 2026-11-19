<template>
  <div
    class="text-select-input"
    :class="[
      hasError ? 'text-select-input--error' : '',
      isSelected ? 'text-select-input--focus' : '',
    ]"
  >
    <v-text-field
      v-model="textComputed"
      class="v-input--md text-select-input__text-input"
      density="compact"
      :error-messages="errorsBag"
      hide-details="auto"
      :placeholder="placeholder"
      variant="outlined"
      @update:focused="setFocus"
    />

    <div
      v-if="suffix"
      class="text-select-input__suffix"
    >
      <span class="p-2">
        {{ suffix }}
      </span>
    </div>

    <v-select
      v-model="selectComputed"
      class="text-select-input__select-input"
      density="compact"
      hide-details="auto"
      item-title="label"
      item-value="value"
      :items="availableSelectOptions"
      :menu-icon="readonly ? '' : '$dropdown'"
      :readonly="readonly"
      variant="outlined"
      @update:focused="setFocus"
    />
  </div>
</template>

<script lang="ts" setup>
  // Not wired to `v-form`: validation runs by hand on blur, as legacy.
  import type { FieldRule } from './field-rule'
  import { computed, ref } from 'vue'

  type SelectOption = { [key: string]: unknown, label: string, value: unknown }
  type SelectModel = string | SelectOption

  const props = withDefaults(defineProps<{
    suffix?: string
    readonly?: boolean
    placeholder?: string
    availableSelectOptions?: SelectOption[]
    rules?: FieldRule[]
  }>(), {
    suffix: '',
    readonly: false,
    placeholder: '',
    availableSelectOptions: () => [],
    rules: () => [],
  })

  const text = defineModel<string>('text', { default: '' })
  const select = defineModel<SelectModel | null>('select', {
    default: () => ({ label: '', value: '' }),
  })

  // The staging modal listens to this combined value.
  const emit = defineEmits<{
    'update:value': [value: string]
  }>()

  const isSelected = ref(false)
  const hasError = ref(false)
  const errorsBag = ref<string[]>([])

  // Legacy `selectComputed` getter: no selection falls back to the first option.
  const selectComputed = computed({
    get: () => (select.value || props.availableSelectOptions[0]) as SelectModel | undefined,
    set: (newValue: SelectModel | undefined) => {
      select.value = newValue ?? null
      emit('update:value', `${text.value}${props.suffix}${newValue}`)
    },
  })

  const textComputed = computed({
    get: () => text.value,
    set: (newValue: string) => {
      text.value = newValue
      emit('update:value', `${newValue}${props.suffix}${selectComputed.value}`)
    },
  })

  // Legacy `value`: the object form of the select contributes its `.value`.
  const value = computed(() => {
    const current = selectComputed.value
    const selectValue = typeof current === 'object' && current !== null && current.value !== undefined
      ? current.value
      : current
    return `${textComputed.value}${props.suffix}${selectValue}`
  })

  function validate (): string[] {
    const errors: string[] = []

    for (const rule of props.rules) {
      const result = rule(value.value)
      if (result !== true) {
        errors.push(String(result))
      }
    }

    errorsBag.value = errors
    hasError.value = errors.length > 0

    return errors
  }

  function setFocus (focused: boolean): void {
    if (!focused) {
      hasError.value = validate().length > 0
    }
    isSelected.value = focused
  }

  defineExpose({ validate })
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;
@use 'sass:map';

// V2 `fieldset` is the V4 `.v-field__outline`; the wrapper draws the one shared border.
.text-select-input {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  position: relative;

  .v-input :deep(.v-field__outline) {
    display: none;
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
      border: 1px solid map.get(v.$gray, darken1);
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

    // V2 `.v-input__control` grew inside the flex `.v-input`; V4's is a grid area that, under `display: flex`, shrinks to the text.
    :deep(.v-input__control) {
      flex: 1 1 auto;
    }
  }

  // A long base domain in the select squeezed the text field by proportional shrink: at 46 characters its input was 22px and
  // "staging" was cut (OLD: 110px field at 39 characters, "staging" whole). The prefix gets a floor that fits "staging" and the
  // select gives way (its domain truncates). At phone width OLD left the prefix 0px (an OLD defect,
  // visible on phones too), so the floor holds there as well. The error layout below sets its own floor.
  &__text-input {
    min-width: 110px;
  }

  &__select-input {
    min-width: 0;
  }

  // With an error the V2 select kept its content width and the text field gave up the space (messages wrapped per character); V4's
  // `.v-input` shrinks both in proportion to their width.
  // The select stays at the top of the row (V2 `.v-input` is `align-items: flex-start`) instead of centring in the tall error row.
  &--error &__select-input {
    flex-shrink: 0;
    align-self: flex-start;
  }

  // Mobile Add Email Forwarder (375px): V2 left the text field 65px for the wrapped message, V4's wider select left 55px and the
  // message broke per character.
  &--error &__text-input {
    min-width: 65px;
  }

  &__suffix {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    margin: 0 -4px;
    z-index: 10;
    background: var(--v-gray-lighten5);

    span {
      color: map.get(v.$gray, darken1);
    }
  }

  // Phones (< 576px): the modal leaves the control ~199px at 375px, so one row cannot fit "staging", the dot and a domain. The
  // prefix field and the dot take the first row and the select the full width of the second row, inside the one shared border
  // (OLD left the prefix 0px wide). Desktop and tablet keep the single row.
  @media (max-width: 575.98px) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;

    &::before,
    &::after {
      height: 100%;
    }

    &__text-input {
      grid-column: 1;
      grid-row: 1;
    }

    // Both fields lose the 24px the global `.v-form .v-input.v-text-field` (`_inputs.scss`) puts below each one (higher specificity),
    // so the shared border wraps exactly the two rows; the wrapper gets the 24px back in a `v-form`, where the single row had it.
    &__text-input.v-input.v-text-field,
    &__select-input.v-input.v-text-field {
      margin-bottom: 0;
    }

    .v-form & {
      margin-bottom: 24px;
    }

    &__suffix {
      grid-column: 2;
      grid-row: 1;
      margin: 0;
    }

    &__select-input {
      grid-column: 1 / -1;
      grid-row: 2;
      border-top: 1px solid var(--v-gray-lighten2);
    }
  }
}
</style>
