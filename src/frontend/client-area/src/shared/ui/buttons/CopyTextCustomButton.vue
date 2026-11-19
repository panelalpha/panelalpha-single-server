<template>
  <v-menu
    v-model="tooltipOpen"
    :close-delay="0"
    content-class="menu-tooltip copy-text-menu"
    location="top start"
    :min-width="110"
    :offset="[-32, 32]"
    :open-delay="150"
    :open-on-click="false"
    :open-on-focus="false"
    :open-on-hover="true"
    origin="top start"
    transition="custom-tooltip"
    :z-index="9999"
  >
    <template #activator="{ props: activatorProps }">
      <div
        v-bind="activatorProps"
        @click="handleClick"
        @mouseleave="handleLeave"
      >
        <slot />
      </div>
    </template>

    <div class="px-2 py-2 text-center">
      {{ copyText }}
    </div>
  </v-menu>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed, onUnmounted, ref } from 'vue'
  import { useCopyText } from './use-copy-text'

  const props = defineProps<{
    text?: string
  }>()

  const { t } = useTranslation()
  const { state, copy, reset, dispose } = useCopyText(() => props.text)
  const tooltipOpen = ref(false)
  const copyText = computed(() => t(state.value === 'copied' ? 'tooltip.copied' : 'tooltip.copy'))

  function handleLeave (): void {
    tooltipOpen.value = false
    reset()
  }

  function handleClick (): void {
    tooltipOpen.value = true
    void copy()
  }

  onUnmounted(dispose)
</script>

<style lang="scss">
// The menu is teleported, so its rule is unscoped under the content class. The connected strategy writes the activator width
// inline and ignores `min-width`; legacy `min-width="110px"` held the tooltip at 110px (`instances-preview-copied`).
.v-menu > .v-overlay__content.copy-text-menu.copy-text-menu {
  min-width: 110px !important;
}
</style>
