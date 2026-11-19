<template>
  <div
    class="add-new-label"
    data-testid="label-add"
  >
    <div class="px-3 py-3 heading--text d-flex justify-space-between">
      <div class="p-2 font-weight-bold py-1">
        {{ t('heading.instance.tag.add.title') }}
      </div>

      <div
        v-ripple
        class="btn-close"
        @click="emit('close')"
      >
        <v-icon
          icon="$close"
          size="16"
        />
      </div>
    </div>

    <v-divider />

    <div class="px-4 py-4">
      <v-text-field
        v-model="labelTitle"
        class="add-new-tag-input mb-2 v-input--xsm"
        :error="Boolean(error)"
        hide-details
        :label="t('form.placeholder.tag.add')"
        :messages="error || undefined"
        single-line
        variant="outlined"
      />

      <color-swatch
        v-model="activeColor"
        :colors="LABEL_COLORS"
      />

      <p
        v-if="validationMessage || error"
        class="p-5 mb-1 mt-3 text-error"
      >
        {{ validationMessage }}
        {{ error }}
      </p>
    </div>

    <v-divider />

    <div class="d-flex px-4 py-4">
      <AppButton
        kind="primary"
        size="small"
        @click="submit()"
      >
        <span class="font-weight-bold">{{ t('button.label.add') }}</span>
      </AppButton>

      <AppButton
        class="ml-2 gray--text"
        kind="secondary"
        size="small"
        @click="emit('change-view')"
      >
        <span class="font-weight-bold button-cancel">{{ t('button.cancel') }}</span>
      </AppButton>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The server error arrives as the `error`
  // prop and stays inline, as in legacy. No spinner: legacy passed `isLoading` to a prop this panel never declared.
  import type { LabelValidationError } from '@/entities/label/label-menu'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { LABEL_COLORS, validateNewLabel } from '@/entities/label/label-menu'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ColorSwatch from '@/shared/ui/form/ColorSwatch.vue'

  defineProps<{ error?: string }>()

  const emit = defineEmits<{
    'close': []
    'change-view': []
    'create-label': [label: { title: string, color: string }]
  }>()

  const { t } = useTranslation()

  const labelTitle = ref('')
  const activeColor = ref('')
  const validationError = ref<LabelValidationError | null>(null)

  // `errorMsg`: set on submit only, so it keeps the text after the copy changes until the next submit.
  const validationMessage = computed(() => {
    switch (validationError.value) {
      case 'min-length': {
        return t('form.validation.minLength', { field: t('form.label.tagTitle'), length: 3 })
      }
      case 'max-length': {
        return t('form.validation.maxLength', { field: t('form.label.tagTitle'), length: 18 })
      }
      case 'color-required': {
        return t('form.validation.color', { field: t('form.label.tag') })
      }
      default: {
        return ''
      }
    }
  })

  function submit (): void {
    validationError.value = validateNewLabel({ title: labelTitle.value, color: activeColor.value })
    if (validationError.value === null) {
      emit('create-label', { title: labelTitle.value, color: activeColor.value })
    }
  }
</script>

<style lang="scss" scoped>
// Legacy scoped `.v-btn { height: 50px }` was dead in V2: `.v-btn:not(.v-btn--round).v-size--small` (0,3,0) beat it and the buttons
// were 32px. Unlayered here it would beat the layered V4 size (50px), so it is not ported.

.btn-close {
  height: 32px;
  min-width: 32px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.add-new-tag-input {
  outline: 1px solid var(--v-gray-base);
  border: 2px solid transparent;
  box-shadow: none;
  transition: outline 0.24s ease, border 0.24s ease;

  // V2 `.v-input--is-focused` (V4 has no focus class on the root, the field carries `.v-field--focused`).
  &:has(.v-field--focused) {
    outline: none;
    border: 2px solid rgb(var(--v-theme-primary));
  }
}

// Legacy 38px field. The global `.v-input.v-text-field.v-input--xsm .v-input__control .v-field` (32px, `_inputs.scss`) ties on
// specificity with a bare `.v-field` here and wins on load order, so the rule names `.v-input__control` too (0,6,0).
.v-input.v-text-field.v-input--xsm {
  :deep(.v-input__control .v-field) {
    min-height: 38px;
    max-height: 38px;
  }
}

.button-cancel {
  color: var(--v-text-darken2);
}
</style>
