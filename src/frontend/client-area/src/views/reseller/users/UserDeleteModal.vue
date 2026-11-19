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
      close-testid="reseller-user-delete-close"
      color="error"
      confirm-required
      :confirmed="confirm"
      data-testid="reseller-user-delete-modal"
      icon="$alertwarning"
      :submitting="submitting"
      :title="t('heading.instance.advanced.users.modal.delete.title')"
      @button-click="onButton"
      @modal-close="close()"
    >
      <template #custom>
        <div>
          <p
            v-if="user && user.email"
            class="mb-4 p-2"
          >
            {{ t('heading.instance.advanced.users.modal.delete.message', { email: user.email }) }}
          </p>

          <v-form class="d-flex flex-column">
            <div class="d-flex flex-column">
              <div class="last-child d-flex flex-column align-start w-100 pb-4">
                <p class="p-2">
                  <b>{{ t('message.confirmAction') }}</b>
                </p>

                <label class="base--text checkbox-label d-flex align-center p-2">
                  <checkbox
                    color="primary"
                    data-testid="reseller-user-delete-confirm"
                    :label="t('form.confirmDelete.user')"
                    :model-value="confirm"
                    @update:model-value="confirm = $event"
                  />
                </label>
              </div>
            </div>
          </v-form>
        </div>
      </template>
    </basic-modal>
  </AppDialog>
</template>

<script lang="ts" setup>
  // Not persistent, as legacy. Deliberate deviation:
  // `open()` resets `confirm`, because legacy kept the checkbox ticked from the previous open (uncontrolled `Checkbox`).
  import type { ResellerUser } from '@/views/reseller/reseller.api'
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { deleteResellerUser } from '@/views/reseller/reseller.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  const emit = defineEmits<{ 'user-deleted': [user: { id: number }] }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const opened = ref(false)

  const user = ref<ResellerUser | null>(null)
  const confirm = ref(false)
  const submitting = ref(false)

  // Footer of the kit card: Delete (gated by the checkbox) over Cancel; `submitting` hides the X and blocks both.
  const buttons = computed<ModalButton[]>(() => [
    { id: 'delete', label: t('button.delete'), color: 'error', testId: 'reseller-user-delete-submit' },
    cancelButton(t),
  ])

  function onButton (id: string): void {
    if (id === 'delete') {
      void submit()
      return
    }
    close()
  }

  function open (target: ResellerUser): void {
    user.value = { ...target }
    confirm.value = false
    opened.value = true
  }

  function close (): void {
    opened.value = false
  }

  async function submit (): Promise<void> {
    if (!user.value) {
      return
    }
    submitting.value = true
    try {
      const deleted = await deleteResellerUser(user.value.id)
      emit('user-deleted', deleted)
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
// The card frame (title, icon, X, actions) is the kit `BasicModal`; only the rule of the slot content stays.
.v-card-text p {
  margin-top: 0;
}
</style>
