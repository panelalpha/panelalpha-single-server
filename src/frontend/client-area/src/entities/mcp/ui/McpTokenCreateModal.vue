<template>
  <mcp-token-modal
    v-model="opened"
    :buttons="buttons"
    :close-visible="!submitting && !createdToken"
    :loading="submitting"
    test-id="connect-ai-modal-create"
    :title="t('heading.connectAi.createToken')"
    variant="create"
    @after-leave="reset()"
    @button-click="onButton"
  >
    <!-- Step 1: enter the name -->
    <div
      v-if="!createdToken"
      class="d-flex flex-column mb-6"
    >
      <label class="mb-2">{{ t('heading.connectAi.tokenName') }}</label>

      <validated-text-field
        v-model="name"
        class="v-input--md"
        data-testid="connect-ai-token-name-input"
        density="compact"
        hide-details="auto"
        :placeholder="t('heading.connectAi.tokenNamePlaceholder')"
        validate-on="blur"
        variant="outlined"
        @keydown.enter="submit()"
      />
    </div>

    <!-- Step 2: the created token -->
    <token-created-panel
      v-if="createdToken"
      v-model:confirmed="confirmed"
      :confirm-label="t('heading.connectAi.tokenSavedConfirm')"
      confirm-testid="connect-ai-confirm"
      :name="name"
      :name-label="t('heading.connectAi.tokenName')"
      :token="createdToken"
      :token-label="t('heading.connectAi.yourToken')"
      token-testid="connect-ai-created-token"
    >
      <template #warning>
        <p>{{ t('heading.connectAi.tokenWarning') }}</p>
      </template>
    </token-created-panel>
  </mcp-token-modal>
</template>

<script lang="ts" setup>
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  // The legacy `open()` stays the way in (`defineExpose`).
  // Not persistent, as legacy: Esc or a click outside closes it at any step, also while a request runs and after the token is shown.
  // Enter submits again during a request (a second POST is possible): legacy defect, kept 1:1.
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { createToken } from '@/entities/mcp/mcp.api'
  import McpTokenModal from '@/entities/mcp/ui/McpTokenModal.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import ValidatedTextField from '@/shared/ui/form/ValidatedTextField.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import TokenCreatedPanel from '@/shared/ui/record-box/TokenCreatedPanel.vue'

  // No payload: the plain token never leaves this component (the frame only refetches the list).
  const emit = defineEmits<{ 'token-created': [] }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const opened = ref(false)

  const name = ref('')
  const createdToken = ref<string | null>(null)
  const confirmed = ref(false)
  const submitting = ref(false)

  // Footer of the kit card: step 1 Create over Cancel (disabled while the request runs), step 2 Continue.
  const buttons = computed<ModalButton[]>(() => createdToken.value
    ? [{ id: 'continue', label: t('button.continue'), color: 'primary', testId: 'connect-ai-continue', disabled: !confirmed.value, appendIcon: '$arrowright' }]
    : [
      { id: 'create', label: t('button.create'), color: 'primary', testId: 'connect-ai-create-submit', disabled: !name.value.trim() },
      { ...cancelButton(t), disabled: submitting.value },
    ])

  function onButton (id: string): void {
    if (id === 'create') {
      void submit()
      return
    }
    close()
  }

  function reset (): void {
    name.value = ''
    createdToken.value = null
    confirmed.value = false
  }

  function open (): void {
    opened.value = true
    reset()
  }

  function close (): void {
    opened.value = false
  }

  async function submit (): Promise<void> {
    if (!name.value.trim()) {
      return
    }
    submitting.value = true
    try {
      const token = await createToken(name.value)
      createdToken.value = token.plain_text_token
      emit('token-created')
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }

  defineExpose({ open })
</script>

<style lang="scss" scoped src="@/shared/ui/modal/BasicModal.scss" />
<style lang="scss" scoped>
// V2 `dense outlined` kept the native input's 8px vertical padding inside the 48px `v-input--md` slot (41px input); the global
// `_inputs.scss` `md` rule zeroes it.
.v-input--md :deep(.v-field .v-field__input) {
  padding-top: 8px !important;
  padding-bottom: 8px !important;
}

// V4 dark sets `color-scheme: dark`, which turns the UA border colour of the (zero-width) native input into #858585; V2 stayed at #767676.
// The disabled input (step 2, `TokenCreatedPanel`) keeps its own UA colour in both apps.
.v-input--md :deep(input:not(:disabled)) {
  border-color: var(--v-native-input-border);
}
</style>
