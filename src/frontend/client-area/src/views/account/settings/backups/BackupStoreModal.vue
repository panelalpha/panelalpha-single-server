<template>
  <AppDialog
    v-model="open"
    :overlay="!saving"
    :persistent="saving"
    scroll-lock="mobile"
    transition="custom-dialog-transition"
  >
    <basic-modal
      :buttons="buttons"
      class="backup-store-modal card-width-560"
      close-class="store-modal-close"
      :submitting="saving"
      :title="title"
      @button-click="onButton"
      @modal-close="close"
    >
      <template #custom>
        <v-form
          ref="formRef"
          class="d-flex flex-column"
          @submit.prevent="submit"
        >
          <LabeledField :label="t('settings.backups.driver')">
            <SettingsSelect
              v-model="driver"
              class="store-driver"
              :disabled="saving"
              hide-details="auto"
              :items="driverItems"
            >
              <template #selection="{ item }">
                <v-icon
                  class="store-driver-icon mr-2"
                  :icon="driverIcon(item.value)"
                  :size="18"
                />
                {{ item.title }}
              </template>

              <template #item="{ item, props: itemProps }">
                <v-list-item v-bind="itemProps">
                  <template #title>
                    <v-icon
                      class="store-driver-icon mr-2"
                      :icon="driverIcon(item.value)"
                      :size="18"
                    />
                    {{ item.title }}
                  </template>
                </v-list-item>
              </template>
            </SettingsSelect>
          </LabeledField>

          <template
            v-for="field in fields"
            :key="field.key"
          >
            <AppSwitch
              v-if="field.type === 'switch'"
              v-model="values[field.key] as boolean"
              class="mt-4 store-field"
              :class="`store-field-${field.key}`"
              :disabled="saving"
              kind="inset"
              :label="t(field.label)"
            />

            <LabeledField
              v-else
              class="mt-4"
              :label="t(field.label)"
            >
              <!-- A key keeps its line breaks, which a single-line input drops. -->
              <v-textarea
                v-if="field.type === 'textarea'"
                v-model="values[field.key] as string"
                autocomplete="off"
                class="store-field store-field-multiline"
                :class="`store-field-${field.key}`"
                density="compact"
                :disabled="saving"
                hide-details="auto"
                rows="4"
                spellcheck="false"
                variant="outlined"
              />

              <v-text-field
                v-else
                v-model="values[field.key] as string"
                autocomplete="off"
                class="v-input--md store-field"
                :class="`store-field-${field.key}`"
                density="compact"
                :disabled="saving"
                hide-details="auto"
                :hint="field.hint ? t(field.hint) : ''"
                :persistent-hint="!!field.hint"
                :rules="field.required ? [requiredRule] : []"
                single-line
                :type="field.type"
                variant="outlined"
              />
            </LabeledField>
          </template>

          <div
            v-if="error"
            class="store-modal-error text-error p-2 mt-4"
          >
            {{ error }}
          </div>
        </v-form>
      </template>
    </basic-modal>
  </AppDialog>
</template>

<script lang="ts" setup>
  import type { Translate } from '@/views/account/settings/settings-general'
  import type { FreeBackups, FreeBackupsChange, FreeBackupStore } from './free-backups.api'
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  // `PUT /community/backups/store`; the fields depend on the driver. Deviations:
  // a 422 keeps the `key: ` prefix of `getErrorMessages`; the card-overlay of a saving modal is
  // absent (the V4 persistent dialog animates a click on its scrim itself).
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, useTemplateRef, watch } from 'vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage, getErrorMessages } from '@/shared/api/error-message'
  import AppSwitch from '@/shared/ui/buttons/AppSwitch.vue'
  import LabeledField from '@/shared/ui/form/LabeledField.vue'
  import SettingsSelect from '@/shared/ui/form/SettingsSelect.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import { DEFAULT_DRIVERS, DEFAULT_LOCAL_LOCATION, driverIcon } from './backup-drivers'
  import { initialDriver, initialValues, STORE_FIELDS, storePayload, type StoreValues } from './backup-store-fields'
  import { updateFreeBackupStore } from './free-backups.api'

  const props = withDefaults(defineProps<{
    currentStore?: FreeBackupStore | null
    drivers?: string[]
    defaultLocalLocation?: string
  }>(), {
    currentStore: null,
    drivers: () => [...DEFAULT_DRIVERS],
    defaultLocalLocation: DEFAULT_LOCAL_LOCATION,
  })

  const emit = defineEmits<{
    saved: [data: Pick<FreeBackups, 'store' | 'store_selected' | 'store_created'>]
  }>()

  const open = defineModel<boolean>({ default: false })

  const { t: translate } = useTranslation()
  const t = translate as Translate
  const alerts = useAlertsStore()
  const formRef = useTemplateRef<{ validate: () => Promise<{ valid: boolean }>, resetValidation: () => void }>('formRef')

  const driver = ref('local')
  const values = ref<StoreValues>({})
  const saving = ref(false)
  const error = ref('')

  const title = computed(() => (props.currentStore ? t('settings.backups.changeStore') : t('settings.backups.configureStore')))
  const driverItems = computed(() => props.drivers.map(item => ({ title: t(`settings.backups.drivers.${item}`), value: item })))
  const fields = computed(() => STORE_FIELDS[driver.value] ?? [])

  // Footer of the kit card. The classes are the hooks of the tests; both are disabled while saving.
  const buttons = computed<ModalButton[]>(() => [
    { id: 'save', label: title.value, color: 'primary', buttonClass: 'store-modal-submit', disabled: saving.value },
    { id: 'cancel', label: t('button.cancel'), color: 'normal', type: 'cancel', buttonClass: 'store-modal-cancel', disabled: saving.value },
  ])

  function onButton (id: string): void {
    if (id === 'save') {
      void submit()
      return
    }
    close()
  }

  function resetValues () {
    values.value = initialValues(driver.value, props.currentStore, props.defaultLocalLocation)
    error.value = ''
  }

  // Opens on the active store's driver and location; secrets always start empty.
  function reset () {
    saving.value = false
    driver.value = initialDriver(props.currentStore, props.drivers)
    resetValues()
    formRef.value?.resetValidation()
  }

  // Every way out (Esc and the scrim too) clears the values.
  watch(open, isOpen => {
    if (isOpen) {
      reset()
    } else {
      clearValues()
    }
  }, { immediate: true })

  watch(driver, () => {
    resetValues()
  })

  // Secrets do not outlive the modal.
  function clearValues () {
    values.value = {}
  }

  function requiredRule (v: unknown) {
    return (v !== null && v !== undefined && String(v).trim() !== '') || t('settings.backups.required')
  }

  function close () {
    if (!saving.value) {
      clearValues()
      open.value = false
    }
  }

  async function submit () {
    if (saving.value) {
      return
    }
    if (formRef.value && !(await formRef.value.validate()).valid) {
      return
    }
    error.value = ''
    saving.value = true
    let data: FreeBackupsChange
    try {
      data = await updateFreeBackupStore(storePayload(driver.value, values.value))
    } catch (error_) {
      const response = (error_ as { response?: { status?: number } } | null | undefined)?.response
      if (response && response.status === 422) {
        error.value = getErrorMessages(error_).join(' ')
      } else {
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error_) })
      }
      saving.value = false
      return
    }
    saving.value = false
    clearValues()
    emit('saved', data)
    alerts.addAlert({ success: true, successMessage: savedMessage(data) })
    open.value = false
  }

  // A store the panel created and the Engine would not delete (a schedule or a backup still uses it) stays on the server.
  function savedMessage (data: FreeBackupsChange): string {
    if (data.cleanup?.container !== 'kept') {
      return t('settings.backups.storeSaved')
    }

    return t(data.cleanup.reason === 'in_use' ? 'settings.backups.storeSavedKeptInUse' : 'settings.backups.storeSavedKept')
  }
</script>

<style lang="scss" scoped>
// The card frame (title, X, actions) is the kit `BasicModal` (legacy had no frame styles). The
// rules of the fields stay: they reach the slot content, which carries the scope id of this file.
.backup-store-modal {
  // A dense V2 slot keeps 4px (not the 8px of `_inputs.scss`) below it while the details row shows (the persistent hint of
  // the local path): measured 76px field + hint in legacy, 80px with the global 8px.
  :deep(.v-input:has(.v-messages__message) > .v-input__control > .v-field) {
    margin-bottom: 4px;
  }

  // V2 `rows="4"` dense textarea measured 118px, the V4 compact one 104px.
  :deep(.store-field-multiline .v-field) {
    min-height: 118px;
  }
}
</style>
