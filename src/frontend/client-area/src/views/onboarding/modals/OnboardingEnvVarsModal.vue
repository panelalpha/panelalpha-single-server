<template>
  <OnboardingDialog
    close-on-back
    data-testid="onboarding-env-vars-modal"
    :model-value="isOpen"
  >
    <OnboardingCard
      v-if="isOpen"
      :close-disabled="loading || previewLoading"
      :width="640"
      @close="emit('remove-modal')"
    >
      <v-card-text class="px-8 pt-8">
        <div class="mb-8 d-flex align-start">
          <div class="d-flex flex-column">
            <span class="font-weight-light p-1">
              {{ t(stepCopy.titleKey) }}
            </span>

            <h4>{{ t(stepCopy.subtitleKey) }}</h4>
          </div>
        </div>

        <v-divider class="mb-5" />

        <div
          v-if="showBranchSelect"
          class="mb-5"
        >
          <span class="text-gray-darken-1 mb-1 d-block">
            {{ t('heading.onboarding.envVars.branch.label') }}
          </span>

          <v-select
            class="mt-2 v-input--md"
            density="compact"
            :disabled="loading || previewLoading"
            hide-details
            :items="branches"
            :model-value="selectedBranch"
            variant="outlined"
            @update:model-value="onBranchPicked"
          />
        </div>

        <p
          v-if="showBranchMissing"
          class="text-error mb-5"
        >
          {{ t('heading.onboarding.gitDeploy.branchMissing', { branch: missingBranch }) }}
        </p>

        <AppMessage
          v-if="showHint"
          class="mb-4"
          role="alert"
          variant="info"
        >
          <p>{{ t('heading.onboarding.envVars.hint') }}</p>
        </AppMessage>

        <div
          v-if="previewLoading"
          class="py-6"
        >
          <v-skeleton-loader type="list-item-two-line, list-item-two-line, list-item-two-line" />
        </div>

        <div
          v-else-if="showRows"
          class="env-rows"
        >
          <div
            v-for="(row, index) in rows"
            :key="row.key + '-' + index"
            class="env-row d-flex align-center mb-3"
          >
            <v-text-field
              class="env-key flex-grow-1 v-input--sm"
              density="compact"
              hide-details
              :model-value="row.key"
              readonly
              variant="outlined"
            />

            <v-text-field
              class="flex-grow-1 v-input--sm"
              density="compact"
              :disabled="loading"
              hide-details
              :model-value="row.value"
              variant="outlined"
              @update:model-value="value => editValue(row, value)"
            />
          </div>
        </div>
      </v-card-text>

      <OnboardingStepFooter
        :back-disabled="loading || previewLoading || branchPickRequired"
        :back-label="t('heading.onboarding.envVars.skip')"
        :loading="loading"
        :max-steps="4"
        :next-disabled="loading || previewLoading || branchPickRequired"
        :next-label="t('button.continue')"
        :step="3"
        @back="skip"
        @next="continueWithEnv"
      />
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  import type { EnvVariable } from '@/views/onboarding/onboarding.api'
  import type { EnvVarsContext } from '@/views/onboarding/onboarding.store'
  // The rules (payload, skip, the example test) are in `env-vars.ts`;
  // this modal keeps the rows, the branch select and the preview of a branch change.
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { continueEnvVarsPayload, type EnvVarsResult, initialEnvBranch, mustChooseBranch, originalValues, showsBranchSelect, skipEnvVarsPayload, variableValue } from '@/views/onboarding/env-vars'
  import { previewEnvExample } from '@/views/onboarding/onboarding.api'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import OnboardingStepFooter from '@/views/onboarding/ui/OnboardingStepFooter.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'

  const props = withDefaults(defineProps<{
    isOpen: boolean
    /** The env vars step's context. Nothing renders without it. */
    context?: EnvVarsContext | null
    /** The flow's `submitting`: the continue button and the rows wait for it. */
    loading?: boolean
  }>(), {
    context: null,
    loading: false,
  })

  const emit = defineEmits<{
    'remove-modal': []
    'next': [result: EnvVarsResult]
  }>()

  const { t } = useTranslation()

  const selectedBranch = ref<string | null>(null)
  const rows = ref<EnvVariable[]>([])
  /** What each key had when the preview came in; the payload is the difference. */
  const original = ref<Record<string, string>>({})
  /** A value was edited, so a branch change asks first. */
  const dirty = ref(false)
  const previewLoading = ref(false)
  /** The branch has no example variables. */
  const branchMissingExample = ref(false)

  const branches = computed(() => props.context?.branches ?? [])
  /** The checkout already exists, so the branch rules and the info hint differ (`env-vars.ts`). */
  const sshMode = computed(() => props.context?.sshMode === true)
  const showBranchSelect = computed(() => showsBranchSelect(props.context))
  /** SSH mode and the connected branch is not on the remote: the copy says so above the select. */
  const showBranchMissing = computed(() => sshMode.value && props.context?.branchMissing === true)
  const missingBranch = computed(() => props.context?.missingBranch ?? '')
  /** Skip and Continue wait for a branch pick. */
  const branchPickRequired = computed(() => mustChooseBranch(props.context, selectedBranch.value))
  const showHint = computed(() => !sshMode.value && !previewLoading.value && !branchMissingExample.value && rows.value.length > 0)
  const showRows = computed(() => !branchMissingExample.value && rows.value.length > 0)
  /** The step shows no variable rows (the branch has no example): it is the branch pick, so it says so instead of
   * promising values from a file the repository has not got. */
  const stepCopy = computed(() => branchMissingExample.value
    ? { titleKey: 'heading.onboarding.envVars.noExample.title', subtitleKey: 'heading.onboarding.envVars.noExample.subtitle' }
    : { titleKey: 'heading.onboarding.envVars.title', subtitleKey: 'heading.onboarding.envVars.subtitle' })

  function resetLocal (): void {
    selectedBranch.value = null
    rows.value = []
    original.value = {}
    dirty.value = false
    previewLoading.value = false
    branchMissingExample.value = false
  }

  function applyVariables (variables: readonly EnvVariable[]): void {
    rows.value = variables.map(variable => ({ key: variable.key, value: variableValue(variable.value) }))
    original.value = originalValues(rows.value)
    dirty.value = false
  }

  /** The default branch is selected; the variables come from the context, or a preview when it has none. */
  function bootstrap (): void {
    const context = props.context
    if (!context) {
      return
    }
    selectedBranch.value = initialEnvBranch(context)
    if (context.previewReady) {
      applyVariables(context.variables)
      branchMissingExample.value = context.variables.length === 0
      previewLoading.value = false
      return
    }
    if (context.variables.length > 0) {
      applyVariables(context.variables)
      branchMissingExample.value = false
      return
    }
    void loadPreview()
  }

  /**
    * The example env file of the selected branch. The files source has no preview here (it comes with
    * the files sequence), so it counts as no example.
   */
  async function loadPreview (): Promise<void> {
    const context = props.context
    previewLoading.value = true
    branchMissingExample.value = false
    if (!context || context.source !== 'git') {
      rows.value = []
      branchMissingExample.value = true
      previewLoading.value = false
      return
    }
    try {
      const data = await previewEnvExample({
        repo_url: context.repoUrl ?? '',
        token: context.token ?? null,
        branch: selectedBranch.value,
      })
      // A modal closed while the preview ran keeps nothing (the late answer does not reopen the rows).
      if (!props.isOpen) {
        return
      }
      if (data?.has_example && Array.isArray(data.variables) && data.variables.length > 0) {
        applyVariables(data.variables)
        branchMissingExample.value = false
      } else {
        rows.value = []
        branchMissingExample.value = true
      }
    } catch (error) {
      if (!props.isOpen) {
        return
      }
      rows.value = []
      branchMissingExample.value = true
      useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      previewLoading.value = false
    }
  }

  /**
    * The select only changes when the change goes on. A dirty form asks first, and a
    * cancelled answer leaves `selectedBranch` (and so the select) on the branch it had.
   */
  async function onBranchPicked (next: string | null): Promise<void> {
    if (!next || next === selectedBranch.value) {
      return
    }
    // An SSH checkout already exists, so a branch change keeps the rows and does not preview.
    if (sshMode.value) {
      selectedBranch.value = next
      return
    }
    if (dirty.value && !window.confirm(t('heading.onboarding.envVars.branch.resetConfirm'))) {
      return
    }
    selectedBranch.value = next
    await loadPreview()
  }

  function editValue (row: EnvVariable, value: string | null): void {
    row.value = value ?? ''
    dirty.value = true
  }

  /** Skip, with the branch the select holds. */
  function skip (): void {
    if (!props.isOpen) {
      return
    }
    emit('next', { ...skipEnvVarsPayload(), branch: selectedBranch.value })
  }

  /** Continue, with the branch the select holds. */
  function continueWithEnv (): void {
    if (!props.isOpen) {
      return
    }
    emit('next', {
      ...continueEnvVarsPayload(original.value, rows.value, branchMissingExample.value),
      branch: selectedBranch.value,
    })
  }

  watch(() => props.isOpen, open => {
    if (open) {
      bootstrap()
    } else {
      resetLocal()
    }
  }, { immediate: true })
</script>

<style lang="scss" scoped>
  // V2 skeleton: transparent root and 72px `list-item-two-line` rows (V4: surface-coloured root, 64px rows).
  :deep(.v-skeleton-loader) {
    background: transparent;
  }

  :deep(.v-skeleton-loader__list-item-two-line) {
    height: 72px;
  }

  .env-rows {
    max-height: 360px;
    overflow-y: auto;
  }

  .env-row {
    gap: 12px;
  }

  // V2 dense outlined row field measured 41px (V4 `v-input--sm` 40px): the row takes the 41px from the input root.
  .env-row :deep(.v-input) {
    min-height: 41px;
  }

  .env-key {
    min-width: 140px;
    max-width: 40%;
  }
</style>
