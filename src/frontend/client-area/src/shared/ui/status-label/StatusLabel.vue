<template>
  <v-chip
    class="status-label"
    :class="`status-label--${status}`"
    label
    size="small"
    variant="flat"
  >
    <slot name="prepend" />

    <v-icon
      v-if="icon"
      class="status-label__icon"
      :icon="icon"
      size="16"
    />

    <span
      v-if="$slots.default || hasValue"
      class="status-label__text"
    >
      <slot>{{ value }}</slot>
    </span>
  </v-chip>
</template>

<script lang="ts" setup>
  // Kit status chip: one look for every status chip, the colour pair from `status`. `class`,
  // `data-testid`, `tabindex`, `@click` and the tooltip / menu activator props fall through to the chip root. No HTML comment at
  // the template root: it would make the component a fragment in dev and drop the fallthrough.
  import type { StatusLabelStatus } from './status-label'
  import { computed } from 'vue'

  const props = withDefaults(defineProps<{
    value?: string | number
    status?: StatusLabelStatus
    icon?: string
  }>(), {
    value: undefined,
    status: 'gray',
    icon: undefined,
  })

  const hasValue = computed(() => props.value !== undefined && props.value !== null && props.value !== '')
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// One look: a 24 px label chip tinted by its status, bold 14 px text in the status colour. Two classes plus the
// scope beat the V4 size, density and flat-variant rules without `!important`.
.v-chip.status-label {
  --v-chip-height: 24px;

  height: 24px;
  width: fit-content;
  max-width: 100%;
  padding: 0 8px;
  border-style: none;
  border-radius: 4px;
  box-shadow: none;
  font-size: v.$font-size-sm;
  line-height: v.$line-height-sm;
  font-weight: v.$font-weight-bold;

  :deep(.v-chip__content) {
    gap: 4px;
  }
}

// The global `.v-icon` colours (`_general.scss`, `_icons.scss`) would paint the icon gray; it takes the text colour.
.v-chip.status-label .status-label__icon {
  color: inherit;
}

.v-chip.status-label--success {
  background-color: var(--v-success-lighten5);
  color: var(--v-success-base);
}

.v-chip.status-label--error {
  background-color: var(--v-error-lighten5);
  color: var(--v-error-base);
}

.v-chip.status-label--warning {
  background-color: var(--v-warning-lighten5);
  color: var(--v-warning-base);
}

.v-chip.status-label--info {
  background-color: var(--v-info-lighten5);
  color: var(--v-info-base);
}

.v-chip.status-label--gray {
  background-color: var(--v-gray-lighten5);
  color: var(--v-gray-darken1);
}

.v-chip.status-label--primary {
  background-color: var(--v-primary-lighten4);
  color: rgb(var(--v-theme-primary));
}

.v-chip.status-label--purple {
  background-color: var(--v-role6-bg);
  color: var(--v-role6-text);
}

.v-chip.status-label--sand {
  background-color: var(--v-sand-lighten5);
  color: var(--v-sand-darken2);
}
</style>
