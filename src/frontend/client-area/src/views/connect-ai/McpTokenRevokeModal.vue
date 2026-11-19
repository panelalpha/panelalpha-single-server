<template>
  <mcp-token-modal
    v-model="opened"
    :buttons="buttons"
    :close-locked="submitting"
    :loading="submitting"
    test-id="connect-ai-modal-revoke"
    :title="t('heading.connectAi.revokeToken')"
    variant="danger"
    @button-click="onButton"
  >
    <p class="p-2 mb-4">
      {{ t('heading.connectAi.revokeConfirm', { name: token ? token.name : '' }) }}
    </p>

    <p class="p-2 mb-4 text--gray-darken1">
      {{ t('heading.connectAi.revokeWarning') }}
    </p>

    <p class="p-2 mb-6">
      <b>{{ t('message.confirmAction') }}</b>
    </p>

    <checkbox
      v-model="confirm"
      color="primary"
      data-testid="connect-ai-confirm"
      :label="t('heading.connectAi.revokeTokenConfirm')"
    />
  </mcp-token-modal>
</template>

<script lang="ts" setup>
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  // Not persistent, as legacy. The confirm
  // button is really `disabled` until the checkbox is ticked (and while the request runs); its disabled look is the one of the kit button
  // below. `revoke()` keeps its guard as a second line of defence.
  import type { McpToken } from '@/entities/mcp/mcp.api'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { revokeToken } from '@/entities/mcp/mcp.api'
  import McpTokenModal from '@/entities/mcp/ui/McpTokenModal.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'

  const emit = defineEmits<{ 'token-revoked': [token: McpToken] }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const opened = ref(false)

  const token = ref<McpToken | null>(null)
  const confirm = ref(false)
  const submitting = ref(false)

  // Footer of the kit card: Revoke over Cancel. Cancel does nothing while the request runs, as before.
  const buttons = computed<ModalButton[]>(() => [
    { id: 'revoke', label: t('button.connectAi.revoke'), color: 'warning', buttonClass: 'revoke-btn', testId: 'connect-ai-revoke-submit', disabled: !confirm.value || submitting.value },
    cancelButton(t),
  ])

  function onButton (id: string): void {
    if (id === 'revoke') {
      void revoke()
      return
    }
    if (!submitting.value) {
      close()
    }
  }

  function open (target: McpToken): void {
    token.value = target
    confirm.value = false
    opened.value = true
  }

  function close (): void {
    opened.value = false
  }

  async function revoke (): Promise<void> {
    if (!confirm.value || !token.value) {
      return
    }
    submitting.value = true
    try {
      await revokeToken(token.value.id)
      emit('token-revoked', token.value)
      close()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }

  defineExpose({ open })
</script>

<style lang="scss" scoped src="@/shared/ui/modal/BasicModal.scss" />
