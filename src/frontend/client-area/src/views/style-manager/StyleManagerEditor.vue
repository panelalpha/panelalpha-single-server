<template>
  <div
    class="color-editor"
    :data-testid="`style-manager-editor-${colorKey}`"
  >
    <p class="mb-0 font-weight-regular mb-2 text--darken2">
      {{ colorName }}
    </p>

    <v-menu
      :close-on-content-click="false"
      location="bottom"
      :offset="8"
    >
      <template #activator="{ props: activatorProps }">
        <AppButton
          v-bind="activatorProps"
          block
          class="text-left justify-start font-weight-regular text--body"
          kind="secondary"
          size="small"
        >
          <div
            class="color-indicator"
            :style="`background-color:${currentColor};`"
          />
          {{ currentColor.toUpperCase() }}
        </AppButton>
      </template>

      <div>
        <!-- V2 `mode="hexa"` with a 7-digit string value hid the alpha channel (`hideAlpha`), so the V4 equivalent is `mode="hex"`. -->
        <v-color-picker
          class="style-picker"
          mode="hex"
          :model-value="currentColor"
          width="220px"
          @update:model-value="changeColor"
        />
      </div>
    </v-menu>
  </div>
</template>

<script lang="ts" setup>
  // `@update:current-color` (legacy `update:currentColor`) keeps the
  // legacy payload `{ index, item }`; `item` is `#RRGGBB` upper-case, as V2 `color.hex` (see `normalizePickedHex`).
  import { onBeforeUnmount } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { normalizePickedHex } from './color-groups'

  const props = defineProps<{
    colorKey: string
    currentColor: string
    colorName?: string
  }>()

  const emit = defineEmits<{ 'update:current-color': [change: { index: string, item: string }] }>()

  // Dragging the picker fires on every mouse move, and each change rebuilds the Vuetify theme and the `--v-primary-*` styles
  // (`theme-sync.ts`). The last color goes out once per frame instead; a pending one is sent on unmount.
  let pending: string | null = null
  let frame: number | null = null

  function flush (): void {
    frame = null
    if (pending !== null) {
      const item = pending
      pending = null
      emit('update:current-color', { index: props.colorKey, item })
    }
  }

  function changeColor (value: string | null): void {
    if (typeof value !== 'string' || value === '') {
      return
    }
    pending = normalizePickedHex(value)
    if (frame === null) {
      frame = requestAnimationFrame(flush)
    }
  }

  onBeforeUnmount(() => {
    if (frame !== null) {
      cancelAnimationFrame(frame)
    }
    flush()
  })
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// V2 `v-color-picker` inside the menu: flat sheet, 28px HEX input with a 1px hairline border and a transparent fill (V4: shadow, 32px, no border).
.style-picker {
  box-shadow: none;

  // V2 spacing above the HEX row (the V4 canvas and sliders end 8px higher).
  :deep(.v-color-picker-edit) {
    padding-top: 8px;
  }

  :deep(.v-color-picker-edit__input input) {
    height: 28px;
    color: rgba(var(--v-theme-on-surface), 0.87);
    background-color: transparent;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }
}

.color-indicator {
  border-radius: 4px;
  width: 24px;
  height: 24px;
  margin-right: 8px;
}

.color-editor {
  &:not(:last-child) {
    .v-btn {
      margin-bottom: 8px;
    }
  }

  .v-btn {
    padding: 0 7px !important;

    :deep(.v-btn__content) {
      color: map.get(v.$text, base);
    }
  }
}

.v-application--is-rtl {
  .color-indicator {
    margin-right: unset;
    margin-left: 8px;
  }
}
</style>
