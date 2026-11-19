<template>
  <AppDialog
    v-model="open"
    transition="custom-dialog-transition"
  >
    <BasicModal
      :buttons="buttons"
      data-testid="php-settings-modal"
      :submitting="submitting"
      :title="t('heading.instance.advanced.modal.phpSettings.title')"
      @button-click="onButton"
      @modal-close="open = false"
    >
      <template #custom>
        <p class="mb-4 p-2 p-3">
          {{ t('heading.instance.advanced.modal.phpSettings.field') }}
          <strong>{{ instance.domain }}</strong>
        </p>

        <p class="mb-4 px-3 text--gray-darken1">
          {{ t('heading.instance.advanced.modal.phpSettings.emptyValue') }}
        </p>

        <v-form
          ref="formRef"
          class="d-flex flex-column"
        >
          <v-data-table
            class="php-settings-table"
            :headers="headers"
            hide-default-footer
            hide-default-header
            :items="rows"
            :items-per-page="-1"
          >
            <template #thead>
              <thead>
                <tr>
                  <th
                    class="text-start php-col-directive"
                  >
                    {{ t('table.header.directive') }}
                  </th>

                  <th
                    class="text-start php-col-value"
                  >
                    {{ t('table.header.value') }}
                  </th>

                  <th
                    class="text-start php-col-actions"
                  />
                </tr>
              </thead>
            </template>

            <template #item.directive="{ item }">
              <div class="d-flex align-center">
                <v-combobox
                  v-if="custom && item.editing && modifiableDirectivesList"
                  class="mb-0 php-field"
                  density="compact"
                  hide-details="auto"
                  item-title="directive"
                  item-value="directive"
                  :items="suggestedDirectives"
                  :model-value="item.directive"
                  :placeholder="t('table.header.directive')"
                  :return-object="false"
                  :rules="[requiredDirective]"
                  variant="outlined"
                  @update:focused="(focused: boolean) => onDirectiveFocus(item, focused)"
                  @update:model-value="(value: string) => onDirectiveInput(item, value)"
                />

                <v-select
                  v-else-if="custom && item.editing"
                  class="mb-0 php-field"
                  density="compact"
                  hide-details="auto"
                  item-title="directive"
                  item-value="directive"
                  :items="suggestedDirectives"
                  :model-value="item.directive"
                  :rules="[requiredDirective]"
                  variant="outlined"
                  @update:model-value="(value: string) => onDirectiveSelect(item, value)"
                />

                <span
                  v-else
                  class="mr-1"
                >{{ item.directive }}</span>

                <FormHelpIcon
                  v-if="i18next.exists(`tooltip.instance.phpSetting.${item.directive}`) && (!custom || !item.editing)"
                  :text="t(`tooltip.instance.phpSetting.${item.directive}`)"
                />
              </div>
            </template>

            <template #item.value="{ item }">
              <div class="d-flex align-center">
                <v-select
                  v-if="item.editing && item.type === 'select'"
                  v-model="item.value"
                  class="mb-0 text-truncate php-value-select"
                  density="compact"
                  hide-details="auto"
                  :items="item.options"
                  variant="outlined"
                />

                <v-text-field
                  v-else-if="item.editing"
                  v-model="item.value"
                  class="mb-0 php-field"
                  density="compact"
                  hide-details="auto"
                  :placeholder="t('table.header.value')"
                  type="text"
                  variant="outlined"
                />

                <span
                  v-else
                  class="ms-1"
                >{{ item.value }}</span>
              </div>
            </template>

            <template #item.actions="{ item, index }">
              <v-tooltip
                v-if="!item.editing"
                location="bottom"
                open-delay="150"
                transition="custom-tooltip"
              >
                <template #activator="{ props: activatorProps }">
                  <AppButton
                    v-bind="activatorProps"
                    :aria-label="t('button.edit')"
                    kind="icon"
                    size="small"
                    @click="item.editing = true"
                  >
                    <v-icon
                      class="text-gray-darken-1"
                      icon="$edit2"
                      size="16"
                    />
                  </AppButton>
                </template>

                <span>{{ t('button.edit') }}</span>
              </v-tooltip>

              <v-tooltip
                v-if="item.editing"
                location="bottom"
                open-delay="150"
                transition="custom-tooltip"
              >
                <template #activator="{ props: activatorProps }">
                  <AppButton
                    v-bind="activatorProps"
                    :aria-label="t('button.cancel')"
                    kind="icon"
                    size="small"
                    @click="item.editing = false"
                  >
                    <v-icon
                      class="text-gray-darken-1"
                      icon="$close"
                      size="16"
                    />
                  </AppButton>
                </template>

                <span>{{ t('button.cancel') }}</span>
              </v-tooltip>

              <v-tooltip
                v-if="custom"
                location="bottom"
                open-delay="150"
                transition="custom-tooltip"
              >
                <template #activator="{ props: activatorProps }">
                  <AppButton
                    v-bind="activatorProps"
                    :aria-label="t('button.delete')"
                    kind="icon"
                    size="small"
                    @click="removeRecord(index)"
                  >
                    <v-icon
                      class="text-gray-darken-1"
                      icon="$thrash"
                      size="16"
                    />
                  </AppButton>
                </template>

                <span>{{ t('button.delete') }}</span>
              </v-tooltip>
            </template>
          </v-data-table>

          <div
            v-if="custom"
            class="mt-2"
          >
            <AppButton
              class="btn-default-color"
              kind="secondary"
              @click="addDirective"
            >
              <!-- Vue 2 kept a space either side of the label (`white-space: break-spaces`). -->
              {{ ' ' + t('button.addDirective') + ' ' }}
            </AppButton>
          </div>
        </v-form>
      </template>
    </BasicModal>
  </AppDialog>
</template>

<script lang="ts" setup>
  // The modal works on a working copy taken at each open. Save sends the copy and emits it; Cancel and X discard it. The combobox commits on blur
  // (only when the name changed since focus) and on a pick from the menu, because V4 `update:model-value` fires on every keystroke.
  import type { PhpSettingRow, SuggestedDirective } from './developer-settings.api'
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import FormHelpIcon from '@/shared/ui/form/FormHelpIcon.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import { updatePhpSettings } from './developer-settings.api'
  import { newDirectiveRow, onDirectiveChange, workingCopy } from './php-settings'

  const props = defineProps<{
    instance: InstanceResource
    phpSettings: PhpSettingRow[]
    custom: boolean
    suggestedDirectives: SuggestedDirective[]
    modifiableDirectivesList: boolean
  }>()

  const emit = defineEmits<{
    saved: [rows: PhpSettingRow[]]
  }>()

  const open = defineModel<boolean>('open', { default: false })

  const { t, i18next } = useTranslation()
  const alerts = useAlertsStore()

  const submitting = ref(false)
  const rows = ref<PhpSettingRow[]>([])
  const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)

  // The card is the kit `BasicModal`. Its `submitting` hides the X, spins Save and ignores every click while the request
  // runs; Cancel is also shown disabled then, as before. The fields keep their own `v-form` (`formRef`) in the `custom` slot.
  const buttons = computed<ModalButton[]>(() => [
    { id: 'submit', label: t('button.saveChanges'), color: 'primary' },
    { ...cancelButton(t), disabled: submitting.value },
  ])

  function onButton (id: string): void {
    if (id === 'submit') {
      void submit()
      return
    }
    open.value = false
  }

  // The directive the combobox held when it got focus; a blur commits only a change from this value (V2 `@change`).
  let focusSnapshot: { row: PhpSettingRow, directive: string } | null = null

  const headers = computed(() => [
    { title: t('table.header.directive'), key: 'directive', sortable: false, width: 250 },
    { title: t('table.header.value'), key: 'value', sortable: false, width: 300 },
    { title: '', key: 'actions', sortable: false, width: 80 },
  ])

  /** A value may be cleared (the server's PHP configuration then applies); a directive without a name has nothing to save. */
  function requiredDirective (value: unknown): true | string {
    return !!value || t('form.validation.required', { field: t('table.header.directive') })
  }

  // A fresh working copy each time the modal opens, so a cancelled edit never shows again.
  watch(open, isOpen => {
    if (isOpen) {
      rows.value = workingCopy(props.phpSettings)
    }
  }, { immediate: true })

  function onDirectiveFocus (row: PhpSettingRow, focused: boolean): void {
    if (focused) {
      focusSnapshot = { row, directive: row.directive }
      return
    }
    if (focusSnapshot?.row === row && focusSnapshot.directive !== row.directive) {
      onDirectiveChange(row, props.suggestedDirectives)
    }
    focusSnapshot = null
  }

  /** The combobox fires on every keystroke: only a pick of a suggested name commits here, the rest waits for the blur. */
  function onDirectiveInput (row: PhpSettingRow, value: string): void {
    row.directive = value
    if (props.suggestedDirectives.some(suggested => suggested.directive === value)) {
      onDirectiveChange(row, props.suggestedDirectives)
    }
  }

  /** A select is a commit on every change, as legacy `@change`. */
  function onDirectiveSelect (row: PhpSettingRow, value: string): void {
    row.directive = value
    onDirectiveChange(row, props.suggestedDirectives)
  }

  function addDirective (): void {
    rows.value.push(newDirectiveRow())
  }

  function removeRecord (index: number): void {
    rows.value.splice(index, 1)
  }

  async function submit (): Promise<void> {
    if (submitting.value) {
      return
    }
    const validation = await formRef.value?.validate()
    if (validation && !validation.valid) {
      return
    }

    const hostingId = props.instance.hostingId as number
    const domain = props.instance.domain ?? ''
    submitting.value = true
    try {
      await updatePhpSettings(hostingId, domain, rows.value)
      // The API keeps no entry for a cleared value: the server's PHP configuration applies.
      const saved = rows.value.filter(row => row.value !== '')
      for (const row of saved) {
        row.editing = false
      }
      emit('saved', saved)
      alerts.addAlert({ success: true, successMessage: t('notification.instance.settings.update') })
      open.value = false
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style
  lang="scss"
  scoped
  src="@/shared/ui/modal/BasicModal.scss"
/>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// Legacy `PhpSettingsModal.vue` columns and field widths were inline `style` (250 / 300 / 80 px; 180 px fields; the select 260-300 px).
.php-col-directive {
  width: 250px;
}

.php-col-value {
  width: 300px;
}

.php-col-actions {
  width: 80px;
}

.php-field {
  min-width: 180px;
}

.php-value-select {
  min-width: 260px;
  max-width: 300px;
}

// V2 dense outlined slot has no min-height: the native input line (25px) and its 8px paddings make 41px (the global 48px slot is the legacy `md` field).
.php-field,
.php-value-select {
  :deep(.v-input__control .v-field) {
    min-height: 0;
  }
}

// V2 vendor `.v-data-table` of the modal (no `data-table` class, so `_tables.scss` does not reach it): 14px table, 12px header cells 48px high
// in the dimmed header colour, cells without padding or divider (the `.text-start` cells of V2 had none), the value cell keeps its own `ms-1`.
.php-settings-table {
  :deep(table) {
    font-size: 0.875rem;
    line-height: 1.5;
  }

  :deep(thead th) {
    height: 48px;
    padding: 0;
    border-bottom: 0;
    font-size: 0.75rem;
    font-weight: v.$font-weight-bold;
    line-height: 1.5;
    color: var(--v-table-header-text);
  }

  // Legacy icon buttons of the row actions: 32px (V4 `small` icon button is 44px with the global size rules), in the dimmed icon colour (`--v-icon-btn-color`, the V2 `.theme--light.v-btn--icon` colour).
  :deep(td .v-btn.v-btn--icon) {
    width: 32px;
    height: 32px;
    color: var(--v-icon-btn-color);
  }

  :deep(.v-table__wrapper > table > tbody > tr > td) {
    padding-left: 0;
    border-bottom: 0;
    font-size: 0.875rem;
    line-height: 1.5;
  }
}
</style>
