<template>
  <basic-modal
    ref="modalRef"
    :buttons="buttons"
    class="card-width-560"
    :close-visible="!submitting"
    data-testid="secret-password-modal"
    icon="$lockoutline"
    :message="t('message.secret.confirm')"
    :submitting="submitting"
    :title="t('heading.secret.confirm.title')"
    @button-click="onButton"
    @modal-close="close"
  >
    <basic-modal-field
      :field="field"
      :last="true"
      :model-value="password"
      @update:model-value="password = String($event ?? '')"
    />
  </basic-modal>
</template>

<script lang="ts" setup>
  // The password confirmation the panel's `password.confirm` window needs before a secret is revealed
  // (`POST /user/confirm-password`).
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import type { ModalPasswordField } from '@/shared/ui/modal/basic-modal.types'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, useTemplateRef } from 'vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
  import { confirmPassword } from './secret.api'

  const emit = defineEmits<{
    /** The password was accepted; the caller retries the reveal. */
    'confirmed': []
    'modal-close': []
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const password = ref('')
  const submitting = ref(false)
  const modalInstance = useTemplateRef<{ validate: () => Promise<{ valid: boolean }> }>('modalRef')

  const field = computed<ModalPasswordField>(() => ({
    type: 'password',
    name: 'password',
    label: t('form.label.password'),
    rules: [value => !!value || t('form.validation.required', { field: t('form.label.password') })],
  }))

  const buttons = computed<ModalButton[]>(() => [
    { id: 'confirm', label: t('button.confirm'), color: 'primary', testId: 'secret-password-confirm', loading: submitting.value },
    { id: 'cancel', label: t('button.cancel'), color: 'normal', type: 'cancel', testId: 'secret-password-cancel' },
  ])

  function close (): void {
    if (!submitting.value) {
      emit('modal-close')
    }
  }

  async function onButton (id: string): Promise<void> {
    if (id !== 'confirm') {
      close()
      return
    }
    if (submitting.value) {
      return
    }
    submitting.value = true
    const valid = (await modalInstance.value?.validate())?.valid === true
    if (!valid) {
      submitting.value = false
      return
    }
    try {
      await confirmPassword(password.value)
      emit('confirmed')
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }
</script>
