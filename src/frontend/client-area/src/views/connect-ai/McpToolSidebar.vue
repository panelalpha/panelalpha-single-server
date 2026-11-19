<template>
  <pages-sidebar
    :groups="groups"
    list-testid="connect-ai-sidebar"
    tabs-testid="connect-ai-tabs"
    testid-prefix="connect-ai"
    @select="onSelect"
  />
</template>

<script lang="ts" setup>
  // "Your tool" and "Manage" are shown as a list from 1200 px, and as one flat tab strip below
  // it. The items have no route: `active` marks the current view and a click emits `select`. The kit pattern `PagesSidebar` renders the
  // list, the tabs and the look.
  import type { PagesSidebarGroup } from '@/shared/ui/sidebar/pages-sidebar'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import PagesSidebar from '@/shared/ui/sidebar/PagesSidebar.vue'
  import { manageNavItems, toolNavItems, type Translate, type ViewKey } from './connect-ai-tools'

  const props = defineProps<{ activeView: ViewKey }>()
  const emit = defineEmits<{ select: [key: ViewKey] }>()

  const { t } = useTranslation()

  const translate: Translate = key => t(key)
  const groups = computed<PagesSidebarGroup[]>(() => [
    {
      key: 'tools',
      title: t('heading.connectAi.tool.yourTool'),
      items: toolNavItems(translate).map(item => ({ key: item.key, title: item.label, active: item.key === props.activeView })),
    },
    {
      key: 'manage',
      title: t('heading.connectAi.section.manage'),
      items: manageNavItems(translate).map(item => ({ key: item.key, title: item.label, active: item.key === props.activeView })),
    },
  ])

  // The pattern emits the key of an item it got from `groups`, so it is a `ViewKey`.
  function onSelect (key: string): void {
    emit('select', key as ViewKey)
  }
</script>
