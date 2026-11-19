<template>
  <OnboardingDialog
    data-testid="onboarding-deploy-zip-modal"
    :model-value="isOpen"
  >
    <OnboardingCard
      v-if="isOpen"
      :close-disabled="loading"
      @close="emit('remove-modal')"
    >
      <v-card-text class="px-8 pt-8">
        <div class="mb-8 d-flex align-start">
          <div class="d-flex flex-column pr-4">
            <span class="modal-eyebrow p-1 mb-2">
              {{ t('heading.onboarding.zipDeploy.eyebrow') }}
            </span>

            <h4 class="mb-2">
              {{ t('heading.onboarding.zipDeploy.title') }}
            </h4>

            <p class="p-2 font-weight-light mb-0 text-gray-darken-1">
              {{ t('heading.onboarding.zipDeploy.subtitle') }}
            </p>
          </div>
        </div>

        <drop-zone
          accept=".zip,.tar.gz,application/zip,application/x-zip-compressed,application/gzip,application/x-gzip"
          :add-more-label="isAtSelectionLimit ? undefined : t('heading.onboarding.zipDeploy.dropZone.addMore')"
          data-testid="onboarding-deploy-zip-drop-zone"
          :disabled="isDropZoneDisabled"
          :hint="t('heading.onboarding.zipDeploy.dropZone.hint', { size: uploadLimitLabel })"
          input-testid="onboarding-deploy-zip-input"
          :items="dropZoneItems"
          :reading="isReadingDrop"
          :remove-disabled="loading"
          :remove-label="t('button.remove')"
          :title="t('heading.onboarding.zipDeploy.dropZone.title')"
          @files="onFiles"
          @remove="removeSelection"
        />

        <div
          v-if="!isAtSelectionLimit"
          class="what-can-upload mt-4"
        >
          <span class="font-weight-bold d-block mb-4">
            {{ t('heading.onboarding.zipDeploy.whatCanIUpload.title') }}
          </span>

          <div
            v-for="hint in uploadHints"
            :key="hint.key"
            class="what-can-upload__row d-flex align-start mb-4"
          >
            <v-icon
              class="mr-3 mt-1"
              color="primary"
              :icon="hint.icon"
              size="24"
            />

            <div>
              <p class="font-weight-bold mb-1">
                {{ t(`heading.onboarding.zipDeploy.whatCanIUpload.${hint.key}.title`) }}
              </p>

              <p class="caption text-gray-darken-1 mb-0">
                {{ t(`heading.onboarding.zipDeploy.whatCanIUpload.${hint.key}.description`, { size: uploadLimitLabel }) }}
              </p>
            </div>
          </div>
        </div>

        <v-scale-transition>
          <AppMessage
            v-if="errorMessage"
            class="mt-5"
            data-testid="onboarding-deploy-zip-error"
            icon="$alertcircle"
            variant="error"
          >
            <b>
              <i18next :translation="t('message.alert.failed')">
                <template #message>
                  <span class="font-weight-medium">{{ errorMessage }}</span>
                </template>
              </i18next>
            </b>
          </AppMessage>
        </v-scale-transition>
      </v-card-text>

      <OnboardingStepFooter
        :back-disabled="loading"
        :back-label="t('button.cancel')"
        :loading="loading"
        :max-steps="4"
        :next-disabled="isContinueDisabled"
        :next-label="t('button.continue')"
        :step="2"
        @back="emit('remove-modal')"
        @next="submit"
      />
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  // The selection rules, the
  // allowed types, the one-archive limit and the error keys are in `shared/files/drop-files.ts`, shared with the project list drop zone.
  // The zone (drag and drop, picker, selection list, add-more, look) is the kit `DropZone`; this modal keeps the
  // selections and the error box.
  import type { DropSelection } from '@/shared/files/drop-files'
  import type { DropZoneItem } from '@/shared/ui/drop-zone/drop-zone'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import OnboardingStepFooter from '@/views/onboarding/ui/OnboardingStepFooter.vue'
  import {
    DROP_ERROR_KEYS,
    flattenSelections,
    MAX_FILE_SELECTIONS,
    selectionsFromDataTransfer,
    selectionsFromFileList,
  } from '@/shared/files/drop-files'
  import { uploadMaxBytes, uploadMaxLabel } from '@/shared/files/upload-limit'
  import { useSessionStore } from '@/shared/session/session.store'
  import DropZone from '@/shared/ui/drop-zone/DropZone.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'

  const props = withDefaults(defineProps<{
    isOpen: boolean
    /** The flow's `submitting`: the controls and the continue button wait for it. */
    loading?: boolean
  }>(), {
    loading: false,
  })

  const emit = defineEmits<{
    'remove-modal': []
    'next': [payload: { uploadItems: File[] }]
  }>()

  interface ZipSelection extends DropSelection {
    id: string
  }

  const { t } = useTranslation()
  const session = useSessionStore()

  // The panel's upload limit (home.app.upload_max_bytes): the zone names it and takes no archive the panel would refuse
  // after the upload.
  const uploadLimitBytes = computed(() => uploadMaxBytes(session.home))
  const uploadLimitLabel = computed(() => uploadMaxLabel(session.home))

  /** What the modal explains: one archive, with its icon (folders and database files are not taken). */
  const uploadHints = [
    { icon: '$archive', key: 'backup' },
  ] as const

  const selections = ref<ZipSelection[]>([])
  const selectionIdCounter = ref(0)
  const errorMessage = ref<string | null>(null)
  const isReadingDrop = ref(false)

  const hasSelections = computed(() => selections.value.length > 0)
  const isAtSelectionLimit = computed(() => selections.value.length >= MAX_FILE_SELECTIONS)
  const isContinueDisabled = computed(() => props.loading || !hasSelections.value)
  const isDropZoneDisabled = computed(() => props.loading || isAtSelectionLimit.value || isReadingDrop.value)
  const dropZoneItems = computed<DropZoneItem[]>(() => selections.value.map(selection => ({
    id: selection.id,
    label: selection.label,
    icon: '$filetext',
  })))

  function translate (key: string, options?: Record<string, unknown>): string {
    return String(t(key, options as never))
  }

  function nextSelectionId (): string {
    selectionIdCounter.value += 1
    return `selection-${selectionIdCounter.value}`
  }

  function appendSelections (added: DropSelection[]): void {
    selections.value = [
      ...selections.value,
      ...added.map(selection => ({ ...selection, id: nextSelectionId() })),
    ]
  }

  function resetData (): void {
    selections.value = []
    errorMessage.value = null
    isReadingDrop.value = false
  }

  /** A drop (the zone checked the lock): the transfer entries are read to refuse a folder; a rejected drop adds nothing. */
  async function onDropTransfer (transfer: DataTransfer): Promise<void> {
    errorMessage.value = null
    isReadingDrop.value = true
    try {
      const { selections: dropped, errorKey, errorParams } = await selectionsFromDataTransfer(transfer, {
        existingCount: selections.value.length,
        maxBytes: uploadLimitBytes.value,
      })
      if (errorKey) {
        errorMessage.value = translate(errorKey, errorParams)
      }
      appendSelections(dropped)
    } finally {
      isReadingDrop.value = false
    }
  }

  /** The picker's files: the same rules as a drop, a rejected batch adds nothing. */
  function addFileSelections (files: File[]): void {
    if (files.length === 0) {
      return
    }
    errorMessage.value = null
    const { selections: picked, errorKey, errorParams } = selectionsFromFileList(files, selections.value.length, uploadLimitBytes.value)
    if (errorKey) {
      errorMessage.value = translate(errorKey, errorParams)
      return
    }
    appendSelections(picked)
  }

  /** The zone's files: a drop carries its transfer (read now, its entries are gone after the event), a pick only the copied files. */
  function onFiles (files: File[], transfer: DataTransfer | null): void {
    if (transfer) {
      void onDropTransfer(transfer)
      return
    }
    addFileSelections(files)
  }

  function removeSelection (id: string): void {
    selections.value = selections.value.filter(item => item.id !== id)
    errorMessage.value = null
  }

  function submit (): void {
    if (isContinueDisabled.value) {
      return
    }
    errorMessage.value = null
    const uploadItems = flattenSelections(selections.value)
    if (uploadItems.length === 0) {
      errorMessage.value = translate(DROP_ERROR_KEYS.empty)
      return
    }
    // A form closed while the step was open hands nothing on (the flow's step guard repeats the check).
    if (!props.isOpen) {
      return
    }
    emit('next', { uploadItems })
  }

  // Every open and close starts from an empty modal.
  watch(() => props.isOpen, () => {
    resetData()
  })
</script>

<style lang="scss" scoped>
  .modal-eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .what-can-upload {
    &__row:last-child {
      margin-bottom: 0 !important;
    }
  }
</style>
