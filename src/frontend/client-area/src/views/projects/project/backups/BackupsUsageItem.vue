<template>
  <div
    class="custom-info-label text-info mr-2"
    data-testid="backups-usage-item"
  >
    <template v-if="isUnlimited">
      <v-icon
        class="text-info"
        icon="$infiniteIcon"
        size="12"
      />

      <span class="ml-1">{{ t('heading.instance.backups.usage.unlimited') }}</span>
    </template>

    <template v-else>
      {{ displayText }}
    </template>

    <v-tooltip
      location="bottom"
      open-delay="150"
      transition="custom-tooltip"
    >
      <template #activator="{ props: activatorProps }">
        <v-icon
          class="ml-1 text-info"
          icon="$infoCircle"
          size="12"
          v-bind="activatorProps"
        />
      </template>

      {{ tooltipText }}
    </v-tooltip>
  </div>
</template>

<script lang="ts" setup>
  // The `suffix` and `suffix_one` variants of the
  // total and the max are told apart with `i18next.exists`, as legacy does (app-lite ships `suffix_one` and `suffix_other`).
  import type { UsageChip } from './backups-usage'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'

  const props = defineProps<{
    item: UsageChip
  }>()

  const { t, i18next } = useTranslation()

  const isUnlimited = computed(() => props.item.data.max === null || props.item.data.max === undefined)

  function keyOf (path: 'total' | 'max'): string {
    return `heading.instance.backups.usage.${props.item.name}.${path}`
  }

  function withSuffix (path: 'total' | 'max', value: number | string): string {
    if (i18next.exists(`${keyOf(path)}.suffix`)) {
      return `${value} ${i18next.t(`${keyOf(path)}.suffix`)}`
    }
    if (i18next.exists(`${keyOf(path)}.suffix_one`)) {
      return `${value} ${i18next.t(`${keyOf(path)}.suffix`, { count: Number(value) })}`
    }
    return String(value)
  }

  const totalText = computed(() => withSuffix('total', props.item.data.total))
  const maxText = computed(() => withSuffix('max', props.item.data.max ?? ''))

  const displayText = computed(() => `${totalText.value} / ${maxText.value}`)

  const tooltipText = computed(() => {
    if (isUnlimited.value) {
      return t('heading.instance.backups.usage.unlimited.tooltip')
    }
    return t(`heading.instance.backups.usage.${props.item.name}.tooltip`)
  })
</script>
