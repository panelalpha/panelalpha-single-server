<template>
  <div class="deploy-steps">
    <div
      v-for="step in steps"
      :key="step.name"
      class="deploy-steps__step"
      :class="loading ? 'deploy-steps__step--loading' : `deploy-steps__step--${step.state}`"
    >
      <div class="deploy-steps__icon">
        <v-skeleton-loader
          v-if="loading"
          class="deploy-steps__bone deploy-steps__bone--icon"
          type="avatar"
        />

        <svg
          v-else-if="step.state === 'done'"
          aria-hidden="true"
          class="deploy-steps__check"
          fill="none"
          height="12"
          viewBox="0 0 12 12"
          width="12"
        >
          <path
            d="M9.5 3.5L5 8.5L2.5 6"
            stroke="var(--v-white-base)"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
          />
        </svg>

        <v-icon
          v-else-if="step.state === 'error'"
          color="var(--v-white-base)"
          icon="$close"
          size="12"
        />

        <div
          v-else-if="step.state === 'progress'"
          class="deploy-steps__loader"
        />

        <span
          v-else
          class="deploy-steps__dot"
        />
      </div>

      <div class="deploy-steps__body">
        <v-skeleton-loader
          v-if="loading"
          class="deploy-steps__bone deploy-steps__bone--name"
          :class="`deploy-steps__bone--name-${step.name}`"
          data-testid="deploy-steps-name-skeleton"
          type="text"
        />

        <div
          v-else
          class="deploy-steps__name"
        >{{ stepName(step.name) }}</div>

        <v-skeleton-loader
          v-if="loading"
          class="deploy-steps__bone deploy-steps__bone--meta"
          data-testid="deploy-steps-meta-skeleton"
          type="text"
        />

        <div
          v-else
          class="deploy-steps__meta"
        >{{ stepMeta(step) }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { type DeploySource, type DeployStage, type DeployStep, deployStepLabelKey, visibleSteps } from './deploy-steps'

  const props = withDefaults(defineProps<{
    stages?: DeployStage[]
    currentStage?: string | null
    status?: string
    /** The deploy's source: a files project's `cloning` stage is the archive being unpacked, not a repository cloned. */
    source?: DeploySource | null
    // the deploy is still being read: skeleton bones in place of the icon, the name and the state (no legacy counterpart)
    loading?: boolean
  }>(), {
    stages: () => [],
    currentStage: null,
    status: 'running',
    source: null,
    loading: false,
  })

  const { t } = useTranslation()

  const steps = computed(() => visibleSteps(props.stages, props.currentStage, props.status))

  function stepName (name: string): string {
    const key = deployStepLabelKey(name, props.source)
    const translated = t(key)
    return translated === key ? name : translated
  }

  function stepMeta (step: DeployStep): string {
    if (step.state === 'done') {
      return step.duration === null
        ? t('deployLogs.stepState.completed')
        : `${t('deployLogs.stepState.completed')} · ${step.duration}s`
    }
    if (step.state === 'progress') {
      return t('deployLogs.stepState.inProgress')
    }
    if (step.state === 'error') {
      return t(`deployLogs.status.${props.status}`)
    }
    if (step.state === 'skipped') {
      return t('deployLogs.stepState.skipped')
    }
    return t('deployLogs.stepState.waiting')
  }
</script>

<style lang="scss" scoped>
.deploy-steps {
  display: flex;
  flex-direction: column;
  gap: 2px;

  &__step {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-radius: 9px;

    &--progress {
      background: rgba(var(--v-deploy-accent), 0.06);
    }
  }

  &__icon {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  &__step--done &__icon {
    background: rgb(var(--v-theme-primary));
  }
  &__step--error &__icon {
    background: rgb(var(--v-theme-error));
  }
  &__step--progress &__icon {
    background: rgba(var(--v-deploy-accent), 0.15);
  }
  &__step--pending &__icon,
  &__step--skipped &__icon {
    background: var(--v-gray-lighten3);
  }

  &__loader {
    width: 10px;
    height: 10px;
    border: 2px solid rgba(var(--v-deploy-accent), 0.3);
    border-top-color: rgb(var(--v-theme-primary));
    border-radius: 50%;
    animation: deploy-steps-spin 0.8s linear infinite;
  }

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--v-gray-lighten2);
  }

  &__body {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex: 1;
  }

  &__name {
    font-weight: 700;
    font-size: 13px;
  }

  &__step--pending &__name,
  &__step--skipped &__name {
    color: var(--v-gray-darken1);
  }

  &__meta {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--v-gray-darken1);
    margin-left: auto;
  }

  // The row keeps the height of a step with text (22px body), so nothing jumps when the steps arrive.
  &__step--loading &__body {
    min-height: 22px;
    align-items: center;
  }

  // V4 bones are flex items with a 16px margin; the icon bone takes the 20px circle, the name and state bones sit where their
  // texts do (name widths close to "Preparing environment", "Cloning repository", "Running stack").
  &__bone {
    background: transparent;

    :deep(.v-skeleton-loader__avatar),
    :deep(.v-skeleton-loader__text) {
      margin: 0;
    }

    &--icon :deep(.v-skeleton-loader__avatar) {
      width: 20px;
      min-width: 20px;
      max-width: 20px;
      height: 20px;
      min-height: 20px;
      max-height: 20px;
    }

    &--name,
    &--meta {
      :deep(.v-skeleton-loader__text) {
        height: 10px;
      }
    }

    &--name {
      flex: 0 0 140px;
    }

    &--name-cloning {
      flex-basis: 124px;
    }

    &--name-running {
      flex-basis: 92px;
    }

    &--meta {
      flex: 0 0 72px;
      margin-left: auto;
    }
  }

  &__step--progress &__meta {
    color: rgb(var(--v-theme-primary));
  }
}

@keyframes deploy-steps-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
