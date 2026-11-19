<template>
  <v-menu
    :key="String(mdAndDown)"
    v-model="adminDropdownOpen"
    :close-delay="300"
    content-class="admin-area-menu"
    :content-props="{ 'data-testid': 'shell-admin-menu' }"
    :location="mdAndDown ? 'bottom start' : 'bottom end'"
    :min-width="220"
    :offset="mdAndDown ? [16, 8] : 16"
    :open-on-hover="!mdAndDown"
  >
    <template #activator="{ props: activatorProps }">
      <AppButton
        v-bind="activatorProps"
        class="admin-area-btn ml-2"
        :class="mdAndDown ? 'admin-area-btn-sm' : ''"
        data-testid="shell-admin-activator"
        :href="adminActivatorHref(session.home, mdAndDown)"
        kind="secondary"
        rounded
        size="large"
        target="_blank"
      >
        <v-badge
          color="red"
          dot
          :model-value="hasBadge"
        >
          <v-icon>$settings3</v-icon>
        </v-badge>

        <v-expand-x-transition>
          <!-- The padding sits on the inner span: on the animated box it would stay 8px at `width: 0` and pop in/out in one frame. -->
          <span
            v-show="adminDropdownOpen && !mdAndDown"
            class="admin-area-btn-text"
          ><span class="pl-2 p-sm">{{ t('appSingleServer.adminAreaDropdown.goTo') }}</span></span>
        </v-expand-x-transition>
      </AppButton>
    </template>

    <v-list class="admin-area-dropdown dropdown-left v-list--small">
      <v-list-item
        v-if="mdAndDown"
        class="p-sm"
        data-testid="shell-admin-menu-first-item"
        :href="adminAppUrl(session.home) ?? undefined"
        target="_blank"
      >
        <v-list-item-title>
          {{ t('appSingleServer.adminAreaDropdown.goTo') }}
        </v-list-item-title>
      </v-list-item>

      <v-list-item
        class="admin-area-dropdown-shortcuts"
        :data-testid="mdAndDown ? undefined : 'shell-admin-menu-first-item'"
      >
        <v-list-item-title>
          <span class="p-xs">{{ t('appSingleServer.adminAreaDropdown.shortcuts') }}</span>
        </v-list-item-title>
      </v-list-item>

      <v-list-item
        v-for="item in items"
        :key="item.key"
        class="p-sm"
        :href="adminItemHref(session.home, item)"
        target="_blank"
      >
        <v-badge
          v-if="item.badge"
          color="red"
          dot
          inline
          location="start"
        >
          <v-list-item-title>
            {{ t(item.labelKey) }}
          </v-list-item-title>
        </v-badge>

        <v-list-item-title v-else>
          {{ t(item.labelKey) }}
        </v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { useDisplay } from 'vuetify'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { adminActivatorHref, adminAppUrl, adminHasBadge, adminItemHref, adminMenuItems } from './admin-menu-rules'

  const { t } = useTranslation()
  const session = useSessionStore()
  const { mdAndDown } = useDisplay()

  const adminDropdownOpen = ref(false)
  const hasBadge = computed(() => adminHasBadge(session.home))
  const items = computed(() => adminMenuItems(session.home))
</script>

<style lang="scss" scoped>
// V2 `.v-btn.v-btn--outlined` with sand-darken2 text/border and a 15% sand fill; V2 `!important` wins over the global button layer.
.v-btn.admin-area-btn.admin-area-btn {
  height: 48px;
  min-width: 48px;
  color: var(--v-sand-darken2);
  border-color: var(--v-sand-darken2) !important;
  background-color: var(--v-sand-alpha-15) !important;
  // V2 `.v-btn` transitioned only box-shadow/transform/opacity; V4 also animates color and border, which a screenshot catches mid-way.
  transition-property: box-shadow, transform, opacity;

  &:hover {
    border-color: var(--v-sand-darken2) !important;
  }

  &.admin-area-btn-sm {
    height: 40px;
    min-width: 40px;
    max-width: 40px;
  }

  .admin-area-btn-text {
    color: var(--v-sand-darken2);
    white-space: nowrap;

    // The decelerate curve of V2 (`cubic-bezier(0.25, 0.8, 0.5, 1)`, 0.3s) put most of the width into the first two frames, so the
    // button read as snapping open with no animation. A longer symmetric ease spreads the width over the whole run, and the
    // label fades with it, so it does not show clipped mid-word.
    &.expand-x-transition-enter-active,
    &.expand-x-transition-leave-active {
      transition-duration: 0.4s;
      transition-property: width, opacity;
      transition-timing-function: cubic-bezier(0.45, 0, 0.25, 1);
    }

    &.expand-x-transition-enter-from,
    &.expand-x-transition-leave-to {
      opacity: 0;
    }
  }

  .v-icon {
    color: var(--v-sand-darken2) !important;
    // V2 icon box is the 18px svg; V4 `v-icon` is 1.5em (20.57px) wide.
    font-size: 18px;
    height: 18px;
    min-width: 0;
    width: 18px;
    // V2 badge wrapper is a block holding an inline-flex icon, so the whitespace after it adds one 1.43px letter-spaced glyph to the button width.
    margin-right: 1.43px;
  }

  :deep(.v-icon > svg) {
    width: 18px;
    height: 18px;
  }

  // V4 anchors the dot 6px further left and 6px higher than V2 (see `UserAvatar` for the other offset).
  :deep(.v-badge__badge) {
    border-color: var(--v-red-base) !important; // V2 `red` base (the V4 `red` class is a built-in material colour, not a theme token)
    border-radius: 4.5px;
    color: var(--v-white-base);
    font-weight: 700;
    translate: 6px -6px;
  }
}
</style>

<style lang="scss">
// The menu is teleported out of this component, so its rules cannot be scoped (scope: the `admin-area-menu` content class).
.v-menu > .v-overlay__content.admin-area-menu.admin-area-menu {
  // V2 `.v-menu__content` carried no theme colour, so the content takes the app text colour (see `UserInfoDropdown`).
  color: var(--v-text-base);
  // The connected location strategy writes the activator width into an inline `min-width`, which wins over the prop.
  min-width: 220px !important;

  .v-list-item {
    border-color: currentcolor;
    border-style: none;
    padding-bottom: 0;
    padding-top: 0;
  }

  // V2 palette class `.red` on the dot: border repeats the background, white text, 4.5px radius (as `UserAvatar`).
  .v-badge__badge {
    border-color: var(--v-red-base) !important; // V2 `red` base (the V4 `red` class is a built-in material colour, not a theme token)
    border-radius: 4.5px;
    color: var(--v-white-base);
    // The dot inherits the item's 400 weight in V2; V4 sets 500.
    font-weight: 400;
  }

  // V2 puts the inline `left` dot before the title; V4 inline badges follow the slot.
  .v-badge--inline .v-badge__badge {
    order: -1;
  }

  .admin-area-dropdown-shortcuts {
    min-height: 22px;
    pointer-events: none;

    // V2 `.v-list-item__title` line-height gives a 22px row; V4's 24px title stretched it by 2px.
    .v-list-item-title {
      line-height: 22px;
    }

    span {
      color: var(--v-gray-lighten1);
    }
  }
}
</style>
