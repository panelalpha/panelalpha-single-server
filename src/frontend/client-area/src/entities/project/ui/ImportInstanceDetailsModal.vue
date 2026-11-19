<template>
  <v-dialog
    v-model="isOpen"
    transition="custom-dialog-transition"
  >
    <div
      class="card-overlay"
      @click="close"
    />

    <v-card
      class="card-width-560"
      data-testid="import-details-modal"
    >
      <v-card-title class="d-flex align-center">
        <v-icon
          class="mr-4"
          icon="$download"
          size="24"
        />

        <h6 class="heading--text d-flex align-center">
          {{ t('message.importing.modal.title') }}
        </h6>

        <modal-close-button
          data-testid="import-details-close"
          @click="close"
        />
      </v-card-title>

      <v-card-text>
        <div class="import-details__desc font-weight-600">
          {{ t('message.importing.modal.desc') }}
        </div>

        <AppMessage
          v-if="hasInstallFailed"
          class="my-4"
          data-testid="import-details-failed"
          icon="$alertTriangle"
          variant="error"
        >
          <div>
            <div class="d-flex align-center mb-3">
              <span
                class="import-details__failed-title font-weight-700 error--text"
              >{{ t('message.importing.modal.failed') }}</span>
            </div>

            <table
              v-if="currentStep"
              class="alert-error-details__table mb-3"
            >
              <tbody>
                <tr>
                  <td class="alert-error-details__label">
                    {{ t('table.header.step') }}
                  </td>

                  <td class="alert-error-details__value">
                    {{ t(`heading.instance.modal.importDetails.step.${currentStep.name}.title`) }}
                    <span
                      v-if="stepPercent !== null"
                      class="alert-error-details__badge ms-2"
                    >{{ stepPercent }}%</span>
                  </td>
                </tr>

                <tr v-if="stepCurrentItem">
                  <td class="alert-error-details__label">
                    <span v-if="currentStep.name === 'migrateFilesUsingPlugin'">{{ t('table.header.currentFile') }}</span>

                    <span v-else>{{ t('table.header.currentTable') }}</span>
                  </td>

                  <td class="alert-error-details__value alert-error-details__value--file">
                    {{ stepCurrentItem }}
                  </td>
                </tr>
              </tbody>
            </table>

            <div class="alert-error-details__divider" />

            <div class="d-flex align-start mt-2">
              <span
                class="import-details__error-label font-weight-600 error--text me-2"
              >{{ t('message.alertManager.error') }}:</span>

              <span
                class="import-details__error-text error--text"
              >{{ failureMessage }}</span>
            </div>
          </div>
        </AppMessage>

        <div
          v-else
          class="well well--import-progress my-4"
          data-testid="import-details-progress"
        >
          <div class="well__content">
            <span
              v-if="currentStep"
              class="mb-2"
            >
              {{ t(`heading.instance.modal.importDetails.step.${currentStep.name}.title`) }}
            </span>

            <span
              v-else
              class="mb-2"
            >
              {{ t('message.importing.modal.progress') }}
            </span>

            <span v-if="stepPercent">
              {{ stepPercent }}%
            </span>
          </div>

          <v-progress-linear
            class="import-pending__progress"
            color="primary"
            :indeterminate="stepPercent === null"
            :model-value="stepPercent === null ? 0 : stepPercent"
          />
        </div>

        <v-data-table
          class="custom-data-table custom--import-data-table data-table"
          :class="{ 'custom--import-data-table-mobile': tableMobile }"
          :headers="[{ title: t('table.header.step'), key: 'stepName' }, { title: t('table.header.status'), key: 'status' }]"
          hide-default-footer
          :items="stepItems"
          :items-per-page="-1"
          :mobile="tableMobile"
        >
          <template #[`item.stepName`]="{ item }">
            <div class="d-flex align-center text-start">
              <span>{{ t(`heading.instance.modal.importDetails.step.${item.stepName}.title`) }}</span>

              <v-tooltip
                location="bottom"
                open-delay="150"
                transition="custom-tooltip"
              >
                <template #activator="{ props: activatorProps }">
                  <v-icon
                    v-bind="activatorProps"
                    class="ms-2"
                    icon="$infoCircle"
                    size="small"
                  />
                </template>

                <span>{{ t(`heading.instance.modal.importDetails.step.${item.stepName}.tooltip`) }}</span>
              </v-tooltip>
            </div>
          </template>

          <template #[`item.status`]="{ item }">
            <StatusLabel
              class="no-pointer"
              :icon="statusChipIcon(item.status)"
              :status="statusChipStatus(item.status)"
              :value="t(`message.status.${item.status}`)"
            >
              <template
                v-if="item.status == 'in-progress'"
                #prepend
              >
                <loader
                  color="sand"
                  no-margins
                  :size="16"
                />
              </template>
            </StatusLabel>
          </template>
        </v-data-table>
      </v-card-text>

      <v-card-actions class="d-flex flex-wrap px-8 pt-8">
        <template v-if="instance && instance.import_details && hasInstallFailed">
          <div class="w-100">
            <AppButton
              block
              data-testid="import-details-retry"
              kind="primary"
              size="large"
              @click="retryImport"
            >
              {{ t('button.try') }}
            </AppButton>
          </div>

          <div class="w-100">
            <AppButton
              block
              class="import-details__close mt-4"
              data-testid="import-details-close-button"
              elevation="0"
              size="large"
              @click="close"
            >
              {{ t('button.close') }}
            </AppButton>
          </div>
        </template>

        <template v-else>
          <div class="w-100">
            <AppButton
              block
              data-testid="import-details-close-button"
              kind="primary"
              size="large"
              @click="close"
            >
              {{ t('button.close') }}
            </AppButton>
          </div>
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { StatusLabelStatus } from '@/shared/ui/status-label/status-label'
  // No request of its own: the instance
  // comes from the list, and the live updates from the `import-status-changed` Echo event. The modal closes when the import leaves
  // `pending` / `in_progress` / `failed`. Try again raises `instance-retry-install` (the shell consumer runs it) and closes.
  import type { InstanceResource, RawInstance } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { useDisplay } from 'vuetify'
  import { toInstanceResource } from '@/entities/project/instance-resource'
  import { emit as emitAppEvent, useAppEvent } from '@/shared/events/app-events'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import { useMobileScrollLock } from '@/shared/ui/modal/mobile-scroll-lock'
  import ModalCloseButton from '@/shared/ui/modal/ModalCloseButton.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'

  // V2 `v-data-table` switched to its mobile layout under its own `mobile-breakpoint` (600px), not the app one (976px).
  const { width } = useDisplay()
  const tableMobile = computed(() => width.value < 600)

  interface ImportDetails {
    message?: string | null
    steps?: Record<string, string>
    current_step?: { name: string, percent?: unknown, current_item?: string | null } | null
  }

  const props = withDefaults(defineProps<{
    /** `/home` `app.single_server.active`: the live instance rebuilt from an Echo body points its screenshot at `projects`. */
    singleServer?: boolean
  }>(), {
    singleServer: false,
  })

  const { t } = useTranslation()

  const isOpen = ref(false)
  useMobileScrollLock(isOpen)
  const instance = ref<InstanceResource | null>(null)
  const activeInstanceId = ref<number | null>(null)

  const importDetails = computed(() => instance.value?.import_details as ImportDetails | null | undefined)

  const hasInstallFailed = computed(() => {
    try {
      return Boolean(instance.value?.hasInstallFailed())
    } catch {
      return false
    }
  })

  const stepItems = computed(() => Object.entries(importDetails.value?.steps ?? {}).map(([stepName, status]) => ({ stepName, status })))
  const currentStep = computed(() => importDetails.value?.current_step ?? null)
  const stepPercent = computed(() => {
    const percent = currentStep.value?.percent
    return currentStep.value && typeof percent === 'number' ? percent : null
  })
  const stepCurrentItem = computed(() => currentStep.value?.current_item ?? null)
  const failureMessage = computed(() => importDetails.value?.message || '...')

  // Kit status of an import step chip (kit-status-label): the colour pair of the former `v-chip-faded--*` classes.
  function statusChipStatus (status: string): StatusLabelStatus {
    const map: Record<string, StatusLabelStatus> = {
      'not-started': 'gray',
      'in-progress': 'sand',
      'completed': 'primary',
      'failed': 'error',
      'stopped': 'sand',
    }
    return map[status] ?? 'gray'
  }

  // Icon before the step status; `in-progress` shows the loader in the `prepend` slot instead.
  function statusChipIcon (status: string): string | undefined {
    const map: Record<string, string> = {
      completed: '$check',
      failed: '$alertTriangle',
      stopped: '$pause',
    }
    return map[status]
  }

  function close (): void {
    isOpen.value = false
  }

  function retryImport (): void {
    if (!instance.value) {
      return
    }
    emitAppEvent('instance-retry-install', instance.value as unknown as Record<string, unknown>)
    close()
  }

  function isImportFinishedSuccessfully (raw: RawInstance): boolean {
    const status = raw.async_status?.installation ?? null
    if (!status) {
      return false
    }
    return !['pending', 'in_progress', 'failed'].includes(status)
  }

  function show (target: InstanceResource): void {
    activeInstanceId.value = target.id
    instance.value = target
    isOpen.value = true
  }

  useAppEvent('import-status-changed', payload => {
    if (!isOpen.value) {
      return
    }
    const incomingId = (payload?.id as number | undefined) ?? null
    if (!incomingId || incomingId !== activeInstanceId.value) {
      return
    }
    const raw = payload as unknown as RawInstance
    instance.value = toInstanceResource(raw, { app: { single_server: { active: props.singleServer } } })
    if (isImportFinishedSuccessfully(raw)) {
      close()
    }
  })

  defineExpose({ show })
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// V2 vendor `.v-card__title { flex-wrap: wrap }`: on a narrow screen the X drops under the title instead of squeezing it.
.v-card-title {
  flex-wrap: wrap;
}

// Inline font sizes from legacy.
.import-details__desc {
  font-size: v.$font-size-base;
}

.import-details__failed-title {
  font-size: v.$font-size-sm;
}

.import-details__error-label {
  font-size: v.$font-size-xs;
  white-space: nowrap;
}

.import-details__error-text {
  font-size: v.$font-size-xs;
}

// V4's `.v-card-actions` has a 0.5rem flex gap V2 did not.
.v-card-actions.pt-8 {
  gap: 0;
}

// V2 `v-btn` without a colour is the `#f5f5f5` surface (`#272727` in dark); the V4 default is transparent here.
.import-details__close {
  background-color: var(--v-btn-surface);
}

// V2 `.v-data-table` is a 4px-radius surface with `font-size: .875rem; line-height: 1.5`; V4's table has no radius and inherits 1rem / 24px.
.v-data-table {
  border-radius: 4px;
  font-size: v.$font-size-sm;
  line-height: 1.5;
}

.v-data-table :deep(.v-table__wrapper) {
  overflow-x: auto;
  max-height: 320px;
  overflow-y: auto;
}

.custom--import-data-table {
  // V2 rows are 48px; V4's `--v-table-row-height` is 52px.
  --v-table-row-height: 48px;
}

.custom--import-data-table :deep(.v-table__wrapper) {
  padding: 0 24px;
}

// The V2 mobile table kept the 24px on the left only; the rows ran to the right edge of the card text.
.custom--import-data-table-mobile :deep(.v-table__wrapper) {
  padding-right: 0;
}

// V2 `rounded` on a linear progress is a 4px radius, not the V4 pill; its colour is the theme text colour.
.well .v-progress-linear {
  border-radius: 4px;
  color: var(--v-text-default);
}

.custom--import-data-table :deep(thead > tr > th) {
  height: 20px;
}

.custom--import-data-table :deep(thead > tr > th span) {
  font-size: 12px;
  font-style: normal;
  font-weight: 600;
  line-height: 16px;
  color: var(--v-gray-lighten1);
  text-transform: capitalize;
}

// Keeps `!important`: the global table cell padding (`.v-table > .v-table__wrapper > table > tbody > tr > td`)
// has higher specificity than `:deep` here, so the three declarations stay per property.
.custom--import-data-table :deep(tbody > tr > td:first-child) {
  padding-left: 0 !important;
}

.custom--import-data-table :deep(tbody > tr > td:last-child) {
  padding-right: 0 !important;
  text-align: right !important;
}

.custom--import-data-table :deep(tbody > tr > td:last-child > span) {
  margin-left: auto;
}

.alert-error-details {
  &__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    line-height: 20px;
  }

  &__label {
    color: var(--v-gray-lighten1);
    font-weight: 400;
    min-width: 110px;
    padding: 2px 12px 2px 0;
    vertical-align: top;
    white-space: nowrap;
  }

  &__value {
    font-weight: 600;
    color: var(--v-text-base);
    padding: 2px 0;
    vertical-align: top;
    word-break: break-all;

    &--file {
      font-family: monospace;
      font-size: 12px;
      font-weight: 400;
    }
  }

  &__badge {
    display: inline-block;
    background: var(--v-status-error-badge-bg);
    color: var(--v-error-base);
    border-radius: 4px;
    padding: 0 5px;
    font-size: 12px;
    font-weight: 700;
    line-height: 18px;
  }

  &__divider {
    border-top: 1px solid var(--v-status-error-bg);
    margin: 4px 0;
  }
}

.well {
  &--import-progress {
    background: var(--v-gray-lighten6);
    padding: 16px;
    padding-bottom: 20px;
    border-radius: 10px;
  }

  &__content {
    font-size: 16px;
    font-weight: 600;
    display: flex;
    justify-content: space-between;
  }
}
</style>
