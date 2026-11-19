<template>
  <v-col
    class="sticky-sidebar"
    cols="12"
    lg="2"
  >
    <template v-if="!lgAndDown">
      <v-list
        class="pt-0 sticky-sidebar__item"
        :class="{ 'sticky-sidebar__item--narrow': width < 1400 }"
        v-bind="listAttrs"
      >
        <slot name="list-before" />

        <template
          v-for="(group, index) in shownGroups"
          :key="group.key"
        >
          <v-list-subheader
            v-if="group.title"
            :class="subheaderClass(index, !!$slots['list-before'])"
          >
            {{ group.title }}
          </v-list-subheader>

          <div class="pages-sidebar__group d-flex flex-row flex-lg-column justify-start">
            <v-list-item
              v-for="item in group.items"
              :key="item.key"
              :data-testid="`${testidPrefix}-sidebar-${item.key}`"
              :ripple="false"
              v-bind="itemProps(item)"
            >
              <v-list-item-title class="p-2">
                {{ item.title }}

                <div
                  v-if="item.dot"
                  class="select-dot"
                  :data-testid="`${testidPrefix}-sidebar-${item.dot}-dot`"
                />
              </v-list-item-title>
            </v-list-item>
          </div>
        </template>
      </v-list>
    </template>

    <template v-else>
      <slot name="tabs-before" />

      <v-tabs
        center-active
        class="pt-0 d-flex flex-row flex-lg-column justify-start"
        :class="{ 'mt-4': mobile }"
        hide-slider
        v-bind="tabsAttrs"
        @vue:mounted="centerActiveTabOnMount"
      >
        <v-tab
          v-for="item in tabItems"
          :key="item.key"
          :data-testid="`${testidPrefix}-tab-${item.key}`"
          :ripple="false"
          selected-class="v-tab--selected elevation-2"
          v-bind="tabProps(item)"
        >
          <span class="p-2">{{ item.title }}</span>

          <div
            v-if="item.dot"
            class="select-dot"
            :data-testid="`${testidPrefix}-tab-${item.dot}-dot`"
          />
        </v-tab>
      </v-tabs>
    </template>
  </v-col>
</template>

<script lang="ts" setup>
  // The page sidebar: the sticky column, the list from 1200 px (`!lgAndDown`) and the tab strip below it. The screens pass the items in
  // `groups` (`pages-sidebar.ts`) and may fill `list-before` / `tabs-before` (the hosting plan selector). An item with `to` is a route link;
  // an item without `to` is selected by `active` and emits `select`. The attributes of the column (`class`, `data-testid`) go to the
  // component itself.
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import { centerActiveTabOnMount } from '@/shared/ui/tabs/center-active-tab'
  import { activeTabKey, flatItems, type PagesSidebarGroup, type PagesSidebarItem, subheaderClass, visibleGroups } from './pages-sidebar'

  const props = withDefaults(defineProps<{
    groups: PagesSidebarGroup[]
    testidPrefix: string
    listTestid?: string
    tabsTestid?: string
    /** V4 `v-tabs` `mandatory`; `'force'` is the V4 default (selects the first tab when the route has none). */
    tabsMandatory?: boolean | 'force'
  }>(), {
    tabsMandatory: 'force',
  })

  const emit = defineEmits<{
    select: [key: string]
  }>()

  const { lgAndDown, mobile, width } = useDisplay()

  const shownGroups = computed(() => visibleGroups(props.groups))
  const tabItems = computed(() => flatItems(props.groups))
  const listAttrs = computed(() => (props.listTestid ? { 'data-testid': props.listTestid } : {}))
  const tabsAttrs = computed(() => {
    const attrs: Record<string, unknown> = { mandatory: props.tabsMandatory }
    if (props.tabsTestid) {
      attrs['data-testid'] = props.tabsTestid
    }
    const key = activeTabKey(tabItems.value)
    if (key !== undefined) {
      attrs.modelValue = key
    }
    return attrs
  })

  function itemProps (item: PagesSidebarItem): Record<string, unknown> {
    return item.to === undefined
      ? { active: item.active === true, onClick: () => emit('select', item.key) }
      : { to: item.to }
  }

  function tabProps (item: PagesSidebarItem): Record<string, unknown> {
    return item.to === undefined
      ? { value: item.key, onClick: () => emit('select', item.key) }
      : { to: item.to }
  }
</script>

<style lang="scss" scoped>
// The page sidebar of the kit, one look for every user: Advanced, hosting, Reseller and Connect AI. Port of the legacy hosting pages
// sidebar sheet (one sheet for three legacy sidebars) for the V4 DOM. The rules that only the hosting column had and the local rules
// of the other users were moved here (one look; parity skipped by the user's decision of 2026-11-03).
// Rules on items, subheaders and tabs keep `:deep()`: valid for the items the kit renders and for slot content.
// `.v-subheader` is `.v-list-subheader`, the V2 item `::before` layer is `.v-list-item__overlay`, `.v-list-item__title` is
// `.v-list-item-title`, `.v-tabs-slider-wrapper` is `.v-tab__slider`, `.v-tab--active` is `.v-tab--selected`.
// Dropped as no-ops in V2: `.v-item-group { margin-bottom }` and `map-get($text, header|heading)`.
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

:deep(.v-list-subheader) {
  align-content: flex-start;
  height: 30px;
  min-height: 30px;
  color: var(--v-gray-lighten1);
}

.v-list {
  // V2 `.v-list` has no overflow clip; V4 sets `overflow: auto`, which cuts the active item's elevation shadow at the list edge.
  overflow: visible;

  :deep(.v-list-item) {
    // V2 items have no border (V4 paints `solid` + width 0) and no vertical padding (V4 4px).
    border: none;
    padding-top: 0;
    padding-bottom: 0;
    padding-left: 0px;
    transition: padding-left 0.3s ease;

    .v-list-item__content {
      position: relative;
      z-index: 1;
    }

    // V2 `.v-list-item__title` line-height is 1.2; V4's `.v-list-item-title` is 1.5.
    .v-list-item-title {
      line-height: 1.2;
      font-weight: v.$font-weight-semibold;
      transition: color 0.24s ease, font-weight 0.24s ease;
    }

    // V2 `::before`: a white layer under the title, faded in by the active item (the elevation comes with it).
    .v-list-item__overlay {
      z-index: 0;
      background: var(--v-white-base);
      opacity: 0;
      transition: opacity 0.3s ease;
    }
  }

  :deep(.v-list-item:hover) {
    padding-left: 12px;

    .v-list-item-title {
      color: map.get(v.$primary, base);
    }
  }

  // Legacy `::before` of a hovered inactive item stays at opacity 0; V4 fades `.v-list-item__overlay` to the hover opacity.
  // Was a local rule of Connect AI.
  :deep(.v-list-item:not(.v-list-item--active):hover .v-list-item__overlay) {
    opacity: 0;
  }

  :deep(.v-list-item.v-list-item--active) {
    padding-left: 12px;
    // `!important`: V4 puts the utility class `rounded-0` on the item and the global utilities give it `border-radius: 0 !important`.
    // Was the Advanced sidebar sheet; before, the other users set the `rounded` prop on the current item, now this rule is the only one.
    border-radius: 4px !important;
    // V2 `v-list-item-group color="primary"` puts `primary--text` on the active item.
    color: var(--v-primary-base);

    .v-list-item-title {
      font-weight: v.$font-weight-bold;
      color: map.get(v.$primary, darken1);
    }

    .v-list-item__overlay {
      border-radius: 4px;
      // Legacy `&::before` opacity, 1:1. The shadow is V4-only: legacy has no shadow on the
      // overlay; `!important` keeps the token over the V4 overlay defaults.
      opacity: 1 !important;
      box-shadow: v.$box-shadow-elevation-4 !important;
    }
  }

  @media (max-width: map.get(v.$grid-breakpoints, md)) {
    :deep(.v-list-item) {
      // Same as legacy (1:1): beat the V4 `.v-list-item` padding and min-width.
      padding: 0 12px 0 12px !important;
      text-align: center;
      min-width: unset !important;
    }
  }
}

.sticky-sidebar {
  position: relative;
}

.sticky-sidebar__item {
  position: sticky;
  padding-left: 0px !important;
  top: 120px;
  left: 0;
  background-color: var(--v-body-base);

  // The plan selector of the hosting sidebar (`.v-select`). Its own sheet paints the open menu mint (`.v-select--active-menu`, specificity
  // 0,3,0), and legacy keeps the panel colour; `.v-list` makes the win independent of the chunk order.
  &.v-list :deep(.v-input) {
    background-color: var(--v-panel-base);
  }
}

// The desktop list below 1400 px: legacy inline `max-width: 163px` of the hosting, Reseller and Connect AI lists. The component toggles the class.
.sticky-sidebar__item--narrow {
  max-width: 163px;
}

.v-tabs {
  // Legacy inline `padding: 8px 8px !important` of the hosting, Reseller and Connect AI strips. `!important`: `pt-0` on the same root is too.
  padding: 8px !important;
  // V2 sizes by content (48px bar + 8px padding each side), V4 by border box (the page would overflow by 16px with `content-box`).
  height: 64px;
  margin: 0 -24px;
  overflow: hidden !important;
  width: 100vw;
  background-color: transparent;

  @media (min-width: map.get(v.$grid-breakpoints, lg)) {
    margin: 0 -16px;
  }

  // The component adds `mt-4` on mobile; the strip keeps 16px below it too.
  &.mt-4 {
    margin-bottom: 16px;
  }

  :deep(.v-slide-group) {
    background-color: transparent;
  }

  // V2 scrolled the strip by a transform on `__content` inside a visible `__wrapper`; V4 scrolls the container itself (`scrollLeft`), so a
  // visible overflow would leave `center-active` with nothing to scroll. The root clips the strip either way.
  :deep(.v-slide-group__container) {
    // Same as legacy (1:1), except `overflow: hidden` where legacy says `visible`: decision of 2026-10-09.
    contain: none !important;
    overflow: hidden !important;
    max-width: 100%;
    // `hidden` clips the selected tab's shadow at the tab edge; 8px of room (the `.v-tabs` root clips at its own 8px padding), layout kept.
    padding-block: 8px;
    margin-block: -8px;
  }

  :deep(.v-tab__slider) {
    display: none;
  }

  :deep(.v-tab) {
    position: relative;
    // Plain, not `!important`: V4 `VTab.css` sets `.v-tab` to 90px and this `.v-tabs[data-v] .v-tab` selector has higher specificity.
    min-width: unset;
    overflow: visible !important;
    // `!important`: the global `_tabs.scss` zeroes the side padding of every `.v-tab` (V2 kept 16px on these tabs).
    padding-left: 16px !important;
    padding-right: 16px !important;
    border-radius: 4px;
    box-shadow: none;
    transition: opacity 0.3s ease;
    margin-left: 4px;
    margin-right: 4px;
    background: transparent;
    // V2 `.v-tab` has no border style, so its colour is the text colour; V4 paints the UA black (`border-style` stays `solid`, width 0).
    border-color: currentcolor;

    span {
      font-size: v.$font-size-base;
      line-height: v.$line-height-base;
      font-weight: v.$font-weight-semibold;
    }

    // The empty dot inherits the V2 tab typography (18px / 26px / 500); V4's tab is 16px / 600.
    .select-dot {
      font-size: v.$font-size-lg;
      line-height: v.$line-height-lg;
      font-weight: v.$font-weight-medium;
    }

    &:not(:first-child) {
      margin-left: 0 !important;
    }

    // Measured on the legacy host: the first tab sits on the strip padding (the 4px side margin did not apply there).
    &:first-child {
      margin-left: 0;
    }

    // The active tab is a white elevated pill: legacy gives `v-tab--active elevation-2` and its scoped style
    // `.v-tab--active { background: #fff }` (gitlab #35). The `elevation-2` class comes from `selected-class` in the template, so the global
    // elevation rule (and its `disable-shadow` ring) paints the shadow. The surface is `--v-panel-base`: white in light, the card surface in
    // dark (legacy has the `#fff` literal in dark too, which is a white pill with green text on a dark page).
    &.v-tab--selected {
      background: var(--v-panel-base);
      color: var(--v-primary-darken1);
      border-color: var(--v-primary-darken1);

      span {
        color: map.get(v.$primary, darken1);
        font-weight: v.$font-weight-bold;
      }
    }

    // State layer (was the hosting strip only). V2 `.v-tab::before` took the tab font, had no radius, hovered at 0.12 and focused at 0.16,
    // and the hovered selected tab turned `primary-base`. V4 `.v-btn__overlay` has its own font, the 4px radius, hover 0.08 and focus 0.24.
    &.v-tab--selected:hover {
      color: var(--v-primary-base);

      // The overlay keeps the selected colour through the 0.3s colour transition of the tab; legacy `::before` already had the hover colour.
      .v-btn__overlay {
        color: var(--v-primary-base);
      }
    }

    .v-btn__overlay {
      font: inherit;
      border-radius: 0;
    }

    &:hover > .v-btn__overlay {
      opacity: 0.12;
    }

    &:focus-visible > .v-btn__overlay {
      opacity: 0.16;
    }
  }
}

[dir='rtl'] {
  .v-list {
    :deep(.v-list-item) {
      padding-right: 0px;
      transition: padding-right 0.3s ease;
    }

    :deep(.v-list-item:hover) {
      padding-right: 12px;
    }

    :deep(.v-list-item.v-list-item--active) {
      padding-right: 12px;
    }
  }
}

:deep(.select-dot) {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 8px;
  margin-left: 8px;
  margin-bottom: 1px;
  // Inherited from V2's 1.2 line height of `.v-list-item__title` (19.2px at 16px); the tab rule above sets its own.
  line-height: 19.2px;
  background: var(--v-error-base);
}
</style>
