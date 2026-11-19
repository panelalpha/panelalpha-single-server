<template>
  <div :class="isProject ? 'advanced-hosting-page' : undefined">
    <!-- `project`: the frame (global `.page-title--advanced`; V4 `.v-col`/`.v-row`/`.v-container` paddings and the row margin beat the global rules, so they are set by utilities as on FTP: V2 container 12 px, cols 0, row without bottom margin). -->
    <PageTitle
      :filters-visible="items.length > 0"
      :title="t('heading.hosting.cron.title')"
      title-testid="cron-title"
      :variant="isProject ? 'advanced' : 'section'"
    >
      <template #filters>
        <ActiveServerAccountSelector
          v-if="!isProject && service.server_accounts.length > 1"
          v-model="selectedAccount"
          class="mr-4"
          data-testid="cron-account-selector"
          :items="service.server_accounts"
        />

        <DataIteratorFilterControls
          class="my-hostings-search"
          :full-width-lg="false"
          :full-width-md="true"
          :full-width-search="false"
          :keys="false"
          :search-term="searchTerm"
          :show-search-term="true"
          @update:search-term="handleSearchTermChange"
        />

        <PageAddButton
          data-testid="cron-add"
          :disabled="noServices"
          :label="t('button.cron.add')"
          @click="openAdd"
        />
      </template>
    </PageTitle>

    <!-- `project`: `pt-0` as on FTP; the hosting variant keeps the 12 px of `hosting-screen.scss`. -->
    <v-container :class="isProject ? 'mt-3 px-0 pt-0' : 'mt-3 px-0'">
      <!-- A container project without containers has nothing for a job to run in, so Add would only open a dialog that cannot be submitted. -->
      <v-row v-if="noServices">
        <v-col cols="12">
          <AppMessage
            class="mb-4 cron-no-services-alert"
            data-testid="cron-no-services"
            role="alert"
            variant="warning"
          >
            <p>{{ t('message.hosting.cron.noServices') }}</p>
          </AppMessage>
        </v-col>
      </v-row>

      <v-row>
        <v-col cols="12">
          <DataTable
            v-if="selectedAccount && !selectedAccount.diagnostic_mode"
            data-testid="cron-table"
            :headers="headers"
            :item-class="itemClass"
            :items="items"
            :items-loading="loading"
            :items-per-page="Number(itemsPerPage)"
            :items-total="items.length"
            :page="page"
            :possible-items-per-page="possibleItemsPerPage"
            :search-term="searchTerm"
            :sort-by="sortBy"
            :sort-desc="sortDesc"
            @clear-filters="clearFilters"
            @update:items-per-page="changePerPage"
            @update:page="changePage"
            @update:sort-by="changeSortBy"
            @update:sort-desc="changeSortDesc"
          >
            <template #no-data>
              <ErrorCard
                v-if="loadError !== null"
                data-testid="cron-load-error"
                :message="loadError"
                retryable
                @retry="reloadData()"
              />

              <EmptyState
                v-else
                :desc="t('message.emptyTable.cron.description')"
                :title="t('message.emptyTable.cron.title')"
              >
                <template #image>
                  <HostingCronJobsIllustration />
                </template>

                <template #action>
                  <PageAddButton
                    class="cron-empty-add"
                    data-testid="cron-empty-add"
                    :disabled="noServices"
                    :label="t('button.cron.add')"
                    @click="openAdd"
                  />
                </template>
              </EmptyState>
            </template>

            <template #actions="row">
              <AppButton
                :aria-label="t('button.cron.update')"
                data-testid="cron-row-edit"
                kind="row-action"
                :tooltip="t('button.cron.update')"
                :tooltip-offset="4"
                @click="openEdit(row as unknown as CronRow)"
              >
                <v-icon icon="$edit2" />
              </AppButton>

              <AppButton
                :aria-label="t('button.cron.delete')"
                data-testid="cron-row-delete"
                kind="row-action"
                :tooltip="t('button.cron.delete')"
                :tooltip-offset="4"
                @click="openDelete(row as unknown as CronRow)"
              >
                <v-icon icon="$thrash" />
              </AppButton>
            </template>

            <template #mobile="{ item }">
              <MobileTableField
                :label="t('table.header.cronExpression')"
                :value="item.cron_expression"
              />

              <MobileTableField
                :bold="false"
                :label="t('table.header.description')"
                :value="item.description"
              />

              <MobileTableField
                v-if="services !== null"
                :bold="false"
                :label="t('table.header.service')"
                :value="item.service"
              />

              <MobileTableField
                :bold="false"
                :label="t('table.header.command')"
                :value="item.command"
              />
            </template>
          </DataTable>
        </v-col>
      </v-row>
    </v-container>

    <AppDialog
      v-model="modalOpen"
      overlay
      :persistent="modalSubmitting"
      transition="custom-dialog-transition"
    >

      <basic-modal
        :key="modalRender"
        ref="modal"
        :buttons="modalButtons"
        class="card-width-560"
        :color="modalColor"
        :confirm-required="modalMode === 'delete'"
        :confirmed="Boolean(modalValues.confirm)"
        data-testid="cron-modal"
        :icon="modalIcon"
        :submitting="modalSubmitting"
        :title="modalTitle"
        @button-click="onModalButton"
        @modal-close="modalOpen = false"
      >
        <template v-if="modalMode !== 'delete'">
          <basic-modal-field
            v-model="modalValues.common_settings"
            data-testid="cron-common-settings"
            :field="commonSettingsField"
            @change="onCommonSettingsChange"
          />

          <basic-modal-field
            v-model="modalValues.expression"
            data-testid="cron-expression"
            :field="expressionField"
          />

          <!-- A container project's job runs in one of its services; PHP hosting has no such field. -->
          <basic-modal-field
            v-if="services !== null"
            v-model="modalValues.service"
            data-testid="cron-service"
            :field="serviceField"
          />

          <basic-modal-field
            v-model="modalValues.command"
            data-testid="cron-command"
            :field="commandField"
            last
          />
        </template>

        <basic-modal-field
          v-else
          v-model="modalValues.confirm"
          data-testid="cron-confirm"
          :field="confirmField"
          last
        />
      </basic-modal>
    </AppDialog>
  </div>
</template>

<script lang="ts" setup>
  import type { HostingServerAccount, HostingService } from '@/views/hosting/hosting.types'
  import type { CronFormValues, CronJobFields, CronOption, CronRow } from './cron'
  import type { CronJobPayload } from './cron.api'
  // App and app-lite are the same here, the WP Cloud branch included: the deployed app-lite has the seven WP Cloud
  // frequencies (see cron.ts). Add, Edit and Delete share one dialog;
  // the highlight follows a save, the Delete modal has none.
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import type { ModalCheckboxField, ModalMultiTextField, ModalSelectField, ModalTextField } from '@/shared/ui/modal/basic-modal.types'
  import { useTranslation } from 'i18next-vue'
  import { computed, onBeforeUnmount, reactive, ref, useTemplateRef, watch } from 'vue'
  import ActiveServerAccountSelector from '@/views/hosting/ui/ActiveServerAccountSelector.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import ErrorCard from '@/shared/ui/error-card/ErrorCard.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { ADD_DEFAULTS, COMMON_SETTINGS_VALUES, cronExpression, cronForHumans, cronServiceOptions, isSameCronJob, matchCommonSetting, STANDARD_OPTIONS, toCronPayload, toCronRow, WP_CLOUD_OPTIONS } from './cron'
  import { createCronJob, deleteCronJob, listCronJobs, updateCronJob } from './cron.api'
  import HostingCronJobsIllustration from './HostingCronJobsIllustration.vue'

  const props = withDefaults(defineProps<{
    service: HostingService
    /** `project`: the advanced page of an instance; `hosting`: `/hosting/cron`. */
    variant?: 'hosting' | 'project'
  }>(), {
    variant: 'hosting',
  })
  const isProject = computed(() => props.variant === 'project')

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const loading = ref(true)
  // Message of the last failed list request; null when the last load worked. A failed load is not an empty list.
  const loadError = ref<string | null>(null)
  const items = ref<CronRow[]>([])
  // `meta.services` of the list: the services a container project's job can run in; null on PHP hosting, which shows no
  // Service column or field. An empty list is a container project without containers (or a containers read that failed): there is no
  // service for a job to run in, so Add cannot offer a submittable dialog.
  const services = ref<string[] | null>(null)
  // The account the `services` list belongs to. The list is reset whenever another account is loaded, so a failed reload never leaves the
  // previous account's services behind for the dialog or the payload (a PHP account would then send a `service` the Engine refuses).
  let servicesAccountId: number | undefined
  const noServices = computed(() => services.value !== null && services.value.length === 0)
  const selectedAccount = ref<HostingServerAccount | null>(props.service.server_accounts[0] ?? null)
  let reloadTicket = 0

  /**
   * A diagnostic account is not asked (the alert says why), and a request error keeps the list as it was.
   * Without an account there is nothing to load and no list to keep (legacy threw on `serverAccount` being unset).
   * Every reload takes a ticket; an answer of an older one (another account, a quicker second reload) is dropped
   * (legacy let the last answer to arrive win).
   */
  async function reloadData (): Promise<void> {
    const ticket = ++reloadTicket
    const account = selectedAccount.value
    if (!account || account.id !== servicesAccountId) {
      services.value = null
    }
    if (!account) {
      items.value = []
      return
    }
    if (account.diagnostic_mode) {
      alerts.addAlert({ success: false, errorMessage: t('message.hostingAccountInDiagnosticMode') })
      loading.value = false
      return
    }
    loading.value = true
    try {
      const list = await listCronJobs(account.id)
      if (ticket !== reloadTicket) {
        return
      }
      const invalidLabel = t('notification.hosting.cron.invalidExpression')
      loadError.value = null
      services.value = list.services
      servicesAccountId = account.id
      items.value = list.jobs.map(job => toCronRow(job, invalidLabel))
    } catch (error) {
      if (ticket !== reloadTicket) {
        return
      }
      loadError.value = getErrorMessage(error)
      alerts.addAlert({ success: false, errorMessage: loadError.value })
    } finally {
      if (ticket === reloadTicket) {
        loading.value = false
      }
    }
  }

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
    load: reloadData,
    serverProvided: false,
    itemsPerPage: 8,
    possibleItemsPerPage: [[8, 16, 24]],
    sortBy: false,
    sortDesc: true,
  })

  // A container project has a Service column before the command.
  const headers = computed<LegacySortHeader[]>(() => [
    { text: 'cronExpression', value: 'cron_expression', sortable: true },
    { text: 'description', value: 'description', sortable: true },
    ...(services.value === null ? [] : [{ text: 'service', value: 'service', sortable: true }]),
    { text: 'command', value: 'command', sortable: true },
    { text: 'actions', value: 'actions' },
  ])

  // The saved item: a save sets it, and the row keeps the `highlight` class for one second. The clear itself sets `{}`, which
  // has no command, so it does not start another timer (legacy looped there, harmlessly).
  const highlightItem = ref<Partial<CronJobFields>>({})
  let highlightTimer: ReturnType<typeof setTimeout> | undefined

  watch(highlightItem, value => {
    clearTimeout(highlightTimer)
    if (!value.command) {
      return
    }
    highlightTimer = setTimeout(() => {
      highlightItem.value = {}
    }, 1000)
  })

  onBeforeUnmount(() => {
    clearTimeout(highlightTimer)
  })

  function itemClass (item: Record<string, unknown>): string {
    return isSameCronJob(item as unknown as CronJobFields, highlightItem.value) ? 'highlight' : ''
  }

  // The first account is the default; a new service resets to its first account, and an account change reloads.
  // The account is set before the watcher exists, so the first load is a single request.
  watch(() => props.service, service => {
    selectedAccount.value = service.server_accounts[0] ?? null
  })
  // `project`: the list reloads only for a new, truthy id; without an id there is no request.
  watch(selectedAccount, (value, oldValue) => {
    if (value === oldValue) {
      return
    }
    if (isProject.value && !(value?.id && value.id !== oldValue?.id)) {
      return
    }
    void reloadData()
  })

  const isWpCloud = computed(() => props.service.hosting_server_type === 'wp-cloud')

  // One dialog for Add, Edit and Delete. `modalValues` is the
  // form values of the modal; `confirm` is the checkbox of the Delete modal.
  type CronModalMode = 'add' | 'edit' | 'delete'
  const modalOpen = ref(false)
  const modalMode = ref<CronModalMode>('add')
  const modalRender = ref(0)
  // The dialog ignores outside clicks while a request runs.
  const modalSubmitting = ref(false)
  const modalValues = reactive<CronFormValues & { confirm: boolean }>({
    common_settings: ADD_DEFAULTS.common_settings,
    expression: { ...ADD_DEFAULTS.expression },
    command: ADD_DEFAULTS.command,
    service: ADD_DEFAULTS.service,
    confirm: false,
  })
  // The row an Edit or Delete was opened from (its `line` is used by the PUT or DELETE); null for Add.
  const targetRow = ref<CronRow | null>(null)
  const modalRef = useTemplateRef<{ validate: () => Promise<{ valid: boolean, errors: unknown[] }> }>('modal')

  // The body scroll is locked while a modal is open.
  useBodyScrollLock(modalOpen)

  // Title, icon, colour and the submit button of each mode.
  const MODAL_CONFIG: Record<CronModalMode, { title: string, icon: string, color: string, submit: string }> = {
    add: { title: 'heading.hosting.cron.modal.add.title', icon: '$plus', color: 'primary', submit: 'button.cron.add' },
    edit: { title: 'heading.hosting.cron.modal.update.title', icon: '$edit', color: 'primary', submit: 'button.update' },
    delete: { title: 'heading.hosting.cron.modal.delete.title', icon: '$alertwarning', color: 'error', submit: 'button.delete' },
  }
  const modalConfig = computed(() => MODAL_CONFIG[modalMode.value])
  const modalTitle = computed(() => t(modalConfig.value.title))
  const modalIcon = computed(() => modalConfig.value.icon)
  const modalColor = computed(() => modalConfig.value.color)
  // The Service select of a container project is required, so a job with no service chosen cannot be submitted (an Add dialog opened anyway,
  // or an Edit of a job whose service is gone from the Compose file): the button says why next to the empty select instead of the form rule alone.
  const modalServiceMissing = computed(() => modalMode.value !== 'delete' && services.value !== null && !modalValues.service)
  const modalButtons = computed<ModalButton[]>(() => [
    { id: 'submit', label: t(modalConfig.value.submit), color: modalConfig.value.color, disabled: modalServiceMissing.value },
    cancelButton(t),
  ])

  // The frequency options follow the host type.
  const commonSettingsField = computed<ModalSelectField>(() => ({
    type: 'select',
    name: 'common_settings',
    label: t('form.label.commonSettings'),
    tooltip: 'tooltip.add_cron_job.common_settings',
    options: (isWpCloud.value ? WP_CLOUD_OPTIONS : STANDARD_OPTIONS).map((option: CronOption) => ({ label: t(option.labelKey), value: option.value })),
  }))

  // The description is a computed value (legacy rewrote `field.description` in place).
  const expressionField = computed<ModalMultiTextField>(() => ({
    type: 'multiText',
    label: t('form.label.cronExpression'),
    tooltip: 'tooltip.add_cron_job.cron_expression',
    inputs: [{ name: 'minute' }, { name: 'hour' }, { name: 'day_of_month' }, { name: 'month' }, { name: 'day_of_week' }],
    description: `${t('form.label.frequency')}: ${cronForHumans(cronExpression(modalValues.expression), t('notification.hosting.cron.invalidExpression'))}`,
  }))

  // The Service select of a container project: its services, with the edited job's own kept as an option.
  const serviceField = computed<ModalSelectField>(() => ({
    type: 'select',
    name: 'service',
    label: t('form.label.service'),
    tooltip: 'tooltip.add_cron_job.service',
    options: cronServiceOptions(services.value ?? [], modalValues.service).map(service => ({ label: service, value: service })),
    required: true,
  }))

  const commandField = computed<ModalTextField>(() => ({
    type: 'text',
    name: 'command',
    label: t('form.label.command'),
    tooltip: 'tooltip.add_cron_job.command',
    rules: [value => !!value || t('form.validation.required', { field: t('form.label.command') })],
  }))

  // One required checkbox, the trusted bold line above it. It gates the Delete button.
  const confirmField = computed<ModalCheckboxField>(() => ({
    type: 'checkbox',
    name: 'confirm',
    label: t('form.confirmDelete.cron'),
    message: `<b>${t('message.confirmAction')}</b>`,
    required: true,
  }))

  // On a change of the frequency select: a preset writes the five fields; `custom` writes nothing.
  function onCommonSettingsChange (value: unknown): void {
    const preset = COMMON_SETTINGS_VALUES[String(value)]
    if (preset) {
      modalValues.expression = { ...preset }
    }
  }

  function openModal (mode: CronModalMode, values: CronFormValues): void {
    modalMode.value = mode
    modalRender.value++
    modalValues.common_settings = values.common_settings
    modalValues.expression = { ...values.expression }
    modalValues.command = values.command
    modalValues.service = values.service
    modalValues.confirm = false
    modalOpen.value = true
  }

  // Every 5 minutes, no command yet.
  function openAdd (): void {
    // A container project without services has nothing to offer in the required Service select: the Add buttons are disabled and the view says
    // why, so this only guards a caller left over from a stale render.
    if (noServices.value) {
      return
    }
    targetRow.value = null
    // A container project's new job starts in its first service.
    openModal('add', { ...ADD_DEFAULTS, service: services.value?.[0] ?? null })
  }

  // The values of a row as the modal starts with them: the five fields and command, with the frequency preset that matches them exactly
  // (`custom` otherwise; legacy always starts in `custom`).
  function rowValues (row: CronRow): CronFormValues {
    const expression = { minute: row.minute, hour: row.hour, day_of_month: row.day_of_month, month: row.month, day_of_week: row.day_of_week }
    const offered = (isWpCloud.value ? WP_CLOUD_OPTIONS : STANDARD_OPTIONS).map(option => option.value)
    return {
      common_settings: matchCommonSetting(expression, offered),
      expression,
      command: row.command,
      service: row.service ?? null,
    }
  }

  function openEdit (row: CronRow): void {
    targetRow.value = row
    openModal('edit', rowValues(row))
  }

  // The row is the target, the confirm checkbox starts unchecked (`openModal` resets it).
  function openDelete (row: CronRow): void {
    targetRow.value = row
    openModal('delete', rowValues(row))
  }

  // The command and the five fields of the saved values are compared with each row.
  function highlightOf (payload: CronJobPayload): CronJobFields {
    return {
      command: payload.command,
      minute: payload.minute,
      hour: payload.hour,
      day_of_month: payload.day_of_month,
      month: payload.month,
      day_of_week: payload.day_of_week,
    }
  }

  // The order of highlight, reload, alert and close is the legacy one. A failed request keeps the
  // dialog open with the error alert.
  async function saveModal (accountId: number): Promise<void> {
    // The service belongs to a container project only: PHP hosting (no `meta.services`) must never get one, even a stale one from the dialog.
    const payload = toCronPayload(modalValues, services.value !== null)
    const edited = targetRow.value
    modalSubmitting.value = true
    try {
      if (edited) {
        await updateCronJob(accountId, edited.line, payload)
        highlightItem.value = highlightOf(payload)
        alerts.addAlert({ success: true, successMessage: t('notification.hosting.cron.update.success') })
        void reloadData()
      } else {
        await createCronJob(accountId, payload)
        highlightItem.value = highlightOf(payload)
        void reloadData()
        alerts.addAlert({ success: true, successMessage: t('notification.hosting.cron.add.success') })
      }
      modalOpen.value = false
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalSubmitting.value = false
    }
  }

  // The reload starts, then the alert, then the dialog closes. A failed request keeps the dialog open with the
  // error alert. Unlike a save, a delete sets no highlight.
  async function deleteModal (accountId: number, line: string): Promise<void> {
    modalSubmitting.value = true
    try {
      await deleteCronJob(accountId, line)
      void reloadData()
      alerts.addAlert({ success: true, successMessage: t('notification.hosting.cron.delete.success') })
      modalOpen.value = false
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalSubmitting.value = false
    }
  }

  // The buttons validate the form and then run the action. Cancel closes the dialog.
  async function onModalButton (id: string): Promise<void> {
    if (id === 'cancel') {
      modalOpen.value = false
      return
    }
    const account = selectedAccount.value
    if (!account) {
      return
    }
    const result = await modalRef.value?.validate()
    if (!result?.valid) {
      return
    }
    if (modalMode.value === 'delete') {
      if (targetRow.value) {
        await deleteModal(account.id, targetRow.value.line)
      }
      return
    }
    await saveModal(account.id)
  }

  // `project` without an account id makes no request and keeps `loading` (the skeleton), as legacy does.
  if (!isProject.value || selectedAccount.value?.id) {
    void reloadData()
  }
</script>

<style lang="scss" scoped src="@/views/hosting/hosting-screen.scss"></style>
