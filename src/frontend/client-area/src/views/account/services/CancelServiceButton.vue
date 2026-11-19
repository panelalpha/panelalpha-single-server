<template>
  <div class="text-center">
    <AppButton
      data-testid="services-cancel-open"
      kind="text"
      size="small"
      @click.prevent="opened = true"
    >
      <span class="text--gray-darken1 font-weight-bold">{{ t('button.cancel') }}</span>
    </AppButton>

    <AppDialog
      v-model="opened"
      persistent
      scroll-lock="mobile"
      transition="custom-dialog-transition"
    >
      <basic-modal
        :buttons="buttons"
        class="card-width-560"
        close-testid="services-cancel-close"
        color="warning"
        data-testid="services-cancel-modal"
        icon="$plans"
        :loading="submitting"
        :title="t('heading.cancelServiceModal.title')"
        @button-click="onButton"
        @modal-close="opened = false"
      >
        <template #custom>
          <v-form ref="form">
            <AppMessage
              class="mb-6"
              icon="$stars"
              :title="t('heading.cancelServiceModal.alert.title')"
              variant="warning"
            >
              <p>{{ t('heading.cancelServiceModal.alert.text') }}</p>
            </AppMessage>

            <v-row class="my-0">
              <v-col
                class="py-0"
                cols="12"
              >
                <LabeledField :label="t('heading.cancelServiceModal.reason.label')">
                  <v-select
                    v-model="reason"
                    :aria-label="t('heading.cancelServiceModal.reason.label')"
                    class="mb-0"
                    data-testid="services-cancel-reason"
                    :items="reasons"
                    persistent-placeholder
                    :placeholder="t('heading.cancelServiceModal.reason.placeholder')"
                    required
                    variant="outlined"
                    @update:model-value="onReasonPick"
                  />
                </LabeledField>
              </v-col>

              <v-col
                class="py-0 mt-4"
                cols="12"
              >
                <LabeledField :label="t('heading.cancelServiceModal.describe.label')">
                  <v-textarea
                    v-model="otherReason"
                    :aria-label="t('heading.cancelServiceModal.describe.label')"
                    class="mb-0"
                    data-testid="services-cancel-describe"
                    required
                    :rules="[(v: string | null) => (v ?? '').length > 9 || t(t('heading.cancelServiceModal.describe.minimum'))]"
                    variant="outlined"
                  />
                </LabeledField>
              </v-col>
            </v-row>
          </v-form>
        </template>
      </basic-modal>
    </AppDialog>
  </div>
</template>

<script lang="ts" setup>
  // The modal keeps its reason and
  // description when it is closed (legacy never reset them).
  import type { Service } from './services.types'
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import LabeledField from '@/shared/ui/form/LabeledField.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import { CANCEL_REASON_KEYS, canSubmit, describeAfterReasonPick, resolveCancelOutcome } from './cancel-service'
  import { cancelService } from './services.api'

  const props = defineProps<{
    service: Pick<Service, 'id'>
  }>()

  const emit = defineEmits<{
    'service-cancelled': [id: number]
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const opened = ref(false)
  // Legacy has no accessible names on the close button, reason select or description
  // field; `aria-label` only, pixels unchanged. The close button is the kit `ModalCloseButton` (same icon, size, colour).

  const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
  const reason = ref('')
  const otherReason = ref('')
  const submitting = ref(false)

  const reasons = computed(() => CANCEL_REASON_KEYS.map(key => t(key)))

  // Footer of the kit card: Submit (warning, after a reason and 10 characters) over Dismiss. Dismiss closes
  // at any time, as before (`loading`, not `submitting`).
  const buttons = computed<ModalButton[]>(() => [
    { id: 'submit', label: t('button.submit'), color: 'warning', testId: 'services-cancel-submit', disabled: !canSubmit(reason.value, otherReason.value) },
    { id: 'dismiss', label: t('button.dismiss'), color: 'normal', type: 'cancel', testId: 'services-cancel-dismiss' },
  ])

  function onButton (id: string): void {
    if (id === 'submit') {
      void submit()
      return
    }
    opened.value = false
  }

  function onReasonPick (value: string | null): void {
    otherReason.value = describeAfterReasonPick(value ?? '', otherReason.value)
  }

  async function submit (): Promise<void> {
    const { valid } = (await form.value?.validate()) ?? { valid: true }
    if (!valid) {
      return
    }
    submitting.value = true
    try {
      const outcome = resolveCancelOutcome(await cancelService(props.service.id, otherReason.value))
      if ('redirect' in outcome) {
        window.location.href = outcome.redirect
        return
      }
      emit('service-cancelled', props.service.id)
      opened.value = false
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
// V4 `v-row` spaces columns with `gap` (24px); V2 had none.
.v-row {
  --v-col-gap-x: 0px;
  --v-col-gap-y: 0px;
}

// V2 `v-input` with empty details is 54px high (V4 48px).
.v-select {
  min-height: 54px;
}

// V2 textarea line height is 28px (5 rows = 156px with padding); V4 22px.
.v-textarea :deep(textarea.v-field__input) {
  line-height: 1.75rem;
}
</style>
