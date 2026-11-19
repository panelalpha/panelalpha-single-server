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
      class="project-limits-modal card-width-560"
      close-class="project-limits-close"
      :submitting="saving"
      :title="t(`${PREFIX}.title`)"
      @button-click="onButton"
      @modal-close="close"
    >
      <template #custom>
        <v-form
          class="d-flex flex-column"
          @submit.prevent="submit"
        >
          <p class="project-limits-description base--text mb-2">
            {{ t(`${PREFIX}.description`) }}
          </p>

          <AppMessage
            v-if="readOnly"
            class="mb-2"
            data-testid="project-limits-read-only"
            variant="info"
          >
            {{ t(`${PREFIX}.readOnly`) }}
          </AppMessage>

          <template
            v-for="field in mainFields"
            :key="field.key"
          >
            <LabeledField
              class="mt-4"
              :label="t(field.label)"
            >
              <v-text-field
                v-model="form[field.key].raw"
                autocomplete="off"
                class="v-input--md"
                :class="`limit-field limit-field-${field.key}`"
                density="compact"
                :disabled="inputDisabled(field)"
                :error-messages="errorsFor(field)"
                hide-details="auto"
                :hint="hintFor(field)"
                inputmode="decimal"
                persistent-hint
                single-line
                :suffix="field.unit"
                variant="outlined"
                @update:model-value="clearServerError(field)"
              />

              <Checkbox
                v-if="field.canBeUnlimited"
                v-model="form[field.key].unlimited"
                class="mt-1"
                :class="`limit-unlimited limit-unlimited-${field.key}`"
                :disabled="unlimitedDisabled(field)"
                :label="t(`${PREFIX}.noLimit`)"
                @update:model-value="clearServerError(field)"
              />
            </LabeledField>
          </template>

          <AppButton
            class="project-limits-toggle mt-4 align-self-start"
            data-testid="project-limits-advanced-toggle"
            size="small"
            variant="text"
            @click="showAdvanced = !showAdvanced"
          >
            {{ t(`${PREFIX}.advanced`) }}

            <v-icon
              class="ml-1 project-limits-chevron"
              :class="{ 'project-limits-chevron--up': showAdvanced }"
              icon="$chevrondown"
              size="18"
            />
          </AppButton>

          <template v-if="showAdvanced">
            <template
              v-for="field in advancedFields"
              :key="field.key"
            >
              <LabeledField
                class="mt-4"
                :label="t(field.label)"
              >
                <v-text-field
                  v-model="form[field.key].raw"
                  autocomplete="off"
                  class="v-input--md"
                  :class="`limit-field limit-field-${field.key}`"
                  density="compact"
                  :disabled="inputDisabled(field)"
                  :error-messages="errorsFor(field)"
                  hide-details="auto"
                  :hint="hintFor(field)"
                  inputmode="decimal"
                  persistent-hint
                  single-line
                  :suffix="field.unit"
                  variant="outlined"
                  @update:model-value="clearServerError(field)"
                />

                <Checkbox
                  v-model="form[field.key].unlimited"
                  class="mt-1"
                  :class="`limit-unlimited limit-unlimited-${field.key}`"
                  :disabled="unlimitedDisabled(field)"
                  :label="t(`${PREFIX}.noLimit`)"
                  @update:model-value="clearServerError(field)"
                />
              </LabeledField>
            </template>
          </template>

          <AppMessage
            v-if="otherErrors.length > 0"
            class="project-limits-error mt-4"
            data-testid="project-limits-error"
            variant="error"
          >
            <div
              v-for="message in otherErrors"
              :key="message"
            >
              {{ message }}
            </div>
          </AppMessage>
        </v-form>
      </template>
    </basic-modal>
  </AppDialog>
</template>

<script lang="ts" setup>
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import type { LimitField, LimitKey } from '@/entities/project/project-limits-form'
  import type { ProjectLimitsBody } from '@/entities/project/project-limits.api'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { isContainerProject } from '@/entities/project/container-project'
  import { ceilingOf, LIMIT_FIELDS, memoryMinimum, needsRebuild, roundUnit, toBody, toForm, validateForm } from '@/entities/project/project-limits-form'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { splitSaveError } from '@/shared/api/save-error'
  import { formatBytes } from '@/shared/format/format-bytes'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import LabeledField from '@/shared/ui/form/LabeledField.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  // Edits the six project limits in one form. One `PUT /instances/{id}/limits`; a 422 is shown under the field it names,
  // anything else in the modal. Built like `BackupStoreModal.vue`. The caller sends the request through `save` and keeps the answer:
  // Project details through the frame's store, My plans (paid editions) on the project it fetched.
  const PREFIX = 'heading.instance.advanced.projectLimits'
  const mainFields = LIMIT_FIELDS.filter(field => !field.advanced)
  const advancedFields = LIMIT_FIELDS.filter(field => field.advanced)

  const props = defineProps<{
    instance: InstanceResource
    readOnly: boolean
    /** Sends the limits and keeps the answer. `false` means nothing was sent; a failure is thrown (a 422 goes under its field). */
    save: (body: ProjectLimitsBody) => Promise<boolean>
  }>()

  const emit = defineEmits<{
    saved: [needsRebuild: boolean]
  }>()

  const open = defineModel<boolean>({ default: false })

  const { t: translate } = useTranslation()
  const t = translate as (key: string, options?: Record<string, unknown>) => string
  const alerts = useAlertsStore()

  const form = ref(toForm(props.instance.resources?.limits ?? emptyLimits(), props.instance.resources?.ceilings ?? emptyLimits()))
  const showAdvanced = ref(false)
  const submitted = ref(false)
  const serverErrors = ref<Partial<Record<LimitKey, string[]>>>({})
  const otherErrors = ref<string[]>([])

  const saving = ref(false)
  const isContainer = computed(() => isContainerProject(props.instance))
  const ceilings = computed(() => props.instance.resources?.ceilings ?? emptyLimits())
  const clientErrors = computed(() => validateForm(form.value, ceilings.value, isContainer.value))

  const buttons = computed<ModalButton[]>(() => props.readOnly
    ? [{ id: 'cancel', label: t('button.close'), color: 'normal', type: 'cancel', buttonClass: 'project-limits-cancel' }]
    : [
      { id: 'save', label: t('button.save'), color: 'primary', buttonClass: 'project-limits-submit', disabled: saving.value },
      { id: 'cancel', label: t('button.cancel'), color: 'normal', type: 'cancel', buttonClass: 'project-limits-cancel', disabled: saving.value },
    ])

  function emptyLimits () {
    return { memory_limit: null, cpu_limit: null, disk_space_limit: null, inodes_limit: null, device_read_bps: null, device_write_bps: null }
  }

  // Every opening starts from the saved limits.
  watch(open, isOpen => {
    if (isOpen) {
      form.value = toForm(props.instance.resources?.limits ?? emptyLimits(), ceilings.value)
      showAdvanced.value = false
      submitted.value = false
      serverErrors.value = {}
      otherErrors.value = []
    }
  })

  function inputDisabled (field: LimitField): boolean {
    return props.readOnly || saving.value || (field.canBeUnlimited && form.value[field.key].unlimited)
  }

  // A numeric plan ceiling means the client cannot lift the limit.
  function unlimitedDisabled (field: LimitField): boolean {
    return props.readOnly || saving.value || ceilingOf(ceilings.value[field.key]) !== null
  }

  function errorsFor (field: LimitField): string[] {
    const server = serverErrors.value[field.key]
    if (server) {
      return server
    }
    const error = submitted.value ? clientErrors.value[field.key] : undefined
    if (!error) {
      return []
    }
    return [t(`${PREFIX}.error.${error.kind}`, { value: error.value, unit: error.unit })]
  }

  function clearServerError (field: LimitField): void {
    if (serverErrors.value[field.key]) {
      serverErrors.value = { ...serverErrors.value, [field.key]: undefined }
    }
  }

  // The current usage (where the payload has it), then the bound the plan sets.
  function usageText (key: LimitKey): string | null {
    const resources = props.instance.resources
    if (key === 'memory_limit' && typeof resources?.usage?.memory_bytes === 'number') {
      return formatBytes(resources.usage.memory_bytes)
    }
    if (key === 'cpu_limit' && typeof resources?.usage?.cpu_percent === 'number') {
      return `${roundUnit(resources.usage.cpu_percent / 100)} ${fieldOf('cpu_limit').unit}`
    }
    if (key === 'disk_space_limit' && typeof resources?.disk?.total_bytes === 'number') {
      return formatBytes(resources.disk.total_bytes)
    }
    return null
  }

  function fieldOf (key: LimitKey): LimitField {
    return LIMIT_FIELDS.find(item => item.key === key) as LimitField
  }

  function hintFor (item: LimitField): string {
    const parts: string[] = []
    const used = usageText(item.key)
    if (used !== null) {
      parts.push(t(`${PREFIX}.hint.current`, { value: used }))
    }
    if (item.key === 'memory_limit') {
      parts.push(t(`${PREFIX}.hint.min`, { value: memoryMinimum(isContainer.value), unit: 'MB' }))
    }
    const ceiling = ceilingOf(ceilings.value[item.key])
    if (ceiling !== null) {
      parts.push(t(`${PREFIX}.hint.max`, { value: roundUnit(ceiling / item.factor), unit: item.unit }))
    }
    return parts.join(' · ')
  }

  function onButton (id: string): void {
    if (id === 'save') {
      void submit()
      return
    }
    close()
  }

  function close (): void {
    if (!saving.value) {
      open.value = false
    }
  }

  async function persist (body: ProjectLimitsBody): Promise<boolean> {
    saving.value = true
    try {
      return await props.save(body)
    } finally {
      saving.value = false
    }
  }

  async function submit (): Promise<void> {
    if (props.readOnly || saving.value) {
      return
    }
    submitted.value = true
    serverErrors.value = {}
    otherErrors.value = []
    if (Object.keys(clientErrors.value).length > 0) {
      // A failing field in the closed advanced block would stay unseen.
      showAdvanced.value ||= advancedFields.some(item => clientErrors.value[item.key])
      return
    }
    const body = toBody(form.value, ceilings.value)
    const rebuild = needsRebuild(props.instance.resources?.limits ?? emptyLimits(), body, isContainer.value)
    try {
      // `false`: nothing was sent (no instance, or a save already runs), so there is nothing to confirm.
      if (!await persist(body)) {
        return
      }
    } catch (error) {
      const failure = splitSaveError(error, LIMIT_FIELDS.map(item => item.key))
      if (failure === null) {
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
        return
      }
      serverErrors.value = failure.fields as Partial<Record<LimitKey, string[]>>
      otherErrors.value = failure.messages
      showAdvanced.value ||= advancedFields.some(item => failure.fields[item.key])
      return
    }
    alerts.addAlert({ success: true, successMessage: t('notification.instance.limits.update') })
    emit('saved', rebuild)
    open.value = false
  }
</script>

<style lang="scss" scoped>
.project-limits-chevron--up {
  transform: rotate(180deg);
}
</style>
