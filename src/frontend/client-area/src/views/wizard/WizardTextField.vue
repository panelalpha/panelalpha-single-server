<template>
  <div class="wizard-field">
    <label
      v-if="label"
      class="wizard-field__label"
      :for="inputId"
    >
      {{ label }}
      <span
        v-if="hint"
        class="wizard-field__hint"
      >
        {{ hint }}
      </span>
    </label>

    <v-text-field
      :id="inputId"
      ref="field"
      v-model="model"
      v-model:focused="focused"
      :aria-label="label ? undefined : ariaLabel"
      :autocomplete="autocomplete"
      class="wizard-field__input v-input--md"
      density="compact"
      :disabled="disabled"
      :error-messages="errorMessages"
      hide-details="auto"
      :name="name"
      :placeholder="placeholder"
      :rules="rules"
      :type="type"
      validate-on="lazy input"
      variant="outlined"
    >
      <template
        v-if="$slots['append-inner']"
        #append-inner
      >
        <slot name="append-inner" />
      </template>
    </v-text-field>
  </div>
</template>

<script lang="ts" setup>
  import { useId, useTemplateRef } from 'vue'

  // Text field of the wizard (the admin area uses an outlined `v-text-field.v-input--lg`): a 14px label above, a 48px
  // field with a 1px border and 16px of padding. The label is a real `<label>`, so the field has a name for assistive tools; a field
  // without a label (the server name) takes `ariaLabel`. Messages show while the user types, like the admin area (`:rules` without
  // `validate-on-blur`, the V2 default: from the first input or the first blur on, never at mount): `validate-on="lazy input"`.
  defineProps<{
    label?: string
    /** Second, lighter part of the label ("- will be used as login"). */
    hint?: string
    ariaLabel?: string
    placeholder?: string
    type?: string
    name?: string
    autocomplete?: string
    disabled?: boolean
    /** Messages shown under the field whatever the rules say (an error of the save). */
    errorMessages?: string[]
    rules?: Array<(value: unknown) => true | string>
  }>()

  const model = defineModel<string>({ required: true })
  /** True while the input has the focus (the password hint opens on it). */
  const focused = defineModel<boolean>('focused', { default: false })

  const inputId = useId()
  const field = useTemplateRef<{ $el: HTMLElement }>('field')

  /**
   * The `.v-field` (the 48px box with the border) of the field, so an overlay (the password hint) can open under it and take its width.
   * The `.v-input` around it is 8px taller (the room of a message), which would add to the gap.
   */
  defineExpose({ element: () => field.value?.$el?.querySelector('.v-field') ?? field.value?.$el ?? null })
</script>

<style lang="scss" scoped>
  @use '@/app/styles/legacy/tokens/variables' as v;

  // Every field is followed by the 16px the source keeps for the messages: the 2px under the 48px field
  // `.v-input__slot { margin-bottom: 2px }`) and the 14px minimum of `.v-text-field__details`.
  .wizard-field {
    margin-bottom: 16px;
  }

  // A message (`hide-details="auto"`) takes its own line in the flow and pushes the next field down, like the admin area: the line
  // replaces the reserved 16px, so the wrapper gives that margin up while a message is shown, and the line stands 2px under the field
  // (`.v-input__slot` margin of the admin area wizard; the global rule keeps the 8px of the client area). The details have no margin
  // and no side padding (`padding-left: 0`).
  .wizard-field:has(.v-messages__message) {
    margin-bottom: 0;
  }

  .wizard-field .wizard-field__input.v-input:has(.v-messages__message) :deep(.v-field) {
    margin-bottom: 2px;
  }

  .wizard-field :deep(.v-input__details) {
    min-height: 0;
    margin: 0;
    padding: 0;
  }

  // 14px / 20px, 400, like the client area (`/setup`); the admin area has 12px / 26px.
  .wizard-field :deep(.v-messages__message) {
    font-size: v.$font-size-sm;
    line-height: v.$line-height-sm;
    font-weight: v.$font-weight-normal;
  }

  // The label: 14/32/600 in `gray-darken1`, no margin (the label is an inline element, so `mb-1` does not apply).
  .wizard-field__label {
    display: block;
    color: var(--v-wizard-label);
    font-size: v.$font-size-sm;
    line-height: 32px;
    font-weight: v.$font-weight-semibold;
  }

  // The second part of the label of the email (`font-weight-regular gray--text text--lighten-1`).
  .wizard-field__hint {
    color: var(--v-wizard-label-muted);
    font-weight: v.$font-weight-normal;
  }

  .wizard-field .wizard-field__input.v-input {
    position: relative;
    margin-bottom: 0;

    :deep(.v-field) {
      min-height: 48px;
      border-radius: 5px;
      padding-inline: 16px;
    }

    // The 1px border of the outline: `--v-wizard-field-border`, not the opacity of the text colour.
    :deep(.v-field__outline) {
      --v-field-border-width: 1px;
      --v-field-border-opacity: 1;

      color: var(--v-wizard-field-border);
    }

    :deep(.v-field__input) {
      padding-inline: 0;
    }

    // The input: 16/28, 400, `gray-darken4`; the placeholder is `gray` (the field in the source is not a client area field,
    // whose input is semibold).
    :deep(input) {
      font-size: v.$font-size-base;
      line-height: 28px;
      font-weight: v.$font-weight-normal;
    }

    :deep(input::placeholder) {
      color: var(--v-wizard-field-placeholder);
      opacity: 1;
    }

    :deep(.v-field__append-inner) {
      padding-top: 0;
      align-self: center;
    }
  }
</style>
