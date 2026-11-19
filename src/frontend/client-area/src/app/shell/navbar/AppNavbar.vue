<template>
  <v-app-bar
    class="app-bar"
    data-testid="shell-app-bar"
    elevation="2"
    :height="height"
  >
    <v-container class="px-1">
      <div class="d-flex justify-space-between align-center">
        <v-toolbar-title class="d-flex align-center">
          <router-link
            :aria-label="t(labels.name)"
            class="logo-link"
            data-testid="shell-logo"
            to="/"
          >
            <v-img
              :height="mobile ? 36 : 44"
              :position="isRtl ? 'center right' : 'center left'"
              :src="logo"
              :width="mobile ? 171 : 200"
            />
          </router-link>

          <NavbarTopNavigation
            v-if="tabsPlacement(smAndDown) === 'inline'"
            class="ml-11"
          />
        </v-toolbar-title>

        <div
          v-if="loggedIn"
          class="navbar__menu-items"
        >
          <AddNewInstanceButton v-if="showAddNewButton(mobile)" />

          <NotificationsDropdown />

          <UserInfoDropdown />

          <AdminAreaDropdown v-if="showAdminArea" />
        </div>
      </div>

      <div
        v-if="tabsPlacement(smAndDown) === 'second-row'"
        class="navbar-tabs-row d-flex justify-space-between align-center"
      >
        <NavbarTopNavigation />
      </div>
    </v-container>
  </v-app-bar>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useDisplay, useRtl } from 'vuetify'
  import NotificationsDropdown from '@/app/shell/notifications/NotificationsDropdown.vue'
  import { isUserSingleServerAdmin } from '@/shared/session/home-access'
  import { preferredSpaBaseLabels } from '@/shared/session/preferred-spa-base'
  import { useSessionStore } from '@/shared/session/session.store'
  import { useThemeStore } from '@/shared/theme/theme.store'
  import AddNewInstanceButton from './AddNewInstanceButton.vue'
  import AdminAreaDropdown from './AdminAreaDropdown.vue'
  import { navbarHeight, resolveNavbarLogo, showAddNewButton, tabsPlacement } from './navbar-rules'
  import NavbarTopNavigation from './NavbarTopNavigation.vue'
  import UserInfoDropdown from './UserInfoDropdown.vue'

  const session = useSessionStore()
  const { t } = useTranslation()
  const themeStore = useThemeStore()
  const { mobile, smAndDown } = useDisplay()
  const { isRtl } = useRtl()

  // Legacy `loggedIn` starts from `Auth.isLoggedIn()`; next derives the session from `/home` `user`.
  const loggedIn = computed(() => Boolean(session.user))
  const showAdminArea = computed(() => isUserSingleServerAdmin(session.home))
  const height = computed(() => navbarHeight({ smAndDown: smAndDown.value, mobile: mobile.value }))
  const labels = computed(() => preferredSpaBaseLabels(session.home))
  const logo = computed(() => resolveNavbarLogo({ logo: themeStore.lightLogo, darkLogo: themeStore.darkLogo }, themeStore.isDark))
</script>

<style lang="scss" scoped>
// V2 `color="white"` set the palette border colour; the border itself is `none`. V4 paints `solid` + width 0 in the theme colour.
.app-bar {
  border-style: none;
  border-color: var(--v-white-base);

  // V2 `.v-toolbar__content { padding: 4px 16px }`; V4 has none.
  :deep(.v-toolbar__content) {
    padding: 4px 16px;
  }
}

// V2 `.v-tabs-slider-wrapper` is not inside the tab: it took the typography of the row the tabs sit in (toolbar title 1.25rem/1.5
// next to the logo, body 1rem/1.5 in the second row), V4's slider inherits the tab's.
.v-toolbar-title :deep(.navbar-tabs .v-tab__slider) {
  font-size: 1.25rem;
  line-height: 1.5;
}

.navbar-tabs-row :deep(.navbar-tabs .v-tab__slider) {
  font-size: 1rem;
  line-height: 1.5;
}

// V2 `.container` padding is 12px (the sides come from `px-1`); V4 `.v-container` is 16px.
.v-container {
  padding-block: 12px;
}

.navbar__menu-items {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
}

// V2 `.v-toolbar__title` is 1.25rem with line-height 1.5 (30px); V4 sets 1.75rem.
.v-toolbar-title {
  line-height: 1.5;
}

// V4 `v-toolbar-title` wraps its slot in `.v-toolbar-title__placeholder`; legacy put `d-flex align-center` on the title itself.
.v-toolbar-title :deep(.v-toolbar-title__placeholder) {
  display: flex;
  align-items: center;
}

.logo-link {
  max-width: 100%;
  // V2 `.v-application a { color: var(--v-anchor-base) }` (primary); V4 leaves the UA link colour.
  color: var(--v-primary-base);

  .v-img {
    image-rendering: optimizeQuality;
    image-rendering: -moz-crisp-edges;
    image-rendering: -o-crisp-edges;
    -webkit-transform: translate3d(0, 0, 0);

    :deep(.v-img__img) {
      -webkit-transform: translate3d(0, 0, 0);
    }
  }
}
</style>
