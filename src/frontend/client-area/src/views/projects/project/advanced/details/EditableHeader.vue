<template>
  <div>
    <v-form
      v-if="inputOpen || loading"
      ref="formRef"
      class="info-panel__input"
    >
      <v-text-field
        v-model="editInput"
        class="mt-0 mr-2 mb-0"
        density="compact"
        :disabled="loading"
        hide-details
        :loading="loading"
        :rules="rules"
        variant="underlined"
        @keydown.enter.prevent="changeInput"
      />

      <v-icon
        class="ml-1 edit-icon edit-icon--submit"
        :disabled="loading"
        icon="$check"
        size="24"
        @click="changeInput"
      />

      <v-icon
        class="edit-icon edit-icon--cancel"
        :disabled="loading"
        icon="$close"
        size="24"
        @click="inputOpen = false"
      />
    </v-form>

    <!-- The check now matches TopBarEditableTitle.vue on purpose, unlike legacy. -->
    <div
      v-else-if="instance.hasUpdateSiteNamePrivilege()"
      class="info-panel__data info-panel__data--name"
      @click="inputOpen = !inputOpen"
    >
      <span class="p-2 heading--text dotted-underscore">
        {{ inputValue }}
      </span>

      <v-icon
        class="info-panel__data-icon edit-icon edit-icon--edit"
        icon="$edit"
        size="16"
      />
    </div>

    <div v-else>
      <span class="p-2 heading--text dotted-underscore">
        {{ inputValue }}
      </span>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import type { FormRule } from '@/shared/ui/form/use-form-rules'
  // Legacy validated the field through the
  // parent's ref chain; here the component validates its own form before it emits, with the same rules and the same outcome.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { ref, watch } from 'vue'

  const props = defineProps<{
    instance: InstanceResource
    inputValue: string
    loading: boolean
    rules: FormRule[]
  }>()

  // Kebab-case by lint (`vue/custom-event-name-casing`); the parent listens with `@update:input-value`.
  const emit = defineEmits<{
    'update:input-value': [value: string]
  }>()

  const inputOpen = ref(false)
  const editInput = ref(props.inputValue)
  const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)

  // The editor closes when the save ends.
  watch(() => props.loading, loading => {
    if (!loading) {
      inputOpen.value = false
    }
  })

  // Every opening starts from the current value.
  watch(inputOpen, () => {
    editInput.value = props.inputValue
  })

  /** Emits only after the form is valid; an empty or too long name stays in the editor. */
  async function changeInput (): Promise<void> {
    const result = await formRef.value?.validate()
    if (result?.valid) {
      emit('update:input-value', editInput.value)
    }
  }
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// V2 `.v-icon--disabled` keeps the icon at `$material-light.inputs.disabled` with full opacity; V4 fades the text colour to 0.38.
.edit-icon.v-icon--disabled {
  color: var(--v-input-disabled-color);
  opacity: 1;
}

// V2 `.v-input__slot` is `.v-field` in V4; legacy `$primary` / `$gray` / `$error` map to the theme colour variables.
.info-panel__input {
  display: flex;
  align-items: center;

  :deep(.v-input) {
    margin-bottom: 0 !important;

    input {
      color: var(--v-primary-darken1);
      // The field typography has to beat the global input type scale.
      font-size: v.$font-size-base !important;
      line-height: v.$line-height-base !important;
      font-weight: v.$font-weight-semibold !important;
    }

    .v-field {
      min-height: 20px;
      max-height: 20px;
      margin: 0;
      margin-top: -2px;

      // V2 slot is 20px high and centres the 30px input (it overflows 5px each way); V4 stretched the field row to the input.
      .v-field__field {
        height: 20px;
      }

      // V2 `.v-text-field input` is `padding: 4px 0 2px`; the global `_inputs.scss` gives `.v-field__input` 8px (`.v-input__control .v-field`).
      .v-field__input {
        padding-top: 4px;
        padding-bottom: 2px;
      }

      &::after {
        display: none;
      }

      &::before {
        content: "";
        position: absolute;
        bottom: -5px;
        left: 0;
        width: 100%;
        // The dashed underline has to beat the V4 `.v-field--variant-underlined` border.
        border: none !important;
        border-bottom: 1px dashed var(--v-primary-darken1) !important;
        transition: border-color 0.24s ease;
      }
    }
  }
}

.edit-icon {
  cursor: pointer;
  color: var(--v-gray-darken1);

  &--edit:hover {
    color: var(--v-primary-base);
  }

  &--submit:hover {
    color: var(--v-primary-base);
  }

  &--cancel:hover {
    color: var(--v-error-base);
  }
}

.info-panel__data {
  .v-icon {
    opacity: 0;
    margin-left: 8px;
    transition: opacity 0.24s ease;
  }

  &:hover {
    .v-icon {
      opacity: 1;
    }
  }
}
</style>
