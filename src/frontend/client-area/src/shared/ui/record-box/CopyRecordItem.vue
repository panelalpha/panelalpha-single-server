<template>
  <li
    class="record-box-list-item"
    @click="onCopy"
    @mouseleave="onLeave"
    @mouseover="hovered = true"
  >
    <span v-if="label">{{ label }}: </span>

    <!-- Exception to AGENTS.md rule 1: keyboard copy; legacy is mouse only -->
    <span
      :aria-label="ariaLabel"
      class="record-box-copy-element heading--text"
      role="button"
      tabindex="0"
      @blur="onLeave"
      @keydown.enter.prevent="onKeyCopy"
      @keydown.space.prevent="onKeyCopy"
    >
      <span>{{ value }}</span>

      <v-tooltip
        content-class="copy-record-val-tooltip"
        :location="location"
        :model-value="hovered"
        open-delay="150"
        transition="custom-tooltip"
        @update:model-value="onTooltipModel"
      >
        <template #activator="{ props: activatorProps }">
          <v-icon
            v-bind="activatorProps"
            class="copy-icon"
            icon="$copy"
            :size="16"
          />
        </template>

        <div>
          <p class="p-3 mb-0 record-box-copy-element-tooltip">
            <span
              v-if="copyState === 'copied'"
              class="copied primary--text"
            >{{ t('tooltip.copied') }}</span>

            <span
              v-else
              class="copy"
            >{{ t('tooltip.copy') }}</span>
          </p>
        </div>
      </v-tooltip>
    </span>
  </li>
</template>

<script lang="ts" setup>
  // One copyable row of a record list. The parent provides `.well` and `ul.record-box-list`.
  // Each row owns its hover and clipboard state (legacy shared one, but only the hovered row shows its tooltip).
  import { useTranslation } from 'i18next-vue'
  import { computed, onUnmounted, ref } from 'vue'
  import { useCopyText } from '@/shared/ui/buttons/use-copy-text'

  const props = withDefaults(defineProps<{
    value: string
    label?: string
    location?: 'top' | 'bottom'
  }>(), {
    label: undefined,
    location: 'bottom',
  })

  const { t } = useTranslation()

  const hovered = ref(false)
  const { state: copyState, copy, reset, dispose } = useCopyText(() => props.value)

  const ariaLabel = computed(() => props.label
    ? `${t('tooltip.copy')} ${props.label}: ${props.value}`
    : `${t('tooltip.copy')}: ${props.value}`)

  function onLeave (): void {
    hovered.value = false
    reset()
  }

  // A `:model-value` without a listener is uncontrolled in V4 and the tooltip closes on a click on the row (click-outside); V2 `:value` stayed open.
  // Only `onLeave` closes it, so the listener takes the opening only.
  function onTooltipModel (value: boolean): void {
    if (value) {
      hovered.value = true
    }
  }

  function onCopy (): void {
    hovered.value = true
    void copy()
  }

  // A held key repeats `keydown`: one copy per press, as one click is one copy.
  function onKeyCopy (event: KeyboardEvent): void {
    if (!event.repeat) {
      onCopy()
    }
  }

  onUnmounted(dispose)
</script>

<style lang="scss" scoped>
.record-box-list-item {
  cursor: pointer;

  .copy-icon {
    transition: 0.3s;
    opacity: 0;
    visibility: hidden;
    margin-left: 4px;
    color: var(--v-primary-base);
  }

  &:hover {
    .copy-icon {
      opacity: 1;
      visibility: visible;
    }
  }

  // Keyboard focus of the value: the icon shows as on hover. Mouse focus does not match `:focus-visible`.
  .record-box-copy-element:focus-visible .copy-icon {
    opacity: 1;
    visibility: visible;
  }
}

.record-box-copy-element-tooltip {
  width: 50px;
  text-align: center;
}
</style>
