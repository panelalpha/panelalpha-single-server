<template>
  <v-menu
    :close-delay="0"
    content-class="v-tooltip menu-tooltip"
    location="top start"
    :min-width="110"
    :model-value="tooltipOpen"
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
      <div @click="handleClick">
        <AppButton
          v-bind="{ ...activatorProps, ...$attrs }"
          :aria-label="ariaLabel"
          class="copyButton ml-2"
          :color="color"
          kind="icon"
          @mouseleave="reset"
        >
          <v-icon
            :color="color"
            icon="$copy"
            :size="size"
          />
        </AppButton>
      </div>
    </template>

    <div class="px-2 py-2 text-center">
      {{ copyText }}
    </div>
  </v-menu>
</template>

<script lang="ts" setup>
  // The button is `AppButton` `kind="icon"`.
  import { useTranslation } from 'i18next-vue'
  import { computed, onUnmounted, ref, useAttrs } from 'vue'
  import AppButton from './AppButton.vue'
  import { useCopyText } from './use-copy-text'

  // Fallthrough attrs (e.g. `data-testid`) belong on the button, not on the `v-menu` root.
  defineOptions({ inheritAttrs: false })

  const props = withDefaults(defineProps<{
    text?: string
    color?: string
    size?: number | string
  }>(), {
    text: undefined,
    color: 'info',
    size: '16',
  })

  const { t } = useTranslation()
  const attrs = useAttrs()
  const { state, copy, reset, dispose } = useCopyText(() => props.text)
  // One-way as in legacy (`:value`): a click opens, nothing sets it closed.
  const tooltipOpen = ref(false)
  const copyText = computed(() => t(state.value === 'copied' ? 'tooltip.copied' : 'tooltip.copy'))
  // The button shows only an icon: it takes `button.copy` unless the caller names what it copies (e.g. `button.copyUrl`).
  const ariaLabel = computed(() => (attrs['aria-label'] as string | undefined) ?? t('button.copy'))

  function handleClick (): void {
    tooltipOpen.value = true
    void copy()
  }

  onUnmounted(dispose)
</script>
