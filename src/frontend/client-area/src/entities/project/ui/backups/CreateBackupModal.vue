<template>
  <v-dialog
    v-model="opened"
    :persistent="submitting"
    transition="custom-dialog-transition"
  >
    <div
      v-if="!submitting"
      class="card-overlay"
      @click="close"
    />

    <div
      v-else
      class="card-overlay"
    />

    <basic-modal
      v-if="opened"
      :alert="missingParts ? partsReason : undefined"
      :buttons="buttons"
      class="create-backup-modal"
      data-testid="create-backup-modal"
      icon="$update"
      :message="infoMessage"
      :submitting="submitting"
      :title="t('heading.instance.backups.create.title')"
      @button-click="onButtonClick"
      @modal-close="close"
    >
      <basic-modal-field
        v-for="(field, index) in fields"
        :key="field.name"
        :field="field"
        :last="index === fields.length - 1"
        :model-value="values[field.name]"
        @update:model-value="values[field.name] = $event"
      />
    </basic-modal>
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
  // The card owns the dialog through
  // `v-model` (General tab). The list opens it with `open()`: a retry (`retry_id`), a convert to full (`convert_from_id`, only the note
  // field) or a plain create. The request is `createBackup` in `entities/project/instance-backups.api.ts`.
  import type { CreateBackupBody } from '@/entities/project/instance-backups.api'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { isContainerProject } from '@/entities/project/container-project'
  import { createBackup } from '@/entities/project/instance-backups.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'

  // Only fields with a `name` are values of this form (multi-text fields are not used here).
  type NamedModalField = Extract<ModalField, { name: string }>

  const props = withDefaults(defineProps<{
    instance: InstanceResource
    /** The manual backup limit is reached (the list counts it from the usage). A plain create is then refused by `open()`. */
    limitReached?: boolean
    /** No backup store is set up: the server would refuse every create, retry and convert, so `open()` does nothing (`isBackupStoreMissing`). */
    storeMissing?: boolean
  }>(), {
    limitReached: false,
    storeMissing: false,
  })

  const opened = defineModel<boolean>({ default: false })

  const emit = defineEmits<{
    created: []
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const submitting = ref(false)
  const values = ref<Record<string, unknown>>({})
  // Set by `open()` and cleared when the dialog closes.
  const retryId = ref<number | null>(null)
  const convertFromId = ref<number | null>(null)

  useBodyScrollLock(opened)

  const isWpCloud = computed(() => props.instance.hostingServerType === 'wp-cloud')
  // A `custom` (container) project exists only in app-lite; a classic PHP hosting
  // project is `custom` too and keeps the choice of what to back up.
  const isCustom = computed(() => isContainerProject(props.instance))
  // A container project (not on WP Cloud, like the fields below) gets a note about what the backup holds and the short stop;
  // a classic `custom` project (no container) is not stopped and has no volumes.
  const infoMessage = computed(() => (isContainerProject(props.instance) && !isWpCloud.value
    ? t('message.backup.custom.createInfo', {
      defaultValue: 'This backup includes the project code and its data (volumes and databases). The project is stopped while its code and data are copied and starts again right after.',
    })
    : undefined))
  const isConvert = computed(() => convertFromId.value !== null)

  // A convert shows only the note. Otherwise WP Cloud picks one of directory or database, a `custom` project shows no
  // choice (the body still asks for both, see `resetValues`), other servers tick both. WP Cloud wins over `custom`.
  const fields = computed<NamedModalField[]>(() => {
    const list: NamedModalField[] = []
    if (!isConvert.value) {
      if (isWpCloud.value) {
        list.push({
          type: 'select',
          name: 'backupType',
          label: t('form.label.backupType'),
          tooltip: 'tooltip.create_backup.backup_type',
          options: [
            { label: t('form.label.directory'), value: 'directory' },
            { label: t('form.label.database'), value: 'database' },
          ],
        })
      } else if (!isCustom.value) {
        list.push(
          {
            type: 'checkbox',
            name: 'backupDirectory',
            label: t('form.label.backupDirectory'),
            tooltip: 'tooltip.create_backup.backup_directory',
          },
          {
            type: 'checkbox',
            name: 'backupDatabase',
            label: t('form.label.backupDatabase'),
            tooltip: 'tooltip.create_backup.backup_database',
          },
        )
      }
    }
    list.push({
      type: 'textarea',
      name: 'backupNote',
      label: t('form.label.backupNote'),
      tooltip: 'tooltip.create_backup.backup_note',
    })
    return list
  })

  // The parts are offered exactly where `fields` adds the two checkboxes; without one the server refuses a create.
  const partsChoice = computed(() => fields.value.some(field => field.name === 'backupDirectory'))
  const missingParts = computed(() => partsChoice.value
    && !values.value.backupDirectory
    && !values.value.backupDatabase)
  const partsReason = computed(() => t('message.backup.parts.none', {
    defaultValue: 'Choose files or databases to back up.',
  }))

  const buttons = computed<ModalButton[]>(() => [
    { id: 'create', label: t('button.create'), color: 'primary', disabled: missingParts.value },
    { id: 'cancel', label: t('button.cancel'), type: 'cancel', color: 'normal', customClass: 'cancel-btn' },
  ])

  // Legacy sets the defaults on every open, convert and retry included.
  function resetValues (): void {
    values.value = isWpCloud.value
      ? { backupType: 'directory', backupNote: '' }
      : { backupDirectory: true, backupDatabase: true, backupNote: '' }
  }

  watch(opened, value => {
    if (value) {
      resetValues()
    } else {
      retryId.value = null
      convertFromId.value = null
    }
  })

  /**
   * Opens the dialog in one step: the branch is set before `opened` turns true, so the form reset reads it. A plain create with the limit
   * reached does nothing; a convert is always allowed.
   */
  function open (retry?: number, convertFrom?: number | null): void {
    if (props.storeMissing || (!convertFrom && props.limitReached)) {
      return
    }
    retryId.value = retry ?? null
    convertFromId.value = convertFrom ?? null
    opened.value = true
  }

  defineExpose({ open })

  function close (): void {
    if (!submitting.value) {
      opened.value = false
    }
  }

  // Only whole ids reach the body.
  function wholeId (value: number | null): number | undefined {
    return value !== null && Number.isInteger(value) ? value : undefined
  }

  async function submit (): Promise<void> {
    if (submitting.value || missingParts.value) {
      return
    }
    submitting.value = true
    // Legacy: a WP Cloud `backupType` turns into the directory or database flag the API reads.
    const body: CreateBackupBody = { ...values.value }
    if (body.backupType === 'directory') {
      body.backupDirectory = true
    }
    if (body.backupType === 'database') {
      body.backupDatabase = true
    }
    const retry = wholeId(retryId.value)
    if (retry !== undefined) {
      body.retry_id = retry
    }
    const convertFrom = wholeId(convertFromId.value)
    if (convertFrom !== undefined) {
      body.convert_from_id = convertFrom
    }
    try {
      await createBackup(props.instance.id, body)
      alerts.addAlert({ success: true, successMessage: t('notification.instance.backup.create.success') })
      opened.value = false
      emit('created')
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }

  function onButtonClick (id: string): void {
    if (id === 'create') {
      void submit()
    } else if (id === 'cancel') {
      close()
    }
  }
</script>

<style lang="scss" scoped>
// Width 560px as an inline style (app-lite modal width). `_dialog.scss` sets the card to 720px at
// specificity (0,4,0), so the class is doubled and anchored under the dialog overlay to win over it.
.v-dialog .v-overlay__content .create-backup-modal.create-backup-modal {
  width: 560px;
}
</style>
