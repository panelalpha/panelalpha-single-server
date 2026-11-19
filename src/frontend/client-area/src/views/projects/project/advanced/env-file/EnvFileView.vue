<template>
  <div class="advanced-hosting-page">
    <!-- The title, the search (once there are rows), Import and Add. The labels of the two buttons are empty on mobile. -->
    <PageTitle
      :title="t('heading.instance.advanced.envFile.title')"
      title-testid="env-title"
      variant="advanced"
    >
      <template #filters>
        <data-iterator-filter-controls
          v-if="items.length > 0"
          class="ml-4 my-hostings-search"
          data-testid="env-search"
          :full-width-lg="false"
          :full-width-md="true"
          :full-width-search="false"
          :search-term="searchTerm"
          :show-search-term="true"
          @update:search-term="handleSearchTermChange"
        />

        <AppButton
          v-if="items.length > 0"
          class="p-2 mr-2 page-title__add-button"
          data-testid="env-import"
          kind="field"
          :size="smAndDown ? undefined : 'large'"
          @click="showImportModal"
        >
          <v-icon
            :class="mobile ? 'mr-0' : ''"
            icon="$download"
          />
          {{ ` ${mobile ? '' : t('heading.instance.advanced.envFile.import')} ` }}
        </AppButton>

        <PageAddButton
          v-if="items.length > 0"
          data-testid="env-add"
          :label="t('heading.instance.advanced.envFile.addVariable')"
          @click="showAddModal"
        />
      </template>
    </PageTitle>

    <!-- The title row has no bottom margin (see the style below), so the table keeps the 16px legacy column padding above it. -->
    <v-container :class="isWordpress ? 'mt-3 px-0 pt-4 pb-0' : 'mt-3 px-0 pt-4 pb-3'">
      <v-row>
        <v-col
          v-if="isWordpress"
          class="pb-2"
          cols="12"
        >
          <v-card elevation="4">
            <v-card-text class="text-center pa-6">
              <p class="mb-0">
                {{ t('heading.instance.advanced.envFile.wordpressNotice') }}
              </p>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col
          v-else
          cols="12"
        >
          <env-vars-table
            :items="items"
            :items-loading="itemsLoading"
            :items-per-page="itemsPerPage"
            :page="page"
            :search-term="searchTerm"
            :sort-by="sortBy"
            :sort-desc="sortDesc"
            @clear-filters="searchTerm = ''"
            @delete-item="showDeleteModal"
            @edit-item="showEditModal"
            @update:items-per-page="changePerPage"
            @update:page="changePage"
            @update:sort-by="changeSortBy"
            @update:sort-desc="changeSortDesc"
          >
            <template #no-data>
              <!-- The empty state carries Import (outlined) and Add in its action slot, `large` on desktop and `small` below
                   `smAndDown`; their labels are empty on mobile. Their modals are the Import and Add modals of the header. -->
              <EmptyState
                data-testid="env-empty"
                :desc="t('heading.instance.advanced.envFile.empty.description')"
                :title="t('heading.instance.advanced.envFile.empty.title')"
              >
                <template #image>
                  <hosting-databases-illustration />
                </template>

                <template #action>
                  <AppButton
                    class="p-2"
                    data-testid="env-empty-import"
                    kind="field"
                    :size="smAndDown ? 'small' : 'large'"
                    @click="showImportModal"
                  >
                    <v-icon
                      :class="mobile ? 'mr-0' : ''"
                      icon="$download"
                    />
                    {{ ` ${mobile ? '' : t('heading.instance.advanced.envFile.import')} ` }}
                  </AppButton>

                  <page-add-button
                    data-testid="env-empty-add"
                    :label="t('heading.instance.advanced.envFile.addVariable')"
                    @click="showAddModal"
                  />
                </template>
              </EmptyState>
            </template>
          </env-vars-table>
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
        :affix-link="modal.affixLink"
        :buttons="modal.buttons"
        class="card-width-560"
        :color="modal.color"
        :confirm-required="modal.kind === 'delete'"
        :confirmed="confirmed"
        data-testid="env-modal"
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
          :data-testid="`env-modal-field-${field.name}`"
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
  import type { EnvFileMeta } from './env-file.api'
  import type { EnvVariable } from './env-vars'
  import type { EnvFormValues, EnvModal } from './env-vars-modals'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  // Copy keys: `heading.instance.advanced.envFile.*`.
  import { useTranslation } from 'i18next-vue'
  import { computed, getCurrentScope, onMounted, onScopeDispose, ref, useTemplateRef } from 'vue'
  import { useRoute } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import HostingDatabasesIllustration from '@/shared/ui/illustrations/HostingDatabasesIllustration.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import { initialFormValues } from '@/shared/ui/modal/initial-form-values'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { getEnvFile, getEnvFileMeta, putEnvFile } from './env-file.api'
  import { addVariable, importVariables, listVariables, removeVariable, updateVariable } from './env-vars'
  import { addModal, deleteModal, editModal, importModal } from './env-vars-modals'
  import EnvVarsTable from './EnvVarsTable.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  // The prefix of every copy key of this page.
  const T = 'heading.instance.advanced.envFile'
  const alerts = useAlertsStore()
  const { mobile, smAndDown } = useDisplay()

  const itemsLoading = ref(true)
  const items = ref<EnvVariable[]>([])
  // The file text of the last read: the baseline every modal rule and the save check compare against.
  const snapshot = ref('')
  const meta = ref<EnvFileMeta>({
    is_git_repo: false,
    is_dind: false,
    supports_restart: false,
    default_env_dir: null,
    default_env_path: null,
    app_type: null,
  })
  const isWordpress = computed(() => meta.value.app_type === 'wordpress')

  // The modal is rebuilt on every open (`modalRender`); `submitting` also keeps the dialog persistent.
  const modal = ref<EnvModal | null>(null)
  const modalOpen = ref(false)
  const modalRender = ref(0)
  const submitting = ref(false)
  // The values of the modal fields.
  const formValues = ref<EnvFormValues>({})
  // The row an open Edit modal was opened for: its `line` is where the save writes.
  const editItem = ref<EnvVariable | null>(null)
  // The row an open Delete modal was opened for: its `line` is the one the save removes.
  const deleteItem = ref<EnvVariable | null>(null)
  // The required `confirm` checkbox of Delete gates its button.
  const confirmed = computed(() => formValues.value.confirm === true)
  // The modal's exposed `validate()` (`BasicModal.vue` defineExpose).
  const modalInstance = useTemplateRef<{ validate: () => Promise<{ valid: boolean }> }>('modalRef')
  // Legacy dispatches `lockBodyScroll` on open: the body lock is here, the mobile lock is the `scroll-lock` of `AppDialog`.
  useBodyScrollLock(modalOpen)

  // The File Manager of the same project or instance, from the current route.
  const route = useRoute()
  const fileManagerPath = computed(() => `/${route.path.split('/', 2)[1]}/${route.params.id}/advanced/file-manager`)

  // Legacy `isServerProvided: false`: search, sort and paging run on the loaded rows, so the load callback is never called.
  const {
    page,
    itemsPerPage,
    sortBy,
    sortDesc,
    searchTerm,
    changePage,
    changePerPage,
    changeSortBy,
    changeSortDesc,
    handleSearchTermChange,
  } = useDataIteratorPageState({
    load: () => {
      // Client-side list: nothing to reload on a page, sort or search change.
    },
    serverProvided: false,
    itemsPerPage: 8,
    possibleItemsPerPage: [[8, 16, 24]],
    sortDesc: false,
  })

  // Once the page is left, an answer still in flight is dropped (no state write, no alert).
  let disposed = false
  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
    })
  }

  /** The meta first; WordPress stops there (the file is never read). */
  async function loadMetaAndFile (): Promise<void> {
    itemsLoading.value = true
    try {
      const nextMeta = await getEnvFileMeta(props.instance.hostingId as number, props.instance.id)
      if (disposed) {
        return
      }
      meta.value = nextMeta
      if (nextMeta.app_type === 'wordpress') {
        return
      }
      await reloadData()
    } catch (error) {
      if (disposed) {
        return
      }
      alerts.addAlert({ success: false, errorMessage: t('heading.instance.advanced.envFile.loadError') + ' ' + getErrorMessage(error) })
    } finally {
      if (!disposed) {
        itemsLoading.value = false
      }
    }
  }

  /** A fresh read of the default path; no default path means no rows. */
  async function reloadData (): Promise<void> {
    itemsLoading.value = true
    try {
      const path = meta.value.default_env_path
      if (!path) {
        snapshot.value = ''
        items.value = []
        return
      }
      const { contents } = await getEnvFile(props.instance.hostingId as number, props.instance.id, path)
      if (disposed) {
        return
      }
      snapshot.value = contents || ''
      items.value = listVariables(snapshot.value)
    } catch (error) {
      if (disposed) {
        return
      }
      alerts.addAlert({ success: false, errorMessage: t('heading.instance.advanced.envFile.loadError') + ' ' + getErrorMessage(error) })
    } finally {
      if (!disposed) {
        itemsLoading.value = false
      }
    }
  }

  /** The file text of the default path, `''` when the server sends none. */
  async function fetchContents (path: string): Promise<string> {
    const { contents } = await getEnvFile(props.instance.hostingId as number, props.instance.id, path)
    return contents || ''
  }

  // The modal starts from its own initial values; the rebuilt `modalRender` key resets the fields.
  function openModal (next: EnvModal): void {
    modalRender.value++
    formValues.value = { ...initialFormValues(next.fields), ...next.initialValues }
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

  // The key rules read the snapshot, and the server decides between the restart checkbox and the
  // File Manager link.
  function showAddModal (): void {
    openModal(addModal(t, snapshot.value, {
      supportsRestart: meta.value.supports_restart,
      fileManagerPath: fileManagerPath.value,
    }))
  }

  /**
   * A fresh read first, so a file changed elsewhere is not overwritten (`staleError`: the modal closes and the
   * rows reload). Then the PUT of the whole file in raw mode. The modal closes once the request is answered; errors only alert.
   */
  async function mutate (fn: (text: string) => string, restart: boolean, successMessage?: (restarted: boolean) => string): Promise<void> {
    submitting.value = true
    const path = meta.value.default_env_path ?? ''
    try {
      const fresh = await fetchContents(path)
      if (fresh !== snapshot.value) {
        alerts.addAlert({ success: false, errorMessage: t(`${T}.staleError`) })
        modalOpen.value = false
        void reloadData()
        return
      }
      const result = await putEnvFile(props.instance.hostingId as number, props.instance.id, {
        path,
        mode: 'raw',
        contents: fn(snapshot.value),
        restart: restart && meta.value.supports_restart,
      })
      modalOpen.value = false
      void reloadData()
      const message = successMessage
        ? successMessage(result.restarted)
        : t(result.restarted ? `${T}.restarted` : `${T}.saved`)
      alerts.addAlert({ success: true, successMessage: message })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: t(`${T}.saveError`) + ' ' + getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }

  // Before each save: an invalid form sends nothing, a valid one hands its values to `save`.
  async function submitValidated (save: (values: EnvFormValues) => Promise<void>): Promise<void> {
    if (submitting.value) {
      return
    }
    submitting.value = true
    const valid = (await modalInstance.value?.validate())?.valid === true
    if (!valid) {
      submitting.value = false
      return
    }
    await save(formValues.value)
  }

  // The Add save: `mutate` adds the line with the typed key and value.
  async function submitAdd (): Promise<void> {
    await submitValidated(async ({ key, value, restart }) => {
      await mutate(text => addVariable(text, String(key ?? ''), String(value ?? '')), restart === true)
    })
  }

  // The Import save: the counts come from the snapshot (the alert), the write from the fresh text inside `mutate`.
  async function submitImport (): Promise<void> {
    await submitValidated(async ({ contents, overwrite, restart }) => {
      const pasted = String(contents ?? '')
      const options = { overwrite: overwrite === true }
      const counts = importVariables(snapshot.value, pasted, options)
      await mutate(
        text => importVariables(text, pasted, options).text,
        restart === true,
        restarted => t(`${T}.imported`, { added: counts.added, updated: counts.updated, skipped: counts.skipped })
          + (restarted ? ' ' + t(`${T}.restarted`) : ''),
      )
    })
  }

  // The Import modal: the textarea, the overwrite checkbox, restart only with `supports_restart`.
  function showImportModal (): void {
    openModal(importModal(t, snapshot.value, { supportsRestart: meta.value.supports_restart }))
  }

  // The Edit save: `mutate` rewrites the row's own line (`item.line`) with the typed key and value.
  async function submitEdit (item: EnvVariable): Promise<void> {
    await submitValidated(async ({ key, value, restart }) => {
      await mutate(text => updateVariable(text, item.line, String(key ?? ''), String(value ?? '')), restart === true)
    })
  }

  // The key is validated against the snapshot without the row's own line; the value starts as the current one.
  function showEditModal (item: EnvVariable): void {
    editItem.value = item
    openModal(editModal(t, item, snapshot.value, { supportsRestart: meta.value.supports_restart }))
  }

  // The Delete save: `mutate` removes the row's own line (`item.line`).
  async function submitDelete (item: EnvVariable): Promise<void> {
    await submitValidated(async ({ restart }) => {
      await mutate(text => removeVariable(text, item.line), restart === true)
    })
  }

  // The Delete modal: the message carries the escaped key, the confirm checkbox gates Delete.
  function showDeleteModal (item: EnvVariable): void {
    deleteItem.value = item
    openModal(deleteModal(t, item, { supportsRestart: meta.value.supports_restart }))
  }

  function onModalButton (id: string): void {
    switch (id) {
      case 'save': {
        if (modal.value?.kind === 'add') {
          void submitAdd()
        }

        if (modal.value?.kind === 'edit' && editItem.value) {
          void submitEdit(editItem.value)
        }

        break
      }
      case 'import': {
        if (modal.value?.kind === 'import') {
          void submitImport()
        }

        break
      }
      case 'delete': {
        if (modal.value?.kind === 'delete' && deleteItem.value && confirmed.value) {
          void submitDelete(deleteItem.value)
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
    void loadMetaAndFile()
  })
</script>
