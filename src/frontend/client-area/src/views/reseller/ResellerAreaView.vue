<template>
  <page-frame
    testid-prefix="reseller"
    :title="t('heading.navbar.tab.resellerArea')"
  >
    <template #sidebar>
      <ResellerSidebar />
    </template>

    <router-view />
  </page-frame>
</template>

<script lang="ts" setup>
  // UI frame only, no props, provide or data. The frame is the kit pattern `PageFrame`.
  import { useTranslation } from 'i18next-vue'
  import PageFrame from '@/shared/ui/page-frame/PageFrame.vue'
  import ResellerSidebar from './ResellerSidebar.vue'

  const { t } = useTranslation()
</script>
