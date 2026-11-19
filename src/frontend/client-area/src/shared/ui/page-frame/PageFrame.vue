<template>
  <div
    class="page-frame"
    :class="{ 'page-frame--highlight-rows': highlightRows }"
  >
    <div class="px-6">
      <v-container
        class="page-frame__head-container px-0 pt-3"
        :class="tabs.length > 0 ? 'pb-0' : 'pb-3'"
      >
        <div
          class="page-frame__head d-flex justify-space-between"
          :class="[
            lgAndDown ? 'mt-3 mb-3' : 'mt-7 mb-7',
            isStacked() ? 'flex-column' : 'flex-row align-center',
          ]"
        >
          <div class="w-100 d-flex align-center justify-space-between top-title">
            <h1
              class="font-weight-800"
              :data-testid="`${testidPrefix}-title`"
            >
              {{ title }}
            </h1>
          </div>

          <div
            v-if="$slots.filters"
            class="page-frame__filters page-title__filter-controls align-center"
            :class="isStacked() ? 'mt-3' : ''"
          >
            <slot name="filters" />
          </div>
        </div>

        <v-tabs
          v-if="tabs.length > 0"
          v-model="tab"
          :aria-label="tabsLabel"
          center-active
          class="v-tabs--page"
          :data-testid="`${testidPrefix}-tabs`"
          next-icon="$chevronright"
          prev-icon="$chevronleft"
          @vue:mounted="centerActiveTabOnMount"
        >
          <v-tab
            v-for="item in tabs"
            :key="item.value"
            class="p-1 font-weight-600 top-bar__item"
            :data-testid="item.testid"
            :ripple="false"
            :value="item.value"
          >
            {{ item.title }}
          </v-tab>
        </v-tabs>
      </v-container>
    </div>

    <v-divider :class="lgAndDown ? 'mb-3' : 'mb-10'" />

    <div class="px-6">
      <slot
        v-if="$slots.empty"
        name="empty"
      />

      <v-container
        v-else
        class="page-frame__body px-0 py-3"
        :data-testid="bodyTestid"
      >
        <v-row
          v-if="$slots.sidebar"
          align="stretch"
          class="mx-0 flex-lg-row flex-column"
          :class="mobile ? 'mobile-container' : ''"
          no-gutters
        >
          <slot name="sidebar" />

          <v-col
            :class="lgAndDown || sidebarEmpty ? '' : 'pl-12'"
            cols="12"
            :lg="sidebarEmpty ? 12 : 10"
          >
            <slot />
          </v-col>
        </v-row>

        <slot v-else />
      </v-container>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // Kit pattern of the page frame: the h1 title row (`top-title`), the optional filters beside it and the
  // optional page tab strip, the divider, and the body: a sidebar column with the content column (`lg=10`, `pl-12` from 1200px), a
  // plain body, or a whole-page empty state. One look for Reseller Area, Connect AI, My server, Billing, Services, My Account and
  // Settings; props and slots only for functions.
  import type { PageFrameTab } from './page-frame'
  import { useSlots } from 'vue'
  import { useDisplay } from 'vuetify'
  import { centerActiveTabOnMount } from '@/shared/ui/tabs/center-active-tab'
  import { isHeadStacked } from './page-frame'

  withDefaults(defineProps<{
    /** Already translated page title (the h1). */
    title: string
    /** Test id prefix: `<prefix>-title` on the h1, `<prefix>-tabs` on the tab strip. */
    testidPrefix: string
    /** The page tab strip (My Account, Settings); empty: no strip. */
    tabs?: PageFrameTab[]
    /** Accessible name of the tab strip (`aria-label`); none when not given. */
    tabsLabel?: string
    /** Test id of the body container (My server `hosting-server-usage-only`, Billing `billing-content`). */
    bodyTestid?: string
    /** The added row fades out over 10s (`tr.highlight` in the global page title styles, the hosting pages). */
    highlightRows?: boolean
    /** The `sidebar` slot is passed but renders nothing: the row and column stay (so the routed page is not remounted when the sidebar arrives) and the content takes the full width. */
    sidebarEmpty?: boolean
  }>(), {
    tabs: () => [],
    tabsLabel: undefined,
    bodyTestid: undefined,
    highlightRows: false,
    sidebarEmpty: false,
  })

  const tab = defineModel<number>('tab', { default: 0 })

  const slots = useSlots()
  const { lgAndDown, mdAndDown, mobile, xs } = useDisplay()

  // A function, not a computed: `slots` is not reactive, and a page may pass the filters slot after the first render (the hosting admin button).
  function isStacked (): boolean {
    return isHeadStacked({ xs: xs.value, mdAndDown: mdAndDown.value }, Boolean(slots.filters))
  }
</script>

<style lang="scss" scoped>
// Legacy hosting `.top-title { height: 46px }` (hosting and reseller frames; Connect AI repeated it): one height for
// every frame (Billing and Services had `auto`, 48px). The h1 margin comes from the global reset.
.top-title {
  height: 46px;
}

// Section title row of a tab page (My Account `account-tab-header`, Settings `settings-tab-title`): one height, at least 48px (the row
// shares its line with the devices search). Slot content, so it is reached with `:deep` from the body the frame renders.
.page-frame__body :deep(.page-frame__section-title) {
  min-height: 48px;
}
</style>
