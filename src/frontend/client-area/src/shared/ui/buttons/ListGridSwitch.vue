<template>
  <div>
    <AppButton
      :active="listStyle === 0"
      :aria-label="gridLabel"
      :class="[
        mobile ? 'ml-2' : 'ml-4',
        disabled ? 'button-disabled' : '',
      ]"
      kind="icon-toggle"
      @click="listStyle = 0"
    >
      <v-icon icon="$grid" />
    </AppButton>

    <AppButton
      :active="listStyle === 1"
      :aria-label="listLabel"
      :class="[
        mobile ? 'ml-2' : 'ml-4',
        disabled ? 'button-disabled' : '',
      ]"
      kind="icon-toggle"
      @click="listStyle = 1"
    >
      <v-icon icon="$list" />
    </AppButton>
  </div>
</template>

<script lang="ts" setup>
  import { useDisplay } from 'vuetify'
  import AppButton from './AppButton.vue'

  // `gridLabel` and `listLabel` are the accessible names of the two icon buttons (the file manager toolbar); without them the buttons have none, as in legacy.
  defineProps<{
    disabled?: boolean
    gridLabel?: string
    listLabel?: string
  }>()

  // Legacy `listStyle` prop + `update:listStyle` emit (`.sync`).
  const listStyle = defineModel<number>('listStyle')

  const { mobile } = useDisplay()
</script>

<style lang="scss" scoped>
.v-btn {
  width: 36px;
  height: 36px;
  // V2 `tile` icon buttons got a 5px radius from `_buttons`; V4 emits no `--tile` class.
  border-radius: 5px;
  transition: opacity 0.24s ease;
  // V2 icon button: 14px / 21px (`$btn-font-sizes`) and `--v-icon-btn-color`; V4 icon button has 16px / 24px and `--v-text-base`.
  font-size: 14px;
  line-height: 1.5;

  // V2 `.v-btn--icon.v-size--default .v-icon` is a fixed 24px box; V4 sizes `.v-icon` at 1em, i.e. 14px from the font-size above.
  .v-icon {
    width: 24px;
    height: 24px;
    font-size: 24px;

    // The `$grid` icon wraps its inline svg in a `div`; the baseline gap under the svg makes that div taller than the 24px box and the
    // V4 `inline-flex` `.v-icon` centres it, lifting the squares 2px. V2 top-aligned the wrapper.
    :deep(svg) {
      display: block;
    }
  }

  &:not(.text-primary) {
    color: var(--v-icon-btn-color);
  }

  // V2 `.primary--text`
  &.text-primary {
    border-color: rgb(var(--v-theme-primary)) !important;
  }

  &.button-disabled {
    pointer-events: none;
    cursor: default;
    opacity: 0.5;
  }
}
</style>
