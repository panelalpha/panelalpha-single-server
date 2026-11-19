<template>
  <div>
    <PageTitle
      :title="t('heading.instance.advanced.users.title')"
      variant="advanced"
    >
      <template #filters>
        <data-iterator-filter-controls
          data-testid="wordpress-users-search"
          :search-term="searchTerm"
          :show-search-term="true"
          @update:search-term="handleSearchTermChange"
        />

        <PageAddButton
          data-testid="wordpress-users-add"
          :label="t('button.user.create')"
          @click="showCreateModal"
        />
      </template>
    </PageTitle>

    <v-container class="px-0 wordpress-users-content">
      <v-row>
        <v-col cols="12">
          <wordpress-users-table
            data-testid="wordpress-users-table"
            :headers="headers"
            :items="items"
            :items-loading="itemsLoading"
            :items-per-page="itemsPerPage"
            :page="page"
            :possible-items-per-page="possibleItemsPerPage"
            :search-term="searchTerm"
            :sort-by="sortBy"
            :sort-desc="sortDesc"
            @action-button-delete="showDeleteModal"
            @action-button-edit="showEditModal"
            @action-button-reset-password="showResetModal"
            @clear-filters="clearFilters"
            @update:items-per-page="changePerPage"
            @update:page="changePage"
            @update:sort-by="changeSortBy"
            @update:sort-desc="changeSortDesc"
          />
        </v-col>
      </v-row>
    </v-container>

    <AppDialog
      v-model="modalOpen"
      overlay
      :persistent="submitting"
      scroll-lock="mobile"
      transition="custom-dialog-transition"
      @after-leave="clearFormValues"
    >
      <basic-modal
        v-if="modal"
        :key="modalRender"
        ref="modalRef"
        :buttons="modal.buttons"
        class="card-width-560"
        :color="modal.color"
        :confirm-required="modal.kind === 'delete'"
        :confirmed="confirmed"
        data-testid="wordpress-users-modal"
        :icon="modal.icon"
        :message="modal.message"
        :submitting="submitting"
        :title="modal.title"
        @button-click="onModalButton"
        @modal-close="modalClose"
      >
        <basic-modal-field
          v-for="(field, index) in modal.fields"
          :key="field.name"
          :data-testid="`wordpress-users-modal-field-${field.name}`"
          :field="field"
          :last="index === modal.fields.length - 1"
          :model-value="formValues[field.name]"
          @update:model-value="setFieldValue(field.name, $event)"
        />

        <template #custom>
          <AppMessage
            v-if="modalError"
            class="mb-4"
            data-testid="wordpress-users-modal-error"
            role="alert"
            variant="error"
          >
            <span>{{ modalError }}</span>
          </AppMessage>
        </template>
      </basic-modal>
    </AppDialog>
  </div>
</template>

<script lang="ts" setup>
  import type { InstanceResource } from '@/entities/project/instance-resource'
  // Identical in app and app-lite.
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref, useTemplateRef } from 'vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import { useCopyText } from '@/shared/ui/buttons/use-copy-text'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import { initialFormValues } from '@/shared/ui/modal/initial-form-values'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import {
    createWordpressUserModal,
    deleteWordpressUserModal,
    editWordpressUserModal,
    refusedWordpressUserModal,
    resetWordpressUserPasswordDoneModal,
    resetWordpressUserPasswordModal,
    withoutWordpressUserFieldMessage,
    type WordpressUsersModal,
  } from './wordpress-users-modals'
  import { registeredText, type WordpressUserRow, wordpressUsersHeaders } from './wordpress-users-table'
  import {
    createWordpressUser,
    deleteWordpressUser,
    listWordpressUsers,
    resetWordpressUserPassword,
    updateWordpressUser,
    type WordpressUser,
  } from './wordpress-users.api'
  import WordpressUsersTable from './WordpressUsersTable.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const headers = computed(() => wordpressUsersHeaders(t))

  const items = ref<WordpressUserRow[]>([])
  const itemsLoading = ref(true)

  // Legacy keeps the list in memory: search, sort and paging are client-side, so the load callback is never called.
  // Legacy default sort: the `id` column, descending.
  const {
    page,
    itemsPerPage,
    possibleItemsPerPage,
    sortBy,
    sortDesc,
    searchTerm,
    changePage,
    changePerPage,
    changeSortBy,
    changeSortDesc,
    handleSearchTermChange,
    clearFilters,
  } = useDataIteratorPageState({
    load: () => {
      // Client-side list: nothing to reload on a page, sort or search change.
    },
    serverProvided: false,
    itemsPerPage: 8,
    possibleItemsPerPage: [[8, 16, 24]],
    sortBy: headers.value.find(header => header.value === 'id') ?? false,
    sortDesc: true,
  })

  // A response of an older request is dropped, so it cannot overwrite the rows of the latest one.
  // Legacy `reloadItems` keeps the rows while it loads. Its GET has no error branch, so the skeleton stayed: here the error ends the
  // loading state, empties the list and shows the alert.
  let reloadSeq = 0
  async function reloadItems (): Promise<void> {
    const seq = ++reloadSeq
    itemsLoading.value = true
    try {
      const users = await listWordpressUsers(props.instance.id)
      if (seq !== reloadSeq) {
        return
      }
      // The registration date text is computed once per load.
      items.value = users.map(user => ({ ...user, user_registered_text: registeredText(user.user_registered) }))
    } catch (error) {
      if (seq !== reloadSeq) {
        return
      }
      items.value = []
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      if (seq === reloadSeq) {
        itemsLoading.value = false
      }
    }
  }

  // Explicit modal state: the modal is rebuilt on every open.
  const modal = ref<WordpressUsersModal | null>(null)
  // The row the edit, reset and delete modals act on, kept apart from the modal state. Create has none.
  const modalItem = ref<WordpressUser | null>(null)
  const modalOpen = ref(false)
  const submitting = ref(false)
  // A refused create or edit stays open with the server's message above the fields (under them the ones that name one).
  const modalError = ref('')
  const modalRender = ref(0)
  // The values of the modal fields.
  const formValues = ref<Record<string, unknown>>({})
  // The modal's exposed `validate()`.
  const modalInstance = useTemplateRef<{ validate: () => Promise<{ valid: boolean }> }>('modalRef')
  // The required `confirm` checkbox of Delete gates its button.
  const confirmed = computed(() => formValues.value.confirm === true)

  // The page does not scroll behind the open modal.
  useBodyScrollLock(modalOpen)

  // Optional start values: they override the empty fields.
  function openModal (next: WordpressUsersModal, item: WordpressUser | null = null, values: Record<string, unknown> = {}): void {
    modalRender.value++
    modalError.value = ''
    formValues.value = { ...initialFormValues(next.fields), ...values }
    modalItem.value = item
    modal.value = next
    modalOpen.value = true
  }

  // Cancel, the close button and the overlay close the modal, unless a request is running.
  function modalClose (): void {
    if (!submitting.value) {
      modalOpen.value = false
    }
  }

  function clearFormValues (): void {
    formValues.value = {}
  }

  function setFieldValue (name: string, value: unknown): void {
    formValues.value = { ...formValues.value, [name]: value }
    if (modal.value) {
      modal.value = withoutWordpressUserFieldMessage(modal.value, name)
    }
  }

  /** A refused request stays in the dialog: the server's message under the field it names, the rest above the fields. */
  function holdRefusal (error: unknown): void {
    const refused = modal.value ? refusedWordpressUserModal(modal.value, error) : null
    if (!refused) {
      modalError.value = getErrorMessage(error)
      return
    }
    modal.value = refused.modal
    modalError.value = refused.message
  }

  // The modal starts with empty fields.
  function showCreateModal (): void {
    openModal(createWordpressUserModal(t))
  }

  // A throwing `validate()` counts as invalid, so `submitting` never stays `true` and the persistent dialog can always be closed.
  async function validateForm (): Promise<boolean> {
    try {
      return (await modalInstance.value?.validate())?.valid === true
    } catch {
      return false
    }
  }

  // A success closes the modal and
  // reloads the list after the alert; a refused create keeps the dialog open with the server's message, so its values are not lost.
  async function submitCreate (): Promise<void> {
    if (submitting.value) {
      return
    }
    submitting.value = true
    const formValid = await validateForm()
    if (!formValid) {
      submitting.value = false
      return
    }
    const values = formValues.value
    try {
      await createWordpressUser(props.instance.id, {
        username: String(values.username),
        email: String(values.email),
        display_name: String(values.display_name),
        password: String(values.password),
        role: String(values.role),
        send_email: values.send_email === true,
      })
      alerts.addAlert({ success: true, successMessage: t('notification.instance.user.create.success') })
      void reloadItems()
      modalOpen.value = false
    } catch (error) {
      holdRefusal(error)
    } finally {
      submitting.value = false
    }
  }

  // The modal opens on the row, with its values as the start values. The
  // password stays empty (`null`) unless the user types one.
  function showEditModal (item: WordpressUserRow): void {
    openModal(editWordpressUserModal(t), item, { ...item })
  }

  // The URL takes the id of the row
  // opened (`modalItem`), and the body is the whole `formValues`. A success reloads the list before the alert and closes the modal; a
  // refused update keeps it open with the server's message.
  async function submitUpdate (): Promise<void> {
    if (submitting.value) {
      return
    }
    submitting.value = true
    const formValid = await validateForm()
    if (!formValid) {
      submitting.value = false
      return
    }
    if (!modalItem.value) {
      submitting.value = false
      return
    }
    const userId = modalItem.value.id
    try {
      await updateWordpressUser(props.instance.id, userId, { ...formValues.value })
      void reloadItems()
      alerts.addAlert({ success: true, successMessage: t('notification.instance.user.update.success') })
      modalOpen.value = false
    } catch (error) {
      holdRefusal(error)
    } finally {
      submitting.value = false
    }
  }

  // The modal opens on the row, the email comes from it.
  function showDeleteModal (item: WordpressUserRow): void {
    openModal(deleteWordpressUserModal(t, item), item)
  }

  // The URL takes the row email, encoded in the path. The modal
  // closes in every outcome (`finally`); the alert comes before the reload, and the reload runs only after a success.
  async function submitDelete (item: WordpressUser): Promise<void> {
    if (submitting.value) {
      return
    }
    submitting.value = true
    try {
      await deleteWordpressUser(props.instance.id, item.email)
      alerts.addAlert({ success: true, successMessage: t('notification.instance.user.delete.success') })
      void reloadItems()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalOpen.value = false
      submitting.value = false
    }
  }

  // The warning opens on the row, no fields.
  function showResetModal (item: WordpressUserRow): void {
    openModal(resetWordpressUserPasswordModal(t, item), item)
  }

  // The body is the whole row, no validation. On success the same modal stays open
  // and shows the new password; the done state has one Close button, so nothing can reset the password shown. The modal stays open
  // in every outcome and there is no reload.
  async function submitReset (item: WordpressUser): Promise<void> {
    if (submitting.value) {
      return
    }
    submitting.value = true
    try {
      const newPassword = await resetWordpressUserPassword(props.instance.id, { ...item })
      alerts.addAlert({ success: true, successMessage: t('notification.instance.user.resetPassword.success') })
      // Swap the content without `openModal`: `modalRender` and `modalItem` stay, so the dialog keeps its identity.
      modal.value = resetWordpressUserPasswordDoneModal(t)
      setFieldValue('new_password', newPassword)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }

  /** The password of the done state, for its Copy button (`useCopyText` swallows a missing clipboard API and a refused write). */
  const { copy: copyNewPassword } = useCopyText(() => {
    const value = formValues.value.new_password
    return typeof value === 'string' ? value : undefined
  })

  function onModalButton (id: string): void {
    switch (id) {
      case 'create': {
        void submitCreate()

        break
      }
      case 'update': {
        void submitUpdate()

        break
      }
      case 'delete': {
        // The Delete button stays disabled until the confirm checkbox is ticked; the guard keeps the handler to the same rule.
        if (modalItem.value && confirmed.value) {
          void submitDelete(modalItem.value)
        }

        break
      }
      case 'reset': {
        // The row is kept in `modalItem` after a success, so the done state's Close ends the dialog without another reset.
        if (modalItem.value) {
          void submitReset(modalItem.value)
        }

        break
      }
      case 'close': {
        modalClose()

        break
      }
      case 'copy': {
        void copyNewPassword()

        break
      }
      case 'cancel': {
        modalClose()

        break
      }
    // No default: every button of the modals is handled above.
    }
  }

  onMounted(() => {
    void reloadItems()
  })
</script>

<style lang="scss" scoped>
.wordpress-users-content {
  padding-top: 16px;
  padding-bottom: 12px;
}
</style>
