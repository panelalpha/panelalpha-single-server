<template>
  <v-tabs
    center-active
    class="navbar-tabs"
    :class="detailsPage ? 'tabs-none-active' : ''"
    height="48"
    :mandatory="activeKey !== null"
    :model-value="activeKey"
    next-icon="$chevronright"
    prev-icon="$chevronleft"
    @vue:mounted="centerActiveTabOnMount"
  >
    <v-tab
      v-for="tab in tabs"
      :key="tab.key"
      class="p-1 font-weight-600 top-bar__item"
      :class="tab.gradient ? 'connect-ai-tab' : ''"
      :data-testid="`shell-tab-${tab.key}`"
      :exact="tab.exact"
      :ripple="false"
      :to="tab.route"
      :value="tab.key"
    >
      <span
        v-if="tab.gradient"
        class="connect-ai-label"
      >{{ t(tab.labelKey) }}</span>

      <template v-else>
        {{ t(tab.labelKey) }}
      </template>
    </v-tab>
  </v-tabs>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useRoute } from 'vue-router'
  import { isSingleServer } from '@/shared/session/home-access'
  import { useSessionStore } from '@/shared/session/session.store'
  import { centerActiveTabOnMount } from '@/shared/ui/tabs/center-active-tab'
  import { activeTabKey, isInstanceDetails, navTabs } from './navbar-rules'

  const { t } = useTranslation()
  const route = useRoute()
  const session = useSessionStore()

  const tabs = computed(() => navTabs(session.home))
  const activeKey = computed(() => activeTabKey(route.path, tabs.value))
  const detailsPage = computed(() => isInstanceDetails(route.path, route.name, isSingleServer(session.home)))
</script>

<style lang="scss" scoped src="./NavbarTopNavigation.scss"></style>

<style scoped>
/* App-lite Connect AI tab. */
.connect-ai-label {
  background: var(--v-connect-ai-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 700;
}
</style>
