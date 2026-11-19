<template>
  <div>
    <PageTitle
      :title="t('heading.instance.advanced.wordpressConfig.title')"
      variant="advanced"
    >
      <template #filters>
        <data-iterator-filter-controls
          data-testid="wordpress-config-search"
          :search-term="searchTerm"
          :show-search-term="!listFailed"
          @update:search-term="handleSearchTermChange"
        />

        <AppButton
          v-if="listFailed"
          data-testid="wordpress-config-remove-by-name"
          kind="secondary"
          :size="smAndDown ? 'small' : 'large'"
          @click="showRemoveByNameModal"
        >
          {{ t('button.config.removeByName') }}
        </AppButton>

        <PageAddButton
          data-testid="wordpress-config-add"
          :label="t('button.config.create')"
          @click="showCreateModal"
        />
      </template>
    </PageTitle>

    <v-container class="px-0">
      <v-row>
        <v-col cols="12">
          <configs-table
            data-testid="wordpress-config-table"
            :headers="headers"
            :instance-id="instance.id"
            :items="items"
            :items-loading="itemsLoading"
            :items-per-page="itemsPerPage"
            :load-error="loadError"
            :page="page"
            :possible-items-per-page="possibleItemsPerPage"
            :search-term="searchTerm"
            :sort-by="sortBy"
            :sort-desc="sortDesc"
            @action-button-delete="showDeleteModal"
            @action-button-edit="showEditModal"
            @clear-filters="clearFilters"
            @retry="reloadConfig"
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
        data-testid="wordpress-config-modal"
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
          :data-testid="`wordpress-config-modal-field-${field.name}`"
          :field="field"
          :last="index === modal.fields.length - 1"
          :model-value="formValues[field.name]"
          @update:model-value="setFieldValue(field.name, $event)"
        />

        <template #custom>
          <AppMessage
            v-if="modalError"
            class="mb-4"
            data-testid="wordpress-config-modal-error"
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
  import { useDisplay } from 'vuetify'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import { initialFormValues } from '@/shared/ui/modal/initial-form-values'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { configsHeaders } from './configs-table'
  import ConfigsTable from './ConfigsTable.vue'
  import { createConfigModal, deleteConfigModal, editConfigModal, refusedConfigModal, removeByNameConfigModal, withoutConfigFieldMessage, type WordpressConfigModal } from './wordpress-config-modals'
  import { createConfig, deleteConfig, listConfigs, updateConfig, type WordpressConfigItem } from './wordpress-config.api'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()
  const { smAndDown } = useDisplay()

  const headers = computed(() => configsHeaders(t))

  const items = ref<WordpressConfigItem[]>([])
  const itemsLoading = ref(true)
  const loadError = ref<string | null>(null)
  const listFailed = computed(() => loadError.value !== null)

  // Legacy keeps the list in memory: search, sort and paging are client-side, so the load callback is never called.
  // Legacy default sort: the first header (`name`), descending.
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
  let reloadSeq = 0
  async function reloadConfig (): Promise<void> {
    const seq = ++reloadSeq
    itemsLoading.value = true
    try {
      const configs = await listConfigs(props.instance.id)
      if (seq !== reloadSeq) {
        return
      }
      items.value = configs
      loadError.value = null
    } catch (error) {
      if (seq === reloadSeq) {
        loadError.value = getErrorMessage(error)
      }
    } finally {
      if (seq === reloadSeq) {
        itemsLoading.value = false
      }
    }
  }

  // Explicit modal state: the modal is rebuilt on every open.
  const modal = ref<WordpressConfigModal | null>(null)
  // The row the edit and delete modals act on, kept apart from the modal state.
  const modalItem = ref<WordpressConfigItem | null>(null)
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

  useBodyScrollLock(modalOpen)

  // Optional start values: they override the empty fields.
  function openModal (next: WordpressConfigModal, item: WordpressConfigItem | null = null, values: Record<string, unknown> = {}): void {
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
      modal.value = withoutConfigFieldMessage(modal.value, name)
    }
  }

  /** A refused request stays in the dialog: the server's message under the field it names, the rest above the fields. */
  function holdRefusal (error: unknown): void {
    const refused = modal.value ? refusedConfigModal(modal.value, error) : null
    if (!refused) {
      modalError.value = getErrorMessage(error)
      return
    }
    modal.value = refused.modal
    modalError.value = refused.message
  }

  // The modal starts with empty fields.
  function showCreateModal (): void {
    openModal(createConfigModal(t))
  }

  // The recovery of a list the Engine cannot read: the DELETE needs the name and the type only, not the row.
  function showRemoveByNameModal (): void {
    openModal(removeByNameConfigModal(t))
  }

  // The fields start from the row.
  // A secret row carries a mask, so its value starts empty: saving an unchanged mask would overwrite the secret with it.
  function showEditModal (item: WordpressConfigItem): void {
    openModal(editConfigModal(t), item, {
      name: item.name,
      value: item.secret ? '' : item.value,
      type: item.type,
    })
  }

  // The modal closes on success;
  // a refusal keeps it open with the message, so the typed values are not lost.
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
      await createConfig(props.instance.id, {
        name: String(values.name),
        value: String(values.value),
        type: String(values.type),
      })
      alerts.addAlert({ success: true, successMessage: t('notification.instance.wordpressConfig.create.success') })
      void reloadConfig()
      modalOpen.value = false
    } catch (error) {
      holdRefusal(error)
    } finally {
      submitting.value = false
    }
  }

  // The URL takes the name of the row opened (`modalItem`), not the name in the
  // form: a renamed value would otherwise address a config that does not exist. The reload comes before the alert.
  async function submitUpdate (): Promise<void> {
    if (submitting.value) {
      return
    }
    submitting.value = true
    const formValid = (await modalInstance.value?.validate())?.valid === true
    if (!formValid) {
      submitting.value = false
      return
    }
    const rowName = String(modalItem.value?.name ?? '')
    try {
      await updateConfig(props.instance.id, rowName, { ...formValues.value })
      void reloadConfig()
      alerts.addAlert({ success: true, successMessage: t('notification.instance.wordpressConfig.update.success') })
      modalOpen.value = false
    } catch (error) {
      holdRefusal(error)
    } finally {
      submitting.value = false
    }
  }

  // The modal acts on the row opened.
  function showDeleteModal (item: WordpressConfigItem): void {
    openModal(deleteConfigModal(t, item), item)
  }

  // The modal closes in every outcome (`finally`); the list reloads only after a
  // success, and the alert comes before the reload.
  async function submitDelete (item: WordpressConfigItem): Promise<void> {
    if (submitting.value) {
      return
    }
    submitting.value = true
    try {
      await deleteConfig(props.instance.id, String(item.name ?? ''), item.type)
      alerts.addAlert({ success: true, successMessage: t('notification.instance.wordpressConfig.delete.success') })
      void reloadConfig()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalOpen.value = false
      submitting.value = false
    }
  }

  // A refused remove keeps the dialog open: what was typed is the only record of what is being removed.
  async function submitRemoveByName (): Promise<void> {
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
      await deleteConfig(props.instance.id, String(values.name), String(values.type))
      alerts.addAlert({ success: true, successMessage: t('notification.instance.wordpressConfig.delete.success') })
      void reloadConfig()
      modalOpen.value = false
    } catch (error) {
      holdRefusal(error)
    } finally {
      submitting.value = false
    }
  }

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
        if (modalItem.value && confirmed.value) {
          void submitDelete(modalItem.value)
        }

        break
      }
      case 'remove': {
        if (confirmed.value) {
          void submitRemoveByName()
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
    void reloadConfig()
  })
</script>

<style lang="scss" scoped>
// The V2 search input (41px) is centred in its 38px field and overflows by 1.5px on both sides; the narrow mobile field leaves V4 the input
// at the top.
.data-iterator-filter-controls :deep(.v-field__input) {
  align-items: center;
}

.page-title + .v-container {
  padding-top: 0;
  padding-bottom: 12px;

  // Legacy row `margin: -16px` with a 16px column: the table sits 16px below the block start.
  > .v-row > .v-col {
    padding-top: 16px;
  }
}
</style>
