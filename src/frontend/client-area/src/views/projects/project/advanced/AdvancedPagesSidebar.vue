<template>
  <pages-sidebar
    class="advanced-sidebar"
    data-testid="advanced-sidebar"
    :groups="groups"
    testid-prefix="advanced"
  />
</template>

<script lang="ts" setup>
  import type { PagesSidebarGroup } from '@/shared/ui/sidebar/pages-sidebar'
  // The list is built by `advancedSidebarItems`; the kit
  // pattern `PagesSidebar` renders the list (from 1200 px), the tabs below it and the one look of the page sidebars.
  // This component only picks the resource base from the route and builds the items.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useRoute } from 'vue-router'
  import { useSessionStore } from '@/shared/session/session.store'
  import PagesSidebar from '@/shared/ui/sidebar/PagesSidebar.vue'
  import { resourceBaseFor } from './advanced-resource-base'
  import { advancedSidebarItems } from './advanced-sidebar-items'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const route = useRoute()
  const session = useSessionStore()

  const resourceBase = computed(() => resourceBaseFor(route.path))
  const singleServer = computed(() => session.home?.app?.single_server?.active === true)
  const groups = computed<PagesSidebarGroup[]>(() => [{
    key: 'advanced',
    items: advancedSidebarItems(props.instance, resourceBase.value, singleServer.value)
      .map(item => ({ key: item.key, title: t(item.titleKey), to: item.to })),
  }])
</script>
