<template>
  <div class="deploy-logs-viewer">
    <deploy-steps-list
      v-if="live || stages.length > 0"
      class="mb-4"
      :current-stage="currentStage"
      :source="source"
      :stages="stages"
      :status="status"
    />

    <div
      v-if="error"
      class="deploy-logs-viewer__error mb-4"
    >
      <v-icon
        class="mr-1"
        color="error"
        icon="$alertcircle"
        size="16"
      />

      <span class="deploy-logs-viewer__error-text">{{ error }}</span>
    </div>

    <div
      v-if="warning"
      class="deploy-logs-viewer__warning mb-4"
      data-testid="deploy-logs-viewer-warning"
    >
      <v-icon
        class="mr-1"
        color="warning"
        icon="$alertcircle"
        size="16"
      />

      <span class="deploy-logs-viewer__warning-text">{{ warning }}</span>
    </div>

    <deploy-logs-console
      :empty-text="emptyText"
      :lines="lines"
      :live="isRunning"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { DeployLogLine } from './deploy-log.types'
  import type { DeploySource, DeployStage } from './deploy-steps'
  // Template and error style. The data layer
  // (polling, websocket, history load, cancel, download) stays with the lite screens: this view only renders what it gets.
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import DeployLogsConsole from './DeployLogsConsole.vue'
  import DeployStepsList from './DeployStepsList.vue'

  const props = withDefaults(defineProps<{
    stages?: DeployStage[]
    currentStage?: string | null
    status?: string
    /** The deploy's source, when the screen knows it (the files and git forms), for the step names. */
    source?: DeploySource | null
    lines?: DeployLogLine[]
    error?: string | null
    /** What the Engine reported for a deploy it finished with warnings; one warning per line. */
    warning?: string | null
    // The screen passes true only while it follows the running deploy.
    live?: boolean
    variant?: 'live-modal'
  }>(), {
    stages: () => [],
    currentStage: null,
    status: 'running',
    source: null,
    lines: () => [],
    error: null,
    warning: null,
    live: false,
    variant: 'live-modal',
  })

  const { t } = useTranslation()

  const isRunning = computed(() => props.live && props.status === 'running')
  const emptyText = computed(() => props.live ? t('deployLogs.preparing') : t('deployLogs.noLines'))
</script>

<style lang="scss" scoped>
.deploy-logs-viewer {
  &__error {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--v-error-lighten5);
    color: rgb(var(--v-theme-error));
    font-size: 13px;
    font-weight: 600;
  }

  // A long message without spaces (paths, `lowerdir=…`) must wrap inside the frame, not stick out of it:
  // a flex element without `min-width: 0` does not shrink below the width of the longest word.
  &__error-text {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  // The same box in the warning palette: the deploy finished, with what the Engine warns about.
  &__warning {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--v-warning-lighten5);
    color: rgb(var(--v-theme-warning));
    font-size: 13px;
    font-weight: 600;
  }

  &__warning-text {
    min-width: 0;
    overflow-wrap: anywhere;
    white-space: pre-line;
  }
}
</style>
