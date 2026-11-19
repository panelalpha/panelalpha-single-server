<template>
  <v-btn
    v-bind="bindings"
    :active="kind === 'icon-toggle' ? undefined : active"
    :aria-label="ariaLabel"
    :aria-pressed="kind === 'toolbar' && active !== undefined ? active : undefined"
    :color="color ?? bindings.color"
    :disabled="disabled"
    :loading="loading"
    :size="size ?? bindings.size"
  >
    <template
      v-if="$slots.default || tooltip"
      #default
    >
      <slot />

      <v-tooltip
        v-if="tooltip"
        activator="parent"
        v-bind="tooltipBindings"
      >
        <span>{{ tooltip }}</span>
      </v-tooltip>
    </template>

    <template
      v-if="$slots.loader"
      #loader
    >
      <slot name="loader" />
    </template>
  </v-btn>
</template>

<script lang="ts" setup>
  // Button of the kit. `kind` sets the v-btn props and legacy classes of one button family (`app-button.ts`).
  // One root `v-btn` and no `<style>`: the presets (`ModalCloseButton`, `BaseIconButton`, `CopyTextButton`, `QuickActionsButton`)
  // keep their scoped styles and the content (icon, caption, loader) in the slot, so their `data-v` and the consumers' rules still reach the button.
  // Everything else (`class`, `href`, `target`, `rel`, `data-testid`, listeners, a `v-menu` activator `ref` and props) falls through to the `v-btn`.
  // `tooltip` renders a `v-tooltip` with `activator="parent"` inside the button (Vuetify skips the `data-no-activator` content span, so the `<button>` is the activator);
  // the root stays one `v-btn`, so the `data-v` and `data-testid` of the consumer reach the button. A tooltip with other content or a wrapper stays in the consumer.
  // `active` picks the variant of `icon-toggle` and is not the `v-btn` state there; any other `kind` passes it to the `v-btn` (`v-btn--active`).
  // `#loader` is passed to the `v-btn` only when the caller fills it, so a button without it keeps the V4 default spinner.
  // The default slot too: a button without content (an `icon="mdi-…"` of the file manager) keeps the icon the v-btn renders itself.
  // No i18n here: a label and a tooltip text come in as props.
  import { computed } from 'vue'
  import { appButtonBindings, type AppButtonKind, appButtonTooltip } from './app-button'

  const props = withDefaults(defineProps<{
    kind?: AppButtonKind
    ariaLabel?: string
    color?: string
    size?: 'x-small' | 'small' | 'default' | 'large' | 'x-large'
    filled?: boolean
    active?: boolean
    tooltip?: string
    tooltipOffset?: number
    tooltipClass?: string
    loading?: boolean
    disabled?: boolean
  }>(), {
    kind: 'default',
    ariaLabel: undefined,
    color: undefined,
    size: undefined,
    filled: undefined,
    active: undefined,
    tooltip: undefined,
    tooltipOffset: undefined,
    tooltipClass: undefined,
    loading: undefined,
    disabled: undefined,
  })

  const bindings = computed(() => appButtonBindings(props.kind, { filled: props.filled, active: props.active }))
  const tooltipBindings = computed(() => appButtonTooltip({ offset: props.tooltipOffset, contentClass: props.tooltipClass }))
</script>
