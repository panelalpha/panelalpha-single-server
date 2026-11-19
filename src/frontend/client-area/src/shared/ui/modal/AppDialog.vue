<template>
  <v-dialog
    :model-value="modelValue"
    :persistent="persistent"
    :transition="transition"
    @after-leave="emit('after-leave')"
    @update:model-value="onUpdate"
  >
    <div
      v-if="overlay"
      class="card-overlay"
      @click="onOverlayClick"
    />

    <slot />
  </v-dialog>
</template>

<script lang="ts" setup>
  // Dialog shell of the kit. One root dialog and no `<style>`: the presets (`ActionModalHost`, `McpTokenModal`) put their
  // own card in the default slot, so the scoped styles and `:deep()` rules of the card keep the `data-v` of the file that writes them.
  // Everything else (`data-testid`, `width`, `scrim`, `close-on-back`, `class`) falls through to the dialog. No i18n, session or API here.
  // `transition` and `persistent` left out give the V4 defaults (the dialog of a preset without them is the plain V4 one).
  // `transition: false`: no transition at all (the onboarding steps of one flow); the V4 dialog gets `false`.
  // `overlay`: the legacy `div.card-overlay` before the card (global style); a click on it closes the dialog unless `persistent`.
  // `scrollLock="mobile"`: the legacy V2 `hideScroll()` under 768px (`useMobileScrollLock`). Read once in `setup`, not reactive.
  // The body lock of a form modal stays in `useActionModal` (`useBodyScrollLock`), not here.
  // `close`: the request to close (Esc, a click on the scrim or on the overlay, so every `update:model-value` with `false`), emitted right after it.
  // A consumer with its own guard (a running save) listens to `close` instead of the value and decides; `persistent` suppresses both on a click outside.
  import { toRef } from 'vue'
  import { useMobileScrollLock } from '@/shared/ui/modal/mobile-scroll-lock'

  const props = withDefaults(defineProps<{
    modelValue: boolean
    persistent?: boolean
    overlay?: boolean
    transition?: string | false
    scrollLock?: 'none' | 'mobile'
  }>(), {
    persistent: false,
    overlay: false,
    transition: undefined,
    scrollLock: 'none',
  })

  const emit = defineEmits<{
    'update:model-value': [value: boolean]
    'after-leave': []
    'close': []
  }>()

  function onUpdate (value: boolean): void {
    emit('update:model-value', value)
    if (!value) {
      emit('close')
    }
  }

  function onOverlayClick (): void {
    if (!props.persistent) {
      onUpdate(false)
    }
  }

  if (props.scrollLock === 'mobile') {
    useMobileScrollLock(toRef(props, 'modelValue'))
  }
</script>
