<template>
  <span class="d-flex align-center p-4 font-weight-600 cursor-pointer text-info preview-btn">
    <span @click="opened = true">{{ t('button.previewSite') }}</span>

    <preview-site-modal
      v-model="opened"
      :instance="instance"
    />

    <v-icon
      icon="$arrowRightUp"
      size="12"
    />
  </span>
</template>

<script lang="ts" setup>
  // The button owns the modal and passes it
  // the instance, as legacy does.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { ref } from 'vue'
  import PreviewSiteModal from '@/entities/project/ui/PreviewSiteModal.vue'

  defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const opened = ref(false)
</script>

<style scoped lang="scss">
.preview-btn {
  width: 100%;
  column-gap: 2px;
  transition: 0.2s ease;
  cursor: pointer;

  &:hover {
    // !important is kept: it beats the `text-info` utility, which is !important.
    color: var(--v-preview-link-hover) !important;
  }
}
</style>
