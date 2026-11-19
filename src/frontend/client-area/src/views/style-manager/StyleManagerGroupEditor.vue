<template>
  <div class="d-flex flex-column justify-center">
    <StyleManagerEditor
      v-for="(item, index) in selectedColors"
      :key="'color-' + index"
      :color-key="index"
      :color-name="t(`form.option.color.${index}`)"
      :current-color="item"
      @update:current-color="applyChanges"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { BrandColors } from '@/shared/theme/brand-theme'
  // The legacy `colorNames` map
  // (`form.option.color.base|darken1..5|lighten1..5`) is the same key family as `form.option.color.<key>`; the key is built
  // from the colour key. The legacy `<style>` block was empty.
  import { useTranslation } from 'i18next-vue'
  import StyleManagerEditor from './StyleManagerEditor.vue'

  const props = defineProps<{ selectedColors: BrandColors }>()

  const emit = defineEmits<{ 'update:selected-colors': [colors: BrandColors] }>()

  const { t } = useTranslation()

  function applyChanges (data: { index: string, item: string }): void {
    emit('update:selected-colors', { ...props.selectedColors, [data.index]: data.item })
  }
</script>
