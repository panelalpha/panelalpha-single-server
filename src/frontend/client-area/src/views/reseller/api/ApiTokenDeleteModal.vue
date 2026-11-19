<template>
  <AppDialog
    v-model="opened"
    overlay
    scroll-lock="mobile"
    transition="custom-dialog-transition"
  >
    <basic-modal
      :buttons="buttons"
      class="card-width-560"
      :close-class="{ 'reseller-api-close--locked': submitting }"
      close-testid="reseller-api-delete-close"
      color="error"
      data-testid="reseller-api-delete-modal"
      icon="$alertwarning"
      :loading="submitting"
      :title="t('reseller.apiTokens.modal.delete.title')"
      @button-click="onButton"
      @modal-close="close()"
    >
      <template #custom>
        <div>
          <v-form class="d-flex flex-column">
            <div class="d-flex flex-column">
              <div class="last-child d-flex flex-column align-start w-100">
                <p class="p-2 mb-6">
                  <b>{{ t('message.confirmAction') }}</b>
                </p>

                <checkbox
                  v-model="confirm"
                  color="primary"
                  data-testid="reseller-api-delete-confirm"
                  :label="t('reseller.apiTokens.removeToken')"
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
  // Not persistent, as legacy. Like `McpTokenDeleteModal` the
  // confirm button has no `disabled`; `disabled-gray` (`pointer-events: none`) is what greys it. Deliberate deviations: `submit()` returns
  // early without `confirm` or while submitting (legacy only had the class, so Tab+Enter/Space deleted without confirmation), and
  // the scroll lock of `AppDialog` (legacy has `lockBodyScroll` commented out).
  import type { ResellerApiToken } from '@/views/reseller/reseller.api'
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { deleteResellerApiToken } from '@/views/reseller/reseller.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  const emit = defineEmits<{ 'api-token-deleted': [token: { id: number }] }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const opened = ref(false)

  const token = ref<ResellerApiToken | null>(null)
  const confirm = ref(false)
  const submitting = ref(false)

  // Footer of the kit card: Delete over Cancel. Delete keeps the legacy `disabled-gray` (guard in `submit()`),
  // the X stays visible and locked while the request runs (`loading`, not `submitting`).
  const buttons = computed<ModalButton[]>(() => [
    { id: 'delete', label: t('button.delete'), color: 'error', testId: 'reseller-api-delete-submit', buttonClass: confirm.value ? undefined : 'disabled-gray' },
    cancelButton(t),
  ])

  function onButton (id: string): void {
    if (id === 'delete') {
      void submit()
      return
    }
    if (!submitting.value) {
      close()
    }
  }

  function open (target: ResellerApiToken): void {
    token.value = { ...target }
    confirm.value = false
    opened.value = true
  }

  function close (): void {
    opened.value = false
  }

  async function submit (): Promise<void> {
    if (!confirm.value || submitting.value || !token.value) {
      return
    }
    submitting.value = true
    try {
      const deleted = await deleteResellerApiToken(token.value.id)
      emit('api-token-deleted', deleted)
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

<style lang="scss" scoped>
// Inline pointer-events while submitting, as in legacy. The X is rendered by the kit card,
// so the rule reaches it from the card root.
.basic-modal :deep(.reseller-api-close--locked) {
  pointer-events: none;
}
</style>
