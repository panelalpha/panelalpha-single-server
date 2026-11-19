<template>
  <v-menu
    content-class="user-info-menu"
    :content-props="{ 'data-testid': 'shell-user-menu' }"
    location="bottom end"
    :offset="16"
  >
    <template #activator="{ props: activatorProps }">
      <AppButton
        v-bind="activatorProps"
        :aria-label="t('button.userMenu')"
        class="button-activator pr-0"
        :class="mobile ? 'button-activator--mobile pl-0 ml-2' : 'button-activator--desktop pl-2 ml-4'"
        data-testid="shell-user-activator"
        :height="mobile ? 40 : 48"
        kind="secondary"
        :min-width="mobile ? 0 : 82"
        rounded
        size="large"
      >
        <v-icon
          v-if="!mobile"
          class="button-activator__chevron"
          color="black"
          size="20"
        >
          $chevrondown
        </v-icon>

        <UserAvatar
          :badge="badge"
          :email="email"
          :size="mobile ? 40 : 48"
        />
      </AppButton>
    </template>

    <v-list class="dropdown-left v-list--small">
      <!-- A clickable list item activates on Enter and Space too, so the row needs no key handler of its own. -->
      <v-list-item
        v-if="allowChangeMode"
        :aria-checked="darkMode"
        :aria-label="t('heading.styleManager.darkMode.darkMode')"
        class="text-primary dark-mode-item"
        data-testid="shell-user-menu-first-item"
        role="switch"
        tabindex="0"
        @click="toggleDarkMode()"
      >
        <v-list-item-title class="p-2">
          <div class="d-flex align-center">
            <DarkModeSwitch
              aria-hidden="true"
              class="dark-mode-item__switch mr-3"
              :model-value="darkMode"
              readonly
              tabindex="-1"
            />

            <p class="p-2 mt-0 mb-0 text--darken2">
              {{ t('heading.styleManager.darkMode.darkMode') }}
            </p>
          </div>
        </v-list-item-title>
      </v-list-item>

      <v-divider v-if="allowChangeMode" />

      <v-list-item
        class="text-primary"
        :data-testid="allowChangeMode ? undefined : 'shell-user-menu-first-item'"
        to="/my-account"
      >
        <v-list-item-title class="p-2">
          <v-icon
            class="mr-4 gray--icon"
            size="20"
          >
            $user
          </v-icon>
          {{ t('button.account.details') }}
        </v-list-item-title>
      </v-list-item>

      <v-list-item
        v-if="showMyServerItem(session.home)"
        class="text-primary"
        data-testid="shell-user-menu-my-server"
        to="/hosting/"
      >
        <v-list-item-title class="p-2">
          <v-icon
            class="mr-4 gray--icon"
            size="20"
          >
            $server
          </v-icon>
          {{ t('heading.navbar.tab.myServer') }}
        </v-list-item-title>
      </v-list-item>

      <v-list-item
        v-if="showTasksItem(session.home)"
        class="text-primary"
        to="/tasks"
      >
        <v-list-item-title class="p-2">
          <v-icon
            class="mr-4 gray--icon"
            size="20"
          >
            $tasks
          </v-icon>

          <v-badge
            bordered
            class="user-dropdown-dot-badge"
            color="warning"
            dot
            :model-value="tasksDot(session.home)"
          />
          {{ t('general.tasks') }}
        </v-list-item-title>
      </v-list-item>

      <v-list-item
        v-if="freePanel"
        class="text-primary"
        to="/settings"
      >
        <v-list-item-title class="p-2">
          <v-icon
            class="mr-4 gray--icon"
            size="20"
          >
            $settingsLight
          </v-icon>

          <v-badge
            bordered
            class="user-dropdown-dot-badge"
            color="warning"
            dot
            :model-value="hubDisconnected"
          />
          {{ t('general.settings') }}
        </v-list-item-title>
      </v-list-item>

      <v-list-item
        v-if="plansVisible"
        class="text-primary"
        to="/services"
      >
        <v-list-item-title class="p-2">
          <v-icon
            class="mr-4 gray--icon"
            size="20"
          >
            $plans
          </v-icon>

          <v-badge
            bordered
            class="user-dropdown-dot-badge"
            color="warning"
            dot
            :model-value="plansDot"
          />
          {{ t('general.myPlans') }}
        </v-list-item-title>
      </v-list-item>

      <v-list-item
        v-if="billingEnabled"
        class="text-primary"
        to="/billing"
      >
        <v-list-item-title class="p-2">
          <v-icon
            class="mr-4 gray--icon"
            size="20"
          >
            $dollarsign
          </v-icon>

          <v-badge
            bordered
            class="user-dropdown-dot-badge user-dropdown-dot-badge--error"
            color="error"
            dot
            :model-value="false"
          />
          {{ t('general.myBilling') }}
        </v-list-item-title>
      </v-list-item>

      <v-list-item
        v-if="singleServer"
        class="text-primary"
        :href="DISCORD_URL"
        target="_blank"
      >
        <v-list-item-title class="p-2">
          <v-icon
            class="mr-4 gray--icon"
            size="22"
          >
            $discordIcon
          </v-icon>
          {{ t('general.joinOurCommunity') }}
        </v-list-item-title>
      </v-list-item>

      <v-list-item
        v-else
        class="text-primary"
        :href="supportUrl"
        target="_blank"
      >
        <v-list-item-title class="p-2">
          <v-icon
            class="mr-4 gray--icon"
            size="20"
          >
            $supportIcon
          </v-icon>
          {{ t('general.support') }}
        </v-list-item-title>
      </v-list-item>

      <v-divider />

      <v-list-item
        class="text-primary"
        data-testid="shell-user-logout"
        @click="logout"
      >
        <v-list-item-title class="p-2">
          <v-icon
            class="mr-4 gray--icon"
            size="20"
          >
            $logout
          </v-icon>
          {{ t('button.logout') }}
        </v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import { useDisplay, useTheme } from 'vuetify'
  import { isSingleServer, servicesPageVisible } from '@/shared/session/home-access'
  import { useSessionStore } from '@/shared/session/session.store'
  import { useThemeStore } from '@/shared/theme/theme.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DarkModeSwitch from '@/shared/ui/dark-mode-switch/DarkModeSwitch.vue'
  import UserAvatar from '@/shared/ui/user-avatar/UserAvatar.vue'
  import { changeDarkMode } from './dark-mode'
  import { allowToChangeMode, DISCORD_URL, hubNotConnected, isFreePanel, showMyServerItem, showTasksItem, tasksDot, userBadge, userBadgeWarning } from './user-menu-rules'

  const { t } = useTranslation()
  const router = useRouter()
  const session = useSessionStore()
  const themeStore = useThemeStore()
  const theme = useTheme()
  const { mobile } = useDisplay()

  const email = computed(() => session.user?.email ?? '')
  const badge = computed(() => userBadge(session.home))
  const plansDot = computed(() => userBadgeWarning(session.home))
  const freePanel = computed(() => isFreePanel(session.home))
  const hubDisconnected = computed(() => hubNotConnected(session.home))
  // My Plans follows `servicesPageVisible`; Billing stays on `billing_enabled`.
  const plansVisible = computed(() => servicesPageVisible(session.home))
  const billingEnabled = computed(() => Boolean(session.home?.app?.billing_enabled))
  const singleServer = computed(() => isSingleServer(session.home))
  const allowChangeMode = computed(() => allowToChangeMode(session.home, themeStore.style))
  const darkMode = computed(() => themeStore.isDark)
  const supportUrl = computed(() => session.home?.app?.support_link)

  // One call per activation of the row.
  function toggleDarkMode () {
    changeDarkMode(themeStore, theme, !darkMode.value)
  }

  // Logout, then `/login`. A failed `POST /logout` still clears the session in next
  // (`session.logout()` clears in `finally`), so it goes to `/login` as well instead of staying on a signed-in route
  // without a user (legacy kept the session and stayed on the page). The error is swallowed as in legacy.
  async function logout () {
    try {
      await session.logout()
    } catch {
      // Ignored, as in legacy.
    }
    await router.push({ path: '/login' }).catch(() => {})
  }
</script>

<style lang="scss" scoped>
// The `$chevrondown` icon wraps its inline svg in a `div`; the baseline gap under the svg makes that div taller than the 20px box and
// the V4 `inline-flex` `.v-icon` centres it, lifting the chevron 2px. V2 top-aligned the wrapper.
.button-activator__chevron :deep(svg) {
  display: block;
}

// `.user-dropdown-dot-badge`: the zero-size badge root is pinned over the
// item icon and the dot is 6x6 with a 1px ring. V2 `.v-badge__badge:after` took the dot colour as its border colour; V4 draws
// the ring only with `bordered` and in the background colour, so the ring colour is set to the dot token here.
.user-dropdown-dot-badge {
  position: absolute;
  left: 30px;
  top: -2px;

  :deep(.v-badge__badge) {
    height: 6px;
    width: 6px;
    // V2 palette class on the dot: 4.5px radius, white text, 300 weight (V4: 50%, on-colour text, 500) and the box sits 6px right, 10px lower.
    border-radius: 4.5px;
    color: var(--v-white-base);
    font-weight: 300;
    translate: 6px 10px;
    // The default ring colour (`on-warning`/`background`) must be the dot colour: the ring then only grows the dot.
    &::after {
      border-color: rgb(var(--v-theme-warning));
      border-width: 1px;
      color: rgb(var(--v-theme-warning));
    }
  }

  &.user-dropdown-dot-badge--error :deep(.v-badge__badge)::after {
    border-color: rgb(var(--v-theme-error));
    color: rgb(var(--v-theme-error));
  }
}

</style>

<style lang="scss">
// The menu is teleported out of this component, so its rules cannot be scoped. Scope is the `user-info-menu` content class.
// V2 `.v-menu__content` carried no theme colour (the global overlay colour in `_dropdowns` is for detached menus), so the
// content takes the app text colour; V2 list items had no border and no vertical padding (`min-height` comes from `.v-list--small`).
.v-menu > .v-overlay__content.user-info-menu.user-info-menu {
  color: var(--v-text-base);
  // The connected location strategy writes the activator width into an inline `min-width`, which wins over the prop.
  min-width: 220px !important;

  .v-list-item {
    border-color: currentcolor;
    border-style: none;
    padding-bottom: 0;
    padding-top: 0;
  }

  // V2 `.v-list-item__title` had `line-height: 1.2`; V4 gives the title 1.5rem, which put the text of every item 1px lower.
  .v-list-item-title {
    line-height: 1.2;
  }

  // V4 clips the item content and title (`overflow: hidden`); the switch track sits 3px left of its box (`AppSwitch.vue`) and the thumb casts
  // a 4px/8px shadow, so the item cut the left end of the track and the bottom of the shadow (looked cut off). Let them paint outside.
  .v-list-item.dark-mode-item {
    .v-list-item__content,
    .v-list-item-title {
      overflow: visible;
    }

    // The row is the switch (one focus stop, one click target): the switch inside only shows the state.
    .dark-mode-item__switch {
      pointer-events: none;
    }
  }
}
</style>
