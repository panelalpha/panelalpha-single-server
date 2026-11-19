<template>
  <div>
    <PageTitle
      :title="t('heading.instance.advanced.users.title')"
      variant="advanced"
    >
      <template #filters>
        <data-iterator-filter-controls
          data-testid="users-search"
          :search-term="searchTerm"
          :show-search-term="true"
          @update:search-term="handleSearchTermChange"
        />

        <PageAddButton
          data-testid="users-add"
          :label="t('button.user.create')"
          :loading="createModalLoading"
          @click="showCreateModal"
        />
      </template>
    </PageTitle>

    <v-container class="px-0">
      <v-row>
        <v-col cols="12">
          <users-table
            data-testid="users-table"
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
            @action-button-reset-password="showResetPasswordModal"
            @clear-filters="clearFilters"
            @update:items-per-page="changePerPage"
            @update:page="changePage"
            @update:sort-by="changeSortBy"
            @update:sort-desc="changeSortDesc"
          >
            <template #no-data>
              <EmptyState
                data-testid="users-empty"
                :title="t('heading.instance.advanced.users.noData')"
              >
                <template #image>
                  <plugins-illustration />
                </template>
              </EmptyState>
            </template>
          </users-table>
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
        data-testid="users-modal"
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
          :data-testid="`users-modal-field-${field.name}`"
          :field="field"
          :last="index === modal.fields.length - 1"
          :model-value="formValues[field.name]"
          @update:model-value="setFieldValue(field.name, $event)"
        />
      </basic-modal>
    </AppDialog>
  </div>
</template>

<script lang="ts" setup>
  import type { InstanceAppUser } from './users.api'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  // The page exists in app-lite only.
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref, useTemplateRef } from 'vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import PluginsIllustration from '@/shared/ui/illustrations/PluginsIllustration.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { createUserModal, deleteUserModal, resetPasswordModal, type UsersModal } from './users-modals'
  import { usersHeaders } from './users-table'
  import { createUser, deleteUser, listUserRoles, listUsers, resetUserPassword } from './users.api'
  import UsersTable from './UsersTable.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const headers = computed(() => usersHeaders(t))

  const items = ref<InstanceAppUser[]>([])
  const itemsLoading = ref(true)

  // Legacy default sort: the first header, the id column, descending.
  // Legacy `isServerProvided` is true, but the list is sorted, searched and paged in memory, so the load callback is never called.
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
    sortBy: headers.value[0] ?? false,
    sortDesc: true,
  })

  // A response of an older request is dropped, so it cannot overwrite the rows of the latest one.
  // Legacy keeps the rows and the page, sort and search while it loads; the table is not cleared here.
  let reloadSeq = 0
  async function reloadItems (): Promise<void> {
    const seq = ++reloadSeq
    itemsLoading.value = true
    try {
      const users = await listUsers(props.instance.id)
      if (seq !== reloadSeq) {
        return
      }
      items.value = users
    } catch (error) {
      if (seq !== reloadSeq) {
        return
      }
      // Deviation from legacy: legacy has no error branch, so the skeleton stayed with no message.
      items.value = []
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      if (seq === reloadSeq) {
        itemsLoading.value = false
      }
    }
  }

  // Explicit modal state: the modal is rebuilt on every open.
  const modal = ref<UsersModal | null>(null)
  // The row the reset/delete modal acts on, kept apart from the modal state.
  const modalItem = ref<InstanceAppUser | null>(null)
  const modalOpen = ref(false)
  const submitting = ref(false)
  const modalRender = ref(0)
  // The values of the modal fields.
  const formValues = ref<Record<string, unknown>>({})
  // The modal's exposed `validate()`.
  const modalInstance = useTemplateRef<{ validate: () => Promise<{ valid: boolean }> }>('modalRef')
  // The required `confirm` checkbox of Delete gates its button.
  const confirmed = computed(() => formValues.value.confirm === true)

  useBodyScrollLock(modalOpen)

  // The roles are fetched on the first Create and kept for the page life.
  const createModalLoading = ref(false)
  let availableRoles: string[] = []
  let rolesLoaded = false

  function openModal (next: UsersModal): void {
    modalRender.value++
    formValues.value = Object.fromEntries(next.fields.map(field => [field.name, null]))
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
  }

  // A failed roles request shows the alert and no modal, and the spinner stops (legacy had no error branch, so the spinner stayed
  // on).
  async function showCreateModal (): Promise<void> {
    if (createModalLoading.value) {
      return
    }
    createModalLoading.value = true
    try {
      if (!rolesLoaded) {
        availableRoles = await listUserRoles(props.instance.id)
        rolesLoaded = true
      }
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      return
    } finally {
      createModalLoading.value = false
    }
    openModal(createUserModal(t, availableRoles))
  }

  // The modal stays open and closable after a failed request (legacy kept `persistent` on).
  async function submitCreate (): Promise<void> {
    if (submitting.value) {
      return
    }
    submitting.value = true
    const formValid = (await modalInstance.value?.validate())?.valid === true
    if (!formValid) {
      submitting.value = false
      return
    }
    const values = formValues.value
    try {
      await createUser(props.instance.id, {
        username: String(values.username),
        email: String(values.email),
        password: String(values.password),
        role: String(values.role),
      })
      alerts.addAlert({ success: true, successMessage: t('notification.instance.user.create.success') })
      void reloadItems()
      modalOpen.value = false
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }

  function showResetPasswordModal (item: InstanceAppUser): void {
    modalItem.value = item
    openModal(resetPasswordModal(t))
  }

  // The form is validated first (legacy did not), success shows an alert (the key exists, legacy shows none), and a failed request
  // leaves the modal open and closable (legacy kept `persistent`). The list is not reloaded, as in legacy.
  async function submitResetPassword (): Promise<void> {
    if (submitting.value) {
      return
    }
    submitting.value = true
    const formValid = (await modalInstance.value?.validate())?.valid === true
    const item = modalItem.value
    if (!formValid || !item) {
      submitting.value = false
      return
    }
    try {
      await resetUserPassword(props.instance.id, item.id, { ...item, password: String(formValues.value.password) })
      alerts.addAlert({ success: true, successMessage: t('notification.instance.user.resetPassword.success') })
      modalOpen.value = false
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }

  function showDeleteModal (item: InstanceAppUser): void {
    modalItem.value = item
    openModal(deleteUserModal(t, item))
  }

  // The modal closes in every outcome (`finally`), and the list reloads only after a success.
  async function submitDelete (item: InstanceAppUser): Promise<void> {
    submitting.value = true
    try {
      await deleteUser(props.instance.id, item.id)
      alerts.addAlert({ success: true, successMessage: t('notification.instance.user.delete.success') })
      void reloadItems()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalOpen.value = false
      submitting.value = false
    }
  }

  function onModalButton (id: string): void {
    switch (id) {
      case 'create': {
        void submitCreate()

        break
      }
      case 'reset': {
        void submitResetPassword()

        break
      }
      case 'delete': {
        if (modalItem.value && confirmed.value) {
          void submitDelete(modalItem.value)
        }

        break
      }
      case 'cancel': {
        modalClose()

        break
      }
    // No default
    }
  }

  onMounted(() => {
    void reloadItems()
  })
</script>
