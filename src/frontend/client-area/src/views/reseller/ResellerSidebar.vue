<template>
  <pages-sidebar
    data-testid="reseller-sidebar"
    :groups="groups"
    tabs-testid="reseller-tabs"
    testid-prefix="reseller"
  />
</template>

<script lang="ts" setup>
  // Five unconditional items, no plan selector or groups. The kit pattern `PagesSidebar` renders the list, the tabs and the look.
  import type { PagesSidebarGroup } from '@/shared/ui/sidebar/pages-sidebar'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import PagesSidebar from '@/shared/ui/sidebar/PagesSidebar.vue'
  import { RESELLER_SIDEBAR_ITEMS } from './reseller-sidebar-items'

  const { t } = useTranslation()

  const groups = computed<PagesSidebarGroup[]>(() => [{
    key: 'reseller',
    items: RESELLER_SIDEBAR_ITEMS.map(item => ({ key: item.key, title: t(item.titleKey), to: item.to })),
  }])
</script>
