<template>
  <v-menu
    :close-on-content-click="false"
    content-class="notifications-menu"
    :content-props="{ 'data-testid': 'shell-notifications-menu' }"
    location="bottom end"
    :min-width="306"
    :offset="16"
  >
    <template #activator="{ props: activatorProps }">
      <AppButton
        v-bind="activatorProps"
        :aria-label="t('button.notifications')"
        class="notifications-activator"
        :class="mobile ? 'ml-2' : 'ml-4'"
        data-testid="shell-bell"
        icon
        kind="secondary"
        rounded
        size="large"
        :variant="mobile ? 'text' : 'outlined'"
        @click="store.readAll()"
      >
        <div
          v-if="store.hasUnread"
          class="notifications-unread"
          data-testid="shell-bell-unread"
        />

        <v-icon color="black">
          $bell
        </v-icon>
      </AppButton>
    </template>

    <div>
      <NotificationsManagerEmpty v-if="store.items.length === 0" />

      <NotificationsManager
        v-else
        :notifications="store.items"
        @clear-all="store.removeAll()"
        @load-next-page="store.loadNextPage()"
        @remove-notification="item => store.remove(item.id)"
      />
    </div>
  </v-menu>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { useDisplay } from 'vuetify'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { useNotificationsStore } from './notifications.store'
  import NotificationsManager from './NotificationsManager.vue'
  import NotificationsManagerEmpty from './NotificationsManagerEmpty.vue'

  const { t } = useTranslation()
  const { mobile } = useDisplay()
  const store = useNotificationsStore()
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.v-btn.v-btn {
  position: relative;
  transition: color 0.24s ease, background-color 0.24s ease, border-color 0.24s ease;

  :deep(.v-icon svg) {
    transition: color 0.24s ease;
    color: var(--v-darkicon-base);
  }

  &:hover,
  &[aria-expanded="true"] {
    // Kept: without it the global button layer wins on the button colour.
    color: map.get(v.$primary, base) !important;
    border-color: map.get(v.$primary, darken1);

    :deep(.v-icon svg) {
      color: map.get(v.$primary, darken1);
    }
  }

  &[aria-expanded="true"] {
    background-color: map.get(v.$primary, lighten4);
  }

  // V2 `.v-btn__content` is `position: relative`, so the dot sits at the corner of the 24px content box, not of the button.
  :deep(.v-btn__content) {
    position: relative;
  }

  .notifications-unread {
    position: absolute;
    right: -10px;
    top: -7px;
    background-color: map.get(v.$primary, base);
    width: 12px;
    height: 12px;
    border-radius: 100%;
    z-index: 5;
  }
}
</style>

<style lang="scss">
// The menu is teleported out of this component, so its rules cannot be scoped. Scope is the `notifications-menu` content class.
// The global `.v-menu > .v-overlay__content` caps the width at 220px (V2 menus had none); the legacy menu is 306px wide.
.v-menu > .v-overlay__content.notifications-menu.notifications-menu {
  // V2 menu content carried no theme colour: it takes the app text colour (same as the user menu).
  color: var(--v-text-base);
  border-color: currentcolor;
  max-width: none;
  // The connected location strategy writes the activator width into an inline `min-width`, which wins over the prop.
  min-width: 306px !important;
}
</style>
