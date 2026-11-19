<template>
  <v-dialog
    v-model="open"
    :persistent="submitting"
    transition="custom-dialog-transition"
  >
    <div
      class="card-overlay"
      @click="onCancel"
    />

    <v-card
      class="basic-modal card-width-560"
      data-testid="issue-resolve-modal"
      elevation="4"
    >
      <v-card-title class="d-flex justify-space-between align-start">
        <div v-if="issue">
          <h5 class="heading--text mb-1">
            {{ issue.modalTitleKey ? t(issue.modalTitleKey, issueParams) : '' }}
          </h5>

          <p class="p-3 text-gray-darken-1 mb-0">
            {{ issue.modalDescriptionKey ? t(issue.modalDescriptionKey, issueParams) : '' }}
          </p>
        </div>

        <modal-close-button
          v-if="!submitting"
          @click="onCancel"
        />
      </v-card-title>

      <v-card-text v-if="issue">
        <div>
          <div class="p-4 text-gray-darken-1 mb-3">
            {{ t('heading.instance.statusIndicator.howToFix') }}
          </div>

          <div
            v-for="sol in issue.solutions"
            :key="sol.id"
          >
            <radio
              color="primary"
              :model-value="selectedSolutionId === sol.id"
              @update:model-value="selectSolution(sol.id)"
            >
              <div>
                <div class="heading--text font-weight-bold">
                  {{ t(sol.titleKey, issueParams) }}
                </div>

                <div class="p-4 text-gray-darken-1 mt-1">
                  {{ t(sol.descriptionKey, issueParams) }}
                </div>
              </div>
            </radio>

            <div
              v-if="selectedSolutionId === sol.id && selectedSolution"
              class="option-sub mb-4"
            >
              <upload-archive-widget
                v-if="selectedSolution.ui === 'upload-archive'"
                v-model="uploadValue"
                @complete="onWidgetComplete"
                @error="emit('error', $event)"
              />
            </div>
          </div>
        </div>
      </v-card-text>

      <v-card-actions class="d-flex justify-end pb-8 pt-8 px-6">
        <AppButton
          :disabled="submitting"
          kind="text"
          size="large"
          @click="onCancel"
        >
          <span class="p-2 font-weight-bold text-gray-darken-1">{{ ` ${t('button.cancel')} ` }}</span>
        </AppButton>

        <AppButton
          class="issue-resolve-modal__resolve"
          data-testid="issue-resolve-submit"
          :disabled="!canResolve || submitting"
          kind="primary"
          :loading="submitting"
          size="large"
          @click="onResolve"
        >
          <span class="p-2 font-weight-600">{{ ` ${t('button.statusIndicator.resolve')} ` }}</span>
        </AppButton>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { HydratedIssue, InstanceLike } from './issue-registry'
  import type { IssueResolvePayload } from './status-issues.types'
  // Presentational: the upload + redeploy
  // POSTs, `addAlert` and the `lockBodyScroll` dispatch (V4 dialog locks the scroll itself) stay out;
  // the lite screen drives them from the `resolve` event and the `submitting` prop.
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Radio from '@/shared/ui/buttons/Radio.vue'
  import { useMobileScrollLock } from '@/shared/ui/modal/mobile-scroll-lock'
  import ModalCloseButton from '@/shared/ui/modal/ModalCloseButton.vue'
  import UploadArchiveWidget from './UploadArchiveWidget.vue'

  const props = withDefaults(defineProps<{
    issue?: HydratedIssue | null
    // Legacy read `instance.id` for the API calls; the lite screen owns those now.
    instance: InstanceLike
    submitting?: boolean
  }>(), {
    issue: null,
    submitting: false,
  })

  const emit = defineEmits<{
    resolve: [payload: IssueResolvePayload]
    // i18n key of an upload rejection, relayed from `UploadArchiveWidget`
    error: [key: string]
  }>()

  const open = defineModel<boolean>({ default: false })
  useMobileScrollLock(open)

  const { t } = useTranslation()

  const selectedSolutionId = ref<string | null>(null)
  const widgetComplete = ref(false)
  const uploadValue = ref<File | null>(null)

  const issueParams = computed(() => (props.issue?.params ?? {}) as Record<string, unknown>)

  const selectedSolution = computed(() => {
    if (!props.issue?.solutions) {
      return null
    }
    return props.issue.solutions.find(s => s.id === selectedSolutionId.value) ?? null
  })

  const canResolve = computed(() => !!selectedSolution.value && widgetComplete.value === true)

  function resetWidgetState (): void {
    uploadValue.value = null
    widgetComplete.value = false
  }

  watch(() => props.issue, issue => {
    selectedSolutionId.value = issue?.solutions?.length ? issue.solutions[0]!.id : null
    resetWidgetState()
  }, { immediate: true })

  watch(selectedSolutionId, resetWidgetState)

  function selectSolution (id: string): void {
    if (props.submitting) {
      return
    }
    selectedSolutionId.value = id
  }

  function onWidgetComplete (complete: boolean): void {
    widgetComplete.value = complete
  }

  function onCancel (): void {
    if (props.submitting) {
      return
    }
    open.value = false
  }

  function onResolve (): void {
    if (!canResolve.value || props.submitting || !props.issue || !selectedSolutionId.value) {
      return
    }
    emit('resolve', { issue: props.issue, solutionId: selectedSolutionId.value, value: uploadValue.value })
  }
</script>

<style
  lang="scss"
  scoped
  src="@/shared/ui/modal/BasicModal.scss"
/>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

.option-sub {
  margin-top: 4px;
  margin-left: 38px;
}

// V2 actions had no flex gap: adjacent buttons were 8px apart through `.v-btn + .v-btn`. `elevation="0"` painted three zero-size
// shadows (V4 flat paints two with other opacities).
.v-card-actions {
  gap: 0;

  .v-btn + .v-btn {
    margin-left: 8px;
  }
}

.v-card-actions .v-btn {
  box-shadow: v.$box-shadow-v2-list-flat;
}
</style>
