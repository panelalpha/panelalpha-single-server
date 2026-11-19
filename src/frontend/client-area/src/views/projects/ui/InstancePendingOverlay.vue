<template>
  <div
    class="instance-pending"
    :class="[block, status === 'error' ? `${block}--error` : '', status === 'success' ? `${block}--success` : '']"
    :data-testid="block"
  >
    <div
      class="instance-pending__content"
      :class="`${block}__content`"
    >
      <div
        v-if="terminal"
        class="instance-pending__terminal"
        :class="`${block}__terminal`"
      >
        <div class="instance-pending__terminal-bar">
          <span class="instance-pending__terminal-dot" />

          <span class="instance-pending__terminal-dot" />

          <span class="instance-pending__terminal-dot" />
        </div>

        <div class="instance-pending__terminal-body">
          <template v-if="status !== 'error'">
            <div class="instance-pending__line instance-pending__line--1" />

            <div class="instance-pending__line instance-pending__line--2" />

            <div class="instance-pending__line instance-pending__line--3" />

            <span class="instance-pending__cursor" />
          </template>

          <template v-else>
            <div class="instance-pending__line instance-pending__line--static" />

            <div class="instance-pending__line instance-pending__line--static instance-pending__line--short" />

            <div class="instance-pending__line instance-pending__line--failed" />
          </template>
        </div>
      </div>

      <v-icon
        v-else-if="icon"
        class="instance-pending__icon"
        :class="`${block}__step-icon`"
        :icon="icon"
      />

      <div
        class="instance-pending__body"
        :class="`${block}__${bodyName}`"
        :data-testid="`${block}-${bodyName}`"
      >
        <div
          class="instance-pending__message"
          :class="{ 'instance-pending__message--alert': alert }"
        >
          <v-icon
            v-if="alert"
            color="error"
            icon="$alertcircle"
            size="16"
          />
          {{ message }}
          <a
            v-if="tryAgain"
            class="text-error"
            @click="emit('try-again')"
          >
            {{ t('button.try') }}
          </a>
        </div>

        <v-progress-linear
          v-if="progress !== undefined"
          class="instance-pending__progress"
          :class="`${block}__progress`"
          :color="status === 'error' ? 'var(--v-red-base)' : 'primary'"
          :indeterminate="isIndeterminate(progress)"
          :model-value="progressValue(progress)"
          rounded
        />

        <div
          v-if="step"
          class="instance-pending__step-row d-flex align-center justify-space-between w-100"
        >
          <span class="instance-pending__step-text">{{ step.label }}</span>

          <span class="instance-pending__step-text">{{ step.percent }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // Kit pattern of the project card pending image: one look for the import, installation and
  // deploy images. The
  // consumers pass the data (message, icon or terminal, bar, step, Try again); `block` keeps the legacy BEM classes and test ids
  // that the card tests and the parity probes read (`<block>__text`, `<block>__step`, `<block>__progress`, `<block>__terminal`).
  import type { InstancePendingProgress, InstancePendingStatus, InstancePendingStep } from './instance-pending'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { isIndeterminate, pendingBodyName, progressValue } from './instance-pending'

  const props = withDefaults(defineProps<{
    /** Legacy block class and test id: `import-pending`, `installation-pending` or `deploy-pending`. */
    block: string
    status?: InstancePendingStatus
    /** Already translated. */
    message: string
    /** Icon alias above the message (`$download`); not rendered with `terminal`. */
    icon?: string
    /** The animated deploy terminal above the message. */
    terminal?: boolean
    progress?: InstancePendingProgress
    step?: InstancePendingStep | null
    /** The `button.try` link after the message; nothing in the card listens to it today (legacy). */
    tryAgain?: boolean
    /**
     * Deploy: on error the message is red with the `$alertcircle` icon before it. Import and installation keep the grey message.
     */
    errorAlert?: boolean
  }>(), {
    status: 'in_progress',
    icon: undefined,
    progress: undefined,
    step: null,
  })

  const emit = defineEmits<{
    'try-again': []
  }>()

  const { t } = useTranslation()

  const bodyName = computed(() => pendingBodyName(props.status, props.progress))
  const alert = computed(() => props.errorAlert && props.status === 'error')
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// One look for the three images: the import layout with the deploy
// terminal (palette `$terminal`, fixed in both themes).
.instance-pending {
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;

  &__content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 100%;
    max-width: 260px;
  }

  &__icon {
    height: 22px;
    width: 22px;
    color: map.get(v.$gray, darken1);

    // The V4 icon renders its svg as the only child.
    > :deep(svg) {
      width: 22px;
      height: 22px;

      path {
        stroke: var(--v-import-step-stroke);
      }
    }
  }

  &__body {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }

  &__message {
    padding: 0 8px;
    font-size: v.$font-size-xs;
    line-height: v.$line-height-xs;
    font-weight: v.$font-weight-normal;
    color: map.get(v.$gray, darken1);
    text-align: center;
  }

  // `error--text`, the 16 px icon with `mr-2` before the text.
  &__message--alert {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: rgb(var(--v-theme-error));
  }

  &__progress {
    width: 100%;
    min-width: 100px;
    margin: 16px 0 4px;
  }

  &__step-text {
    font-size: v.$font-size-xxs;
    line-height: v.$line-height-xxs;
    font-weight: v.$font-weight-normal;
    color: map.get(v.$gray, darken1);
  }

  &__terminal {
    width: 100%;
    border-radius: 10px;
    background: map.get(v.$terminal, bg);
    overflow: hidden;
    box-shadow: 0 4px 14px map.get(v.$terminal, shadow);
  }

  &__terminal-bar {
    display: flex;
    gap: 4px;
    padding: 7px 10px;
    background: map.get(v.$terminal, bar);
  }

  &__terminal-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: map.get(v.$terminal, line);
  }

  &__terminal-body {
    padding: 10px 12px;
    min-height: 62px;
  }

  &__line {
    height: 6px;
    border-radius: 3px;
    background: map.get(v.$terminal, line);
    margin-bottom: 8px;
    transform-origin: left;

    &--1 {
      width: 62%;
      animation: instance-pending-line-pulse 2.1s ease-in-out infinite;
    }

    &--2 {
      width: 84%;
      animation: instance-pending-line-pulse 2.1s ease-in-out 0.7s infinite;
    }

    &--3 {
      width: 45%;
      margin-bottom: 0;
      animation: instance-pending-line-pulse 2.1s ease-in-out 1.4s infinite;
    }

    &--static {
      width: 62%;
      opacity: 0.6;
    }

    &--short {
      width: 45%;
    }

    &--failed {
      width: 70%;
      margin-bottom: 0;
      background: map.get(v.$terminal, line-error);
    }
  }

  &__cursor {
    display: inline-block;
    width: 7px;
    height: 10px;
    margin-top: 2px;
    background: map.get(v.$terminal, ok);
    animation: instance-pending-cursor-blink 1s step-end infinite;
  }
}

@keyframes instance-pending-line-pulse {
  0%,
  100% {
    opacity: 0.45;
  }

  50% {
    opacity: 1;
    background: map.get(v.$terminal, line-active);
  }
}

@keyframes instance-pending-cursor-blink {
  50% {
    opacity: 0;
  }
}
</style>
