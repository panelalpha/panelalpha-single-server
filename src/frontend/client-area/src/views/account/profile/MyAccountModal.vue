<template>
  <basic-modal
    :buttons="buttons"
    class="card-width-560"
    data-testid="account-modal"
    :icon="options.icon"
    :title="options.title"
    title-testid="account-modal-title"
    @button-click="onButtonClick"
    @modal-close="emit('modal-close')"
  >
    <template #custom>
      <div>
        <v-form
          ref="form"
          class="d-flex flex-column"
        >
          <div
            v-for="(field, key) in options.fields"
            :key="key"
            class="d-flex flex-column"
          >
            <labeled-field
              v-if="field.type !== 'info'"
              :label="field.label"
              :label-testid="`account-modal-label-${field.name}`"
            >
              <div
                v-if="field.type === 'password'"
                class="d-flex input-group"
              >
                <validated-text-field
                  v-model="formValues[field.name]"
                  autocomplete="new-password"
                  :autofocus="false"
                  class="v-input--md"
                  :data-testid="`account-modal-field-${field.name}`"
                  density="compact"
                  hide-details="auto"
                  :rules="field.rules"
                  :type="shownPasswords[field.name] ? 'text' : 'password'"
                  validate-on="blur"
                  variant="outlined"
                />

                <AppButton
                  :aria-label="shownPasswords[field.name] ? t('button.secret.hide') : t('button.secret.show')"
                  class="password-toggle ml-4"
                  :data-testid="`account-modal-toggle-${field.name}`"
                  icon
                  kind="secondary"
                  size="large"
                  @click="shownPasswords[field.name] = !shownPasswords[field.name]"
                >
                  <v-icon
                    color="black"
                    :icon="shownPasswords[field.name] ? '$eye' : '$eyeclosed'"
                  />
                </AppButton>
              </div>

              <div
                v-else-if="field.type === 'email'"
                :class="key + 1 === options.fields.length ? 'last-child' : ''"
              >
                <validated-text-field
                  v-model="formValues[field.name]"
                  class="v-input--md"
                  :data-testid="`account-modal-field-${field.name}`"
                  density="compact"
                  hide-details="auto"
                  :rules="field.rules"
                  type="email"
                  validate-on="blur"
                  variant="outlined"
                />
              </div>
            </labeled-field>

            <span
              v-else
              class="mb-3"
              data-testid="account-modal-info"
            ><strong>{{ field.description }}</strong>
            </span>
          </div>
        </v-form>
      </div>
    </template>
  </basic-modal>
</template>

<script lang="ts" setup>
  import type { AccountModalInputField, AccountModalOptions } from './account-modals'
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed, reactive, useTemplateRef } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import LabeledField from '@/shared/ui/form/LabeledField.vue'
  import ValidatedTextField from '@/shared/ui/form/ValidatedTextField.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  const props = defineProps<{ options: AccountModalOptions }>()

  const emit = defineEmits<{
    'modal-close': []
    /** The primary button was clicked and the form is valid. */
    'submit': [values: Record<AccountModalInputField['name'], string | null>]
    /** The "switch" button was clicked: no validation, the parent swaps the modal. */
    'switch': []
  }>()

  const { t } = useTranslation()
  const form = useTemplateRef<{ validate: () => Promise<{ valid: boolean }> }>('form')

  // Every named field starts as null.
  const formValues = reactive(Object.fromEntries(
    props.options.fields.flatMap(field => 'name' in field ? [[field.name, null]] : []),
  )) as Record<AccountModalInputField['name'], string | null>
  const shownPasswords = reactive<Record<string, boolean>>({})

  // Footer of the kit card: the legacy buttons as `ModalButton`, the id is the button type.
  const buttons = computed<ModalButton[]>(() => props.options.buttons.map(button => ({
    id: button.type ?? 'submit',
    label: button.label,
    color: button.color,
    ...(button.type === 'cancel' ? { type: 'cancel' } : {}),
    testId: `account-modal-${button.type === 'cancel' ? 'cancel' : 'submit'}`,
  })))

  // Legacy buttons: Cancel closes, the primary one validates the form, then submits. No loading state (legacy quirk).
  async function onButtonClick (id: string): Promise<void> {
    if (id === 'cancel') {
      emit('modal-close')
      return
    }
    if (id === 'switch') {
      emit('switch')
      return
    }
    const result = await form.value?.validate()
    if (result?.valid) {
      emit('submit', { ...formValues })
    }
  }

  defineExpose({ formValues })
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

.v-input {
  :deep(.v-input__details) {
    // Legacy 2px on top of the V2 slot's 8px margin; V4 details add 6px padding-top, so 2 - 6.
    margin-top: -4px;
    margin-bottom: 0px !important;
  }
}

b {
  font-weight: v.$font-weight-semibold;
}

.input-group {
  .v-input + .v-input {
    margin-left: 16px;
  }
}

.v-form .last-child {
  .v-input {
    &.v-text-field {
      margin-bottom: 0px;
    }
  }
}

.v-form .v-input.v-text-field {
  margin-bottom: 16px;
}

.password-toggle.v-btn--icon {
  border-radius: 5px;
}
</style>
