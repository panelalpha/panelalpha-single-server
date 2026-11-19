<template>
  <pages-sidebar
    class="hosting-sidebar"
    data-testid="hosting-sidebar"
    :groups="groups"
    :tabs-mandatory="hasCurrentTab"
    tabs-testid="hosting-tabs"
    testid-prefix="hosting"
  >
    <template #list-before>
      <ActiveHostingPlanSelector
        class="mb-6"
        :items="services"
        :model-value="activeService"
        @update:model-value="changeService"
      />
    </template>

    <template #tabs-before>
      <ActiveHostingPlanSelector
        class="mt-2"
        :items="services"
        :model-value="activeService"
        @update:model-value="changeService"
      />
    </template>
  </pages-sidebar>
</template>

<script lang="ts" setup>
  // App-lite variant: single-server shows Usage first, then the DNS and e-mail items. The kit pattern
  // `PagesSidebar` renders the list (Manage, then Email), the tabs (the same items in order) and the look.
  import type { SidebarItem } from './hosting-sidebar-items'
  import type { HostingService } from './hosting.types'
  import type { PagesSidebarGroup, PagesSidebarItem } from '@/shared/ui/sidebar/pages-sidebar'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useRoute } from 'vue-router'
  import { isSingleServer } from '@/shared/session/home-access'
  import { useSessionStore } from '@/shared/session/session.store'
  import PagesSidebar from '@/shared/ui/sidebar/PagesSidebar.vue'
  import ActiveHostingPlanSelector from './ActiveHostingPlanSelector.vue'
  import { hasTabForPath, sidebarItems } from './hosting-sidebar-items'
  import { useHostingStore } from './hosting.store'

  const props = defineProps<{
    services: HostingService[]
    /** The frame renders the sidebar only with a selected service (single-server without a service has no sidebar). */
    activeService: HostingService
  }>()

  const emit = defineEmits<{
    'update:active-service': [service: HostingService]
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()
  const hosting = useHostingStore()
  const route = useRoute()

  const items = computed<SidebarItem[]>(() => sidebarItems(props.activeService, {
    singleServer: isSingleServer(session.home),
    emailRecordsDot: hosting.showEmailRecordConfiguration && !hosting.isEmailRecordsConfigured,
  }))
  // V4 `mandatory` picks the first tab when none is selected, so it is on only where the route has its own tab.
  const hasCurrentTab = computed(() => hasTabForPath(items.value, route.path))
  // The pattern drops the Email group when it has no items. The Manage items come first in `items`, so the tabs keep their order.
  const groups = computed<PagesSidebarGroup[]>(() => [
    { key: 'manage', title: t('heading.hosting.sidebar.manage.title'), items: items.value.filter(item => item.group !== 'email').map(item => toPagesItem(item)) },
    { key: 'email', title: t('heading.hosting.sidebar.email.title'), items: items.value.filter(item => item.group === 'email').map(item => toPagesItem(item)) },
  ])

  function toPagesItem (item: SidebarItem): PagesSidebarItem {
    return { key: item.key, title: t(item.titleKey), to: item.to, ...(item.showDot ? { dot: 'email' } : {}) }
  }

  function changeService (service: HostingService): void {
    emit('update:active-service', service)
  }
</script>
