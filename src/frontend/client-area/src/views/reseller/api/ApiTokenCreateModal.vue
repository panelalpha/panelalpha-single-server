<template>
  <AppDialog
    v-model="opened"
    overlay
    scroll-lock="mobile"
    transition="custom-dialog-transition"
    @after-leave="resetState()"
  >
    <!-- The X is `opacity: 0` until `confirm` (set in step 2), but stays clickable. `aria-label` from `button.close` (kit). -->
    <basic-modal
      :buttons="buttons"
      class="card-width-560"
      :close-class="{ 'reseller-api-close--hidden': !confirm }"
      close-testid="reseller-api-create-close"
      :close-visible="!submitting"
      color="primary"
      data-testid="reseller-api-create-modal"
      icon="$lock"
      :loading="submitting"
      :title="t('reseller.apiTokens.modal.create.title')"
      @button-click="onButton"
      @modal-close="close()"
    >
      <template #custom>
        <div>
          <!-- No handler on the form: Enter goes only through the field's `@keydown.enter.prevent`, so the implicit submit cannot send a second POST. -->
          <v-form
            class="d-flex flex-column"
            @submit.prevent
          >
            <token-created-panel
              v-if="createdToken"
              v-model:confirmed="confirm"
              :confirm-label="t('reseller.apiTokens.savedToken')"
              confirm-testid="reseller-api-create-confirm"
              :name="name"
              name-class="reseller-api-token-name--disabled"
              :name-label="t('reseller.apiTokens.name')"
              name-testid="reseller-api-token-name-readonly"
              :token="createdToken"
              :token-label="t('reseller.apiTokens.content')"
              token-testid="reseller-api-token-copy"
            >
              <template #warning>
                <p v-safe-html="t('reseller.apiTokens.modal.created')" />
              </template>
            </token-created-panel>

            <div
              v-else
              class="d-flex flex-column mb-6"
            >
              <label class="mb-2">{{ t('reseller.apiTokens.name') }}</label>

              <div class="last-child">
                <validated-text-field
                  v-model="name"
                  class="v-input--md"
                  data-testid="reseller-api-token-name-input"
                  density="compact"
                  hide-details="auto"
                  :placeholder="t('reseller.apiTokens.name')"
                  validate-on="blur"
                  variant="outlined"
                  @keydown.enter.prevent="submit()"
                />
              </div>
            </div>
          </v-form>
        </div>
      </template>
    </basic-modal>
  </AppDialog>
</template>

<script lang="ts" setup>
  // Step 1 (the name) and step 2. Not persistent, as legacy.
  // Like `McpTokenCreateModal` the Create button has no `disabled` and the name is neither trimmed nor validated: the POST gets the name as
  // typed. Deliberate deviations: Enter in the field creates the token (legacy V2 reloaded the page with a native form
  // submit); `submit()` sets `submitting` before its first `await`, so a second Enter or click during the request sends nothing;
  // and the scroll lock of `AppDialog` (legacy has `lockBodyScroll` commented out).
  import type { ResellerApiToken } from '@/views/reseller/reseller.api'
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { createResellerApiToken } from '@/views/reseller/reseller.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import ValidatedTextField from '@/shared/ui/form/ValidatedTextField.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import TokenCreatedPanel from '@/shared/ui/record-box/TokenCreatedPanel.vue'

  const emit = defineEmits<{ 'api-token-created': [token: ResellerApiToken] }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const opened = ref(false)

  const name = ref('')
  const createdToken = ref<string | null>(null)
  const confirm = ref(false)
  const submitting = ref(false)

  // Footer of the kit card: step 1 Create over Cancel, step 2 Continue with the legacy `disabled-gray` until
  // the checkbox (guard in `onContinue()`). The X stays (transparent until `confirm`) and hides while the request runs.
  const buttons = computed<ModalButton[]>(() => createdToken.value
    ? [{ id: 'continue', label: t('button.continue'), color: 'primary', testId: 'reseller-api-create-continue', buttonClass: confirm.value ? undefined : 'disabled-gray', appendIcon: '$arrowright' }]
    : [
      { id: 'create', label: t('button.create'), color: 'primary', testId: 'reseller-api-create-submit' },
      cancelButton(t),
    ])

  function onButton (id: string): void {
    if (id === 'create') {
      void submit()
      return
    }
    if (id === 'continue') {
      onContinue()
      return
    }
    if (!submitting.value) {
      close()
    }
  }

  // Used by `open()` (legacy resets there) and by `@after-leave` (not in `close()`: that would flash step 1 during the leave animation).
  // Deviation from legacy: legacy kept the one-time token in its data until the next `open()`; here it is dropped
  // once the dialog has left. The "Copied" state resets by itself: the kit row unmounts with `v-if="createdToken"`.
  function resetState (): void {
    name.value = ''
    createdToken.value = null
    confirm.value = false
  }

  function open (): void {
    resetState()
    opened.value = true
  }

  function close (): void {
    opened.value = false
  }

  // Legacy `@click="close()"` relied on `disabled-gray` (`pointer-events: none`) alone, so Tab+Enter/Space closed without the confirmation.
  function onContinue (): void {
    if (!confirm.value) {
      return
    }
    close()
  }

  async function submit (): Promise<void> {
    if (submitting.value) {
      return
    }
    submitting.value = true
    try {
      // Deviation from legacy: legacy emitted the whole object with the token; the list row gets no secret.
      const { plain_text_token: plainTextToken, ...row } = await createResellerApiToken(name.value)
      createdToken.value = plainTextToken
      emit('api-token-created', row)
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

// V4 dark sets `color-scheme: dark`, which turns the UA border colour of the (zero-width) native input into #858585; V2 stayed at the UA colour `--v-native-input-border`.
.v-input--md :deep(input:not(:disabled)) {
  border-color: var(--v-native-input-border);
}
</style>

<style lang="scss" scoped>
// Inline opacity 0 until confirm and the X stays clickable, as in legacy. The X is rendered by the kit card.
.basic-modal :deep(.reseller-api-close--hidden) {
  opacity: 0;
}
</style>
