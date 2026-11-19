<template>
  <AppDialog
    v-model="opened"
    :persistent="isRedeployPersistent(phase, form.submitting)"
    scroll-lock="mobile"
    transition="custom-dialog-transition"
    @click:outside="close"
  >
    <BasicModal
      :buttons="formButtons"
      close-testid="git-redeploy-close-icon"
      data-testid="git-redeploy-modal"
      icon="$update"
      :submitting="form.submitting && phase === 'form'"
      :title="t('heading.instance.siteDetails.redeploy.title')"
      :width="redeployDialogWidth(phase)"
      @button-click="onFormButton"
      @modal-close="close"
    >
      <template #custom>
        <p
          v-if="repoName && phase === 'form'"
          class="p-3 text-gray-darken-1 mb-4"
          data-testid="git-redeploy-repo"
        >
          {{ repoName }}
        </p>

        <div v-if="phase === 'form'">
          <AppMessage
            v-if="branchWarning"
            class="mb-5 git-redeploy__warning"
            data-testid="git-redeploy-branch-warning"
            variant="warning"
          >
            <p>{{ t('heading.instance.siteDetails.redeploy.branchWarning') }}</p>
          </AppMessage>

          <label class="base--text mb-2 d-block">{{ t('heading.instance.siteDetails.redeploy.branch') }}</label>

          <v-select
            v-model="form.selectedBranch"
            class="v-input--md"
            data-testid="git-redeploy-branch"
            density="compact"
            :disabled="form.submitting || form.listLoading"
            hide-details="auto"
            :items="form.branches"
            menu-icon="$dropdown"
            variant="outlined"
            @update:model-value="loadCommits"
          />

          <div class="commit-list mt-6">
            <div class="d-flex justify-space-between align-center commit-list__header px-4 py-3">
              <span>{{ t('heading.instance.siteDetails.redeploy.newCommits', { count: form.commitTotal }) }}</span>

              <span class="p-4 text-gray-darken-1 mono">{{ commitRangeLabel(form) }}</span>
            </div>

            <div
              class="commit-list__body"
              data-testid="git-redeploy-commits"
            >
              <template v-if="listState === 'loading'">
                <div
                  v-for="n in 4"
                  :key="`skeleton-${n}`"
                  class="commit-list__row d-flex align-center px-4"
                >
                  <v-skeleton-loader
                    class="commit-list__skeleton"
                    type="text"
                  />
                </div>
              </template>

              <div
                v-else-if="listState === 'error'"
                class="commit-list__row px-4 text-error d-flex align-center"
              >
                {{ t('heading.instance.siteDetails.redeploy.fetchError') }}
              </div>

              <template v-else-if="listState === 'commits'">
                <div
                  v-for="commit in form.commits"
                  :key="commit.hash"
                  class="commit-list__row d-flex align-center px-4"
                >
                  <v-tooltip
                    location="bottom"
                    open-delay="150"
                  >
                    <template #activator="{ props: tooltipProps }">
                      <span
                        class="mono text-gray-darken-1 mr-3"
                        v-bind="tooltipProps"
                      >
                        {{ shortHash(commit.hash) }}
                      </span>
                    </template>

                    <span>{{ commit.hash }}</span>
                  </v-tooltip>

                  <span class="heading--text text-truncate">{{ commit.message }}</span>
                </div>
              </template>

              <div
                v-else
                class="commit-list__row px-4 text-gray-darken-1 d-flex align-center"
                data-testid="git-redeploy-commits-empty"
              >
                {{ branchUnfetched ? t('heading.instance.siteDetails.redeploy.branchNotFetched') : noNewCommitsText }}
              </div>
            </div>
          </div>

          <deploy-steps
            v-model="form.skippedSteps"
            class="mt-6"
            :disabled="form.submitting"
            :steps="targetDeploySteps(form)"
          />

          <div
            v-if="stagingCheckbox"
            class="mt-6"
          >
            <checkbox
              color="primary"
              data-testid="git-redeploy-deploy-staging"
              :disabled="form.submitting || form.gitStatusLoading"
              :label="t('heading.instance.siteDetails.redeploy.deployStaging')"
              :model-value="form.deployStaging"
              @update:model-value="onDeployStagingChange"
            />

            <div
              v-if="form.deployStaging"
              class="option-sub text-gray-darken-1"
              :class="{ mono: !catchUpHint }"
            >
              {{ t(hint.key, hint.params) }}
            </div>
          </div>

          <div
            v-if="form.treeDirty"
            class="mt-6"
            data-testid="git-redeploy-dirty"
          >
            <div class="p-4 text-gray-darken-1 mb-3">
              {{ t('heading.instance.siteDetails.redeploy.dirtyTree.title') }}
            </div>

            <radio
              color="primary"
              :disabled="form.submitting"
              :model-value="form.conflictStrategy === 'force'"
              @update:model-value="setConflictStrategy(form, 'force')"
            >
              <div>
                <div class="heading--text font-weight-bold">
                  {{ t('heading.instance.siteDetails.redeploy.dirtyTree.force') }}
                </div>

                <div class="p-4 text-error mt-1">
                  {{ t('heading.instance.siteDetails.redeploy.dirtyTree.forceHint') }}
                </div>
              </div>
            </radio>

            <radio
              color="primary"
              :disabled="form.submitting"
              :model-value="form.conflictStrategy === 'push_first'"
              @update:model-value="setConflictStrategy(form, 'push_first')"
            >
              <div>
                <div class="heading--text font-weight-bold">
                  {{ t('heading.instance.siteDetails.redeploy.dirtyTree.pushFirst') }}
                </div>

                <div class="p-4 text-gray-darken-1 mt-1">
                  {{ t('heading.instance.siteDetails.redeploy.dirtyTree.pushFirstHint') }}
                </div>
              </div>
            </radio>
          </div>
        </div>

        <div v-else>
          <deploy-logs-viewer
            :current-stage="logs.currentStage.value"
            :error="logs.error.value"
            :lines="logs.lines.value"
            live
            source="git"
            :stages="logs.stages.value"
            :status="logs.status.value"
            :warning="logs.warning.value"
          />
        </div>
      </template>

      <template
        v-if="phase === 'logs'"
        #actions
      >
        <template v-if="viewerRunning">
          <AppButton
            v-if="!confirmingCancel"
            data-testid="git-redeploy-cancel-deploy"
            :disabled="logs.cancelling.value"
            kind="danger"
            @click="confirmingCancel = true"
          >
            {{ t('deployLogs.cancelDeploy') }}
          </AppButton>

          <div
            v-else
            class="d-flex align-center flex-wrap"
          >
            <span class="text-error p-4 mr-2">
              {{ t('deployLogs.cancelConfirmTitle') }}
            </span>

            <AppButton
              kind="danger"
              :loading="logs.cancelling.value"
              size="small"
              @click="cancelDeploy"
            >
              {{ t('button.confirm') }}
            </AppButton>

            <AppButton
              :disabled="logs.cancelling.value"
              kind="text"
              size="small"
              @click="confirmingCancel = false"
            >
              {{ t('button.cancel') }}
            </AppButton>
          </div>
        </template>

        <v-spacer />

        <AppButton
          v-if="viewerDownloadLogId"
          kind="link"
          :loading="logs.downloading.value"
          @click="logs.download"
        >
          <v-icon
            class="mr-1"
            icon="$downloadcloud"
            size="16"
          />

          {{ t('deployLogs.downloadLog') }}
        </AppButton>

        <AppButton
          data-testid="git-redeploy-close"
          :disabled="!logsTerminal"
          kind="text"
          @click="close"
        >
          {{ t('button.close') }}
        </AppButton>
      </template>
    </BasicModal>
  </AppDialog>
</template>

<script lang="ts" setup>
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  // app-lite only (no app counterpart). Logic in `../git-redeploy.ts`; the logs phase runs on the
  // kit `DeployLogsViewer` fed by `useDeployLogs` (deferred: the viewer stays in `entities/project/ui/deploy`). The owner (General page) calls `open()`.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, reactive, ref } from 'vue'
  import { getGitBranches } from '@/views/projects/project/advanced/git/git.api'
  import {
    applyBranches,
    applyBranchesError,
    applyCommits,
    applyCommitsError,
    applyDirtyFailure,
    applyTargetSource,
    applyTargetStatus,
    applyTargetStatusError,
    beginCommitsLoad,
    beginGitStatusLoad,
    beginTargetLoad,
    branchNotFetched,
    buildRedeployPayload,
    canCloseRedeploy,
    canRedeploy,
    changeRedeployTarget,
    commitListState,
    commitRangeLabel,
    createRedeployForm,
    finishCommitsLoad,
    finishGitStatusLoad,
    isRedeployPersistent,
    isRedeployTargetEvent,
    mapRedeployError,
    rebuildSameHash,
    redeployDialogWidth,
    type RedeployPhase,
    redeployRepoName,
    redeployTargetId,
    resetRedeployForm,
    setConflictStrategy,
    shortHash,
    shouldLoadCommits,
    showBranchWarning,
    showStagingCatchUpHint,
    showStagingCheckbox,
    stagingHint,
    targetDeploySteps,
  } from '@/views/projects/project/general/git-redeploy'
  import { getGitCommits, getGitSourceStatus, redeployInstance } from '@/views/projects/project/instance.api'
  import { forgetProjectSource, getProjectSource } from '@/entities/project/project-source.api'
  import DeployLogsViewer from '@/entities/project/ui/deploy/DeployLogsViewer.vue'
  import DeploySteps from '@/entities/project/ui/deploy/DeploySteps.vue'
  import { useDeployLogs } from '@/entities/project/use-deploy-logs'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { useAppEvent } from '@/shared/events/app-events'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Radio from '@/shared/ui/buttons/Radio.vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const emit = defineEmits<{
    'reload-instance': []
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  // The mobile scroll lock (legacy V2 `VDialog` shifts the page under 768px while open) is the `scroll-lock="mobile"` of `AppDialog`.
  const opened = ref(false)
  const phase = ref<RedeployPhase>('form')
  const form = reactive(createRedeployForm(props.instance))
  const targetId = ref<number | string | null>(null)
  const confirmingCancel = ref(false)
  const logsTerminal = ref(false)
  // The footer's cancel button and download link follow the data layer: a deploy that is still running when the log phase opens keeps
  // its status, so the legacy `state-change` watcher (fired on a change only) left them hidden for the whole run.
  const viewerRunning = computed(() => logs.isRunning.value)
  const viewerDownloadLogId = computed(() => logs.downloadLogId.value)

  const repoName = computed(() => redeployRepoName(props.instance))
  const branchWarning = computed(() => showBranchWarning(form, props.instance))
  const stagingCheckbox = computed(() => showStagingCheckbox(props.instance))
  const catchUpHint = computed(() => showStagingCatchUpHint(form, props.instance))
  const hint = computed(() => stagingHint(form, props.instance))
  const listState = computed(() => commitListState(form))
  const branchUnfetched = computed(() => branchNotFetched(form))
  const redeployEnabled = computed(() => canRedeploy(form))

  // The card is the kit `BasicModal`. The form phase has Redeploy and Cancel as its buttons (the test ids stay); the logs
  // phase has none, its footer is the `actions` slot. `submitting` (form phase only) hides the X and spins Redeploy, as before.
  const formButtons = computed<ModalButton[]>(() => phase.value === 'form'
    ? [
      { id: 'redeploy', label: t('button.redeploy'), color: 'primary', disabled: !redeployEnabled.value, testId: 'git-redeploy-submit' },
      { ...cancelButton(t), disabled: form.submitting, testId: 'git-redeploy-cancel' },
    ]
    : [])

  function onFormButton (id: string): void {
    if (id === 'redeploy') {
      void onRedeploy()
      return
    }
    close()
  }

  const noNewCommitsText = computed(() => {
    const hash = rebuildSameHash(form, props.instance)
    return hash
      ? t('heading.instance.siteDetails.redeploy.rebuildSame', { hash })
      : t('heading.instance.siteDetails.redeploy.noNewCommits')
  })

  // Git branches, commits, working tree and `/source` all belong to the deploy target (the viewed project, or its newest staging).
  const targetGitId = computed(() => redeployTargetId(props.instance, form.deployStaging))

  const logs = useDeployLogs({
    instanceId: () => targetId.value,
    live: () => true,
    logId: () => null,
    active: () => opened.value && phase.value === 'logs',
    onTerminal: () => {
      confirmingCancel.value = false
      logsTerminal.value = true
      form.submitting = false
    },
  })

  function close (): void {
    if (!canCloseRedeploy(phase.value, form.submitting, logsTerminal.value)) {
      return
    }
    opened.value = false
  }

  /** Resolves to false when a newer load of the target replaced this one. */
  async function loadBranches (): Promise<boolean> {
    const seq = beginTargetLoad(form)
    try {
      applyBranches(form, await getGitBranches(targetGitId.value), seq)
    } catch {
      applyBranchesError(form, seq)
    }
    return seq === form.seq.load
  }

  async function loadCommits (): Promise<void> {
    if (!shouldLoadCommits(form)) {
      return
    }
    const seq = beginCommitsLoad(form)
    try {
      applyCommits(form, await getGitCommits(targetGitId.value, form.selectedBranch), seq)
    } catch {
      applyCommitsError(form, seq)
    } finally {
      finishCommitsLoad(form, seq)
    }
  }

  async function loadTargetGitStatus (): Promise<void> {
    const seq = beginGitStatusLoad(form)
    try {
      applyTargetStatus(form, await getGitSourceStatus(targetGitId.value), seq)
    } catch {
      applyTargetStatusError(form, seq)
    } finally {
      finishGitStatusLoad(form, seq)
    }
  }

  /** The target's `/source`, shared with the Source cards through the memo. */
  async function loadTargetSource (): Promise<void> {
    const seq = form.seq.load
    try {
      applyTargetSource(form, await getProjectSource(targetGitId.value), seq)
    } catch {
      applyTargetSource(form, null, seq)
    }
  }

  /** The independent requests run in parallel; commits follow the branches. */
  async function loadTarget (): Promise<void> {
    form.listLoading = true
    await Promise.all([
      loadBranches().then(async current => {
        if (!current) {
          return
        }
        if (form.listError) {
          form.listLoading = false
          return
        }
        await loadCommits()
      }),
      loadTargetGitStatus(),
      loadTargetSource(),
    ])
  }

  /** Resets, loads the target, then shows the dialog. */
  async function open (): Promise<void> {
    phase.value = 'form'
    targetId.value = null
    confirmingCancel.value = false
    logsTerminal.value = false
    resetRedeployForm(form, props.instance)
    await loadTarget()
    opened.value = true
  }

  async function onDeployStagingChange (checked: boolean): Promise<void> {
    changeRedeployTarget(form, props.instance, checked)
    await loadTarget()
  }

  async function onRedeploy (): Promise<void> {
    if (!redeployEnabled.value) {
      return
    }
    form.submitting = true
    try {
      const result = await redeployInstance(props.instance.id, buildRedeployPayload(form, props.instance))
      targetId.value = result.target_id
      forgetProjectSource(result.target_id)
      phase.value = 'logs'
      form.submitting = true
    } catch (error) {
      const failure = mapRedeployError(error)
      if (failure.kind === 'dirty') {
        applyDirtyFailure(form)
        return
      }
      alerts.addAlert({
        success: false,
        errorMessage: failure.inProgress
          ? String(t('notification.instance.git.redeploy.inProgress') || failure.message)
          : failure.message,
      })
      form.submitting = false
    }
  }

  async function cancelDeploy (): Promise<void> {
    if (await logs.cancelDeploy()) {
      confirmingCancel.value = false
    }
  }

  useAppEvent('instance-redeploy-finished', payload => {
    if (!isRedeployTargetEvent(payload, targetId.value)) {
      return
    }
    emit('reload-instance')
    alerts.addAlert({ success: true, successMessage: String(t('notification.instance.git.rebuild.success')) })
    form.submitting = false
  })

  useAppEvent('instance-redeploy-failed', payload => {
    if (!isRedeployTargetEvent(payload, targetId.value)) {
      return
    }
    emit('reload-instance')
    alerts.addAlert({ success: false, errorMessage: String(t('notification.instance.git.redeploy.failed')) })
    form.submitting = false
  })

  defineExpose({ open })
</script>

<style
  lang="scss"
  scoped
  src="@/shared/ui/modal/BasicModal.scss"
/>

<style lang="scss" scoped>
// V2 spaced neighbouring buttons with `.v-btn + .v-btn { margin-left: 8px }`; `BasicModal.scss` zeroes the V4 actions `gap`, so the margin is restated.
.v-card-actions .v-btn + .v-btn {
  margin-left: 8px;
}

// `map-get($gray, lighten2)` is `--v-gray-lighten2`.
.commit-list {
  border: 1px solid var(--v-gray-lighten2);
  border-radius: 4px;
  overflow: hidden;
}

.commit-list__header {
  border-bottom: 1px solid var(--v-gray-lighten2);
}

.commit-list__body {
  max-height: calc(4 * 48px);
  overflow-y: auto;
}

.commit-list__row {
  height: 48px;
  box-sizing: border-box;
}

.commit-list__row + .commit-list__row {
  border-top: 1px solid var(--v-gray-lighten2);
}

.commit-list__skeleton {
  width: 100%;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  letter-spacing: 0.2px;
}

.option-sub {
  margin-top: 4px;
  margin-left: 38px;
}
</style>
