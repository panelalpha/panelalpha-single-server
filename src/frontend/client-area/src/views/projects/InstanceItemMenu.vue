<template>
  <v-menu
    v-model="open"
    :close-on-content-click="false"
    content-class="instance-item-menu"
    :content-props="{ 'data-testid': 'instance-item-menu' }"
    location="bottom end"
    :max-width="290"
    :min-width="220"
    :offset="8"
    :transition="false"
    :z-index="51"
  >
    <template #activator="{ props: activatorProps }">
      <AppButton
        v-bind="activatorProps"
        :id="`instance-item-${id}`"
        :aria-label="t('button.actions')"
        class="instance-item__more-button"
        :data-testid="main ? 'instance-table-menu' : undefined"
        kind="icon"
      >
        <v-icon icon="$morehorizontal" />
      </AppButton>
    </template>

    <v-list
      v-if="instance.hasInstallFailed()"
      class="v-list--small"
    >
      <v-list-item
        v-if="showDeployLogsItem"
        class="text-primary"
        data-testid="instance-menu-show-logs"
        @click.stop.prevent="showDeployLogs"
      >
        <v-icon
          class="mr-4"
          icon="$filetext"
          size="20"
        />

        <v-list-item-title>{{ t('deployLogs.showLogs') }}</v-list-item-title>
      </v-list-item>

      <v-list-item
        class="text-primary"
        data-testid="instance-menu-retry"
        @click.stop.prevent="act('retry-install', instance)"
      >
        <v-icon
          class="mr-4"
          icon="$restore"
          size="20"
        />

        <v-list-item-title>{{ t('button.try') }}</v-list-item-title>
      </v-list-item>

      <v-list-item
        class="text-error"
        data-testid="instance-menu-cancel-install"
        @click.stop.prevent="act('cancel-install', instance)"
      >
        <v-icon
          class="mr-4"
          icon="$errorCircle"
          size="20"
        />

        <v-list-item-title class="text--error">
          {{ t('button.installation.cancel') }}
        </v-list-item-title>
      </v-list-item>
    </v-list>

    <v-list
      v-else
      class="v-list--small"
    >
      <v-list-item
        class="text-primary"
        data-testid="instance-menu-manage"
        :to="{ path: managePath(manageId) }"
        @click="close"
      >
        <v-icon
          class="mr-4"
          icon="$grid"
          size="20"
        />

        <v-list-item-title>{{ t('button.manage') }}</v-list-item-title>
      </v-list-item>

      <!-- app (multi server): the "WP Admin" item. Single server: one item per project kind, "WP Admin" for WordPress and "Admin Area"
           for a custom app (app-lite says "Admin Area" for both). -->
      <v-list-item
        v-if="!isSingleServer && instance.hasCreateSsoLinkPrivilege()"
        class="text-info"
        data-testid="instance-menu-wp-admin"
        @click="loginAction('wp-admin')"
      >
        <v-icon
          v-if="!checkingWpLogin"
          class="mr-4 text-info"
          icon="$wordpress"
          size="20"
        />

        <loader
          v-else
          class="mr-4"
          color="info"
          no-margins
          :size="20"
        />

        <v-list-item-title class="text-info">
          {{ t('button.wpAdmin') }}
        </v-list-item-title>
      </v-list-item>

      <v-list-item
        v-if="showWpAdminArea"
        class="text-info"
        data-testid="instance-menu-admin-area"
        @click="loginAction('wp-admin')"
      >
        <v-icon
          v-if="!checkingWpLogin"
          class="mr-4 text-info"
          icon="$wordpress"
          size="20"
        />

        <loader
          v-else
          class="mr-4"
          color="info"
          no-margins
          :size="20"
        />

        <v-list-item-title class="text-info">
          {{ t('button.wpAdmin') }}
        </v-list-item-title>
      </v-list-item>

      <v-list-item
        v-if="showAppAdminArea"
        class="text-info"
        data-testid="instance-menu-admin-area"
        @click="loginAction('log-in')"
      >
        <v-icon
          v-if="!checkingWpLogin"
          class="mr-4 text-info"
          icon="$settings3"
          size="20"
        />

        <loader
          v-else
          class="mr-4"
          color="info"
          no-margins
          :size="20"
        />

        <v-list-item-title class="text-info">
          {{ t('button.adminArea') }}
        </v-list-item-title>
      </v-list-item>

      <v-list-item
        v-if="showDeployLogsItem"
        class="text-primary"
        data-testid="instance-menu-show-logs"
        @click.stop.prevent="showDeployLogs"
      >
        <v-icon
          class="mr-4"
          icon="$filetext"
          size="20"
        />

        <v-list-item-title>{{ t('deployLogs.showLogs') }}</v-list-item-title>
      </v-list-item>

      <v-divider />

      <!-- The staging sub-row pushes to live; every other row creates a staging (legacy had a bare `@click="true"` on Push to live). -->
      <v-list-item
        v-if="subinstance.subinstanceLabel === 'staging' && instance.hasPushToLivePrivilege()"
        class="primary-btn"
        color="primary"
        data-testid="instance-menu-push-to-live"
        @click="act('push-to-live', subinstance)"
      >
        <v-icon
          class="mr-4"
          icon="$send"
          size="20"
        />

        <v-list-item-title>{{ t('button.pushToLive') }}</v-list-item-title>
      </v-list-item>

      <v-list-item
        v-else-if="subinstance.subinstanceLabel !== 'staging' && instance.hasCreateStagingPrivilege()"
        class="text-primary"
        data-testid="instance-menu-staging"
        @click="act('staging', subinstance)"
      >
        <v-icon
          class="mr-4"
          icon="$wrench"
          size="20"
        />

        <v-list-item-title>{{ t('button.staging') }}</v-list-item-title>
      </v-list-item>

      <!-- Single server has no Copy (app-lite shows it like app). -->
      <v-list-item
        v-if="!isSingleServer && instance.plan_settings?.copy_instance_allowed && instance.hasCopyInstancePrivilege()"
        class="text-primary"
        data-testid="instance-menu-copy"
        @click="act('copy', subinstance)"
      >
        <v-icon
          class="mr-4"
          icon="$copy"
          size="20"
        />

        <v-list-item-title>{{ t('button.copy') }}</v-list-item-title>
      </v-list-item>

      <v-list-item
        v-if="instance.hasWordPressUpdatePrivilege()"
        class="text-primary"
        data-testid="instance-menu-update"
        @click="updateAction"
      >
        <v-icon
          v-if="!checkingUpdates"
          class="mr-4"
          icon="$update"
          size="20"
        />

        <loader
          v-else
          class="mr-4"
          color="primary"
          no-margins
          :size="20"
        />

        <v-list-item-title>{{ t('button.update') }}</v-list-item-title>
      </v-list-item>

      <v-list-item
        v-if="instance.hasClearCachePrivilege()"
        class="text-primary"
        data-testid="instance-menu-clear-cache"
        @click="act('clear-cache', subinstance)"
      >
        <v-icon
          class="mr-4"
          icon="$restore"
          size="20"
        />

        <v-list-item-title>{{ t('button.clearCache') }}</v-list-item-title>
      </v-list-item>

      <!-- Legacy wraps this item in `ShareInstanceModal` without a `v-if`, yet the item is absent without `general.manage_shared_access`
           (measured on the app deploy), so it is gated like the Shares column and the card chip.
           App-lite shows it without the privilege; the gate stays. -->
      <v-list-item
        v-if="subinstance.hasManageSharedAccessPrivilege()"
        class="text-primary"
        data-testid="instance-menu-share"
        @click="act('share', subinstance)"
      >
        <v-icon
          class="mr-4"
          icon="$shareIcon"
          size="16"
        />

        <v-list-item-title>{{ t('button.share') }}</v-list-item-title>
      </v-list-item>

      <v-divider />

      <!-- Legacy showed the Update loader here too while the updates loaded (`v-if="!checkingUpdates"`); Delete never shows a loader. -->
      <v-list-item
        v-if="instance.hasDeleteInstancePrivilege()"
        class="text-error"
        data-testid="instance-menu-delete"
        @click="act('delete', subinstance)"
      >
        <v-icon
          class="mr-4"
          color="error"
          icon="$xcircle"
          size="20"
        />

        <v-list-item-title class="text-error">
          {{ deleteButtonText(subinstance, t) }}
        </v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script lang="ts" setup>
  // The row kebab of the instance table, with the app-lite items (Show Logs, Admin Area). Every action only emits the action
  // instance; what it opens is the view's. Manage stays a router link.
  // The menu closes once the action resolves (modal opened, alert shown), not on click, so the
  // WP Admin / Log In / Update loaders are visible. Legacy never closed it. Delete shows no loader.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, nextTick, ref, watch } from 'vue'
  import { isContainerProject } from '@/entities/project/container-project'
  import { deleteButtonText } from '@/entities/project/instance-row-actions'
  import { useSpaResourcePath } from '@/shared/session/use-spa-resource-path'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'

  const props = withDefaults(defineProps<{
    /** The row instance: the item itself, or `{ ...item, subinstance }` on a staging sub-row. */
    instance: InstanceResource & { subinstance?: InstanceResource }
    subinstance: InstanceResource
    main?: boolean
    /** Drives the `Loader` of WP Admin and Log In while the SSO users load. */
    checkingWpLogin?: boolean
    /** Drives the `Loader` of Update while the updates load. */
    checkingUpdates?: boolean
  }>(), {
    main: false,
    checkingWpLogin: false,
    checkingUpdates: false,
  })

  const emit = defineEmits<{
    'wp-admin': [instance: InstanceResource]
    'log-in': [instance: InstanceResource]
    'show-deploy-logs': [instance: InstanceResource]
    'push-to-live': [instance: InstanceResource]
    'staging': [instance: InstanceResource]
    'copy': [instance: InstanceResource]
    'update': [instance: InstanceResource]
    'clear-cache': [instance: InstanceResource]
    'share': [instance: InstanceResource]
    'delete': [instance: InstanceResource]
    'retry-install': [instance: InstanceResource]
    'cancel-install': [instance: InstanceResource]
  }>()

  const { t } = useTranslation()
  const { isSingleServer, managePath } = useSpaResourcePath()

  const open = ref(false)

  /** The main row's id, or the staging id on a sub-row. */
  const id = computed(() => props.main ? props.instance.id : props.subinstance.id)
  const manageId = id

  // app-lite `instance.type === 'custom'` (custom projects have deploy logs).
  const isCustom = computed(() => props.instance.type === 'custom')

  // Legacy shows "Show Logs" for every custom project. The API serves deploy logs only for a
  // container project with `general.view_logs` (422 / 403 otherwise), and
  // a classic project is `custom` until the WordPress probe: there the modal said "No deploys
  // yet", or polled the live endpoint every 2 s forever while the install ran.
  const showDeployLogsItem = computed(() => isContainerProject(props.instance) && props.instance.hasViewLogsPrivilege())

  // app-lite: "Admin Area" needs `supports_admin_sso`.
  // Lite `hasManageUsersPrivilege` is `general.manage_users` (`hasManageGeneralUsersPrivilege` in the privileges module).
  const showWpAdminArea = computed(() =>
    isSingleServer.value && !!props.instance.supports_admin_sso && !isCustom.value && props.instance.hasCreateSsoLinkPrivilege(),
  )
  const showAppAdminArea = computed(() =>
    isSingleServer.value && !!props.instance.supports_admin_sso && isCustom.value && props.instance.hasManageGeneralUsersPrivilege(),
  )

  function close (): void {
    open.value = false
  }

  /** A sub-row acts on its subinstance, the main row on the instance. */
  function loginInstance (): InstanceResource {
    return props.main ? props.instance : props.subinstance
  }

  // The actions that resolve at once (the view opens a dialog): close after the emit.
  type PlainEvent = 'push-to-live' | 'staging' | 'copy' | 'clear-cache' | 'share' | 'delete' | 'retry-install' | 'cancel-install'

  function act (name: PlainEvent, target: InstanceResource): void {
    // `emit` is overloaded per event name; every name of `PlainEvent` takes the same payload.
    ;(emit as (event: PlainEvent, instance: InstanceResource) => void)(name, target)
    close()
  }

  function showDeployLogs (): void {
    emit('show-deploy-logs', props.instance)
    close()
  }

  // The actions that fetch first (SSO users, updates): the host raises the loader prop right after the emit. The menu stays open
  // while it shows and closes when it drops (the action resolved). A host that raises no loader resolves at once: close.
  let pending: 'login' | 'update' | null = null

  async function loginAction (name: 'wp-admin' | 'log-in'): Promise<void> {
    if (name === 'wp-admin') {
      emit('wp-admin', loginInstance())
    } else {
      emit('log-in', loginInstance())
    }
    await nextTick()
    if (props.checkingWpLogin) {
      pending = 'login'
    } else {
      close()
    }
  }

  async function updateAction (): Promise<void> {
    emit('update', loginInstance())
    await nextTick()
    if (props.checkingUpdates) {
      pending = 'update'
    } else {
      close()
    }
  }

  watch(() => props.checkingWpLogin, value => {
    if (!value && pending === 'login') {
      pending = null
      close()
    }
  })

  watch(() => props.checkingUpdates, value => {
    if (!value && pending === 'update') {
      pending = null
      close()
    }
  })

  defineExpose({ close })
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// Legacy `.instance-item__more-button:hover, [aria-expanded="true"] { color: primary darken1 !important }`.
.instance-item__more-button {
  &.v-btn:hover,
  &.v-btn[aria-expanded="true"] {
    color: map.get(v.$primary, darken1);
  }
}
</style>

<style lang="scss">
@use '@/app/styles/legacy/tokens/variables' as v;

// The menu is teleported out of this component, so its rules cannot be scoped. Scope is the `instance-item-menu` content class.
// Legacy `.v-list.v-list--small { min-width: 220px; max-width: 220px }`, `.text--error { color: var(--v-error-base) !important }`
// and the V2 menu content without a theme colour or list item borders (same rules as `UserInfoDropdown`).
.v-menu > .v-overlay__content.instance-item-menu.instance-item-menu {
  color: var(--v-text-base);
  min-width: 220px;
  // Legacy `.v-menu__content { margin-top: -8px }` on top of `nudge-bottom: 16px`: 8px below the kebab. The connected location
  // strategy places the margin box, so the `offset` prop carries the net 8px and the margin only restores the computed style.
  margin-top: -8px;

  // V2 `.v-list` in a menu: no border, no radius and a zero elevation (the V4 list brings its own); the border colour is the
  // list background (`--v-tooltip-base`, `_dropdowns.scss`).
  .v-list.v-list--small {
    min-width: 220px;
    max-width: 220px;
    border-color: var(--v-tooltip-base);
    border-style: none;
    border-radius: 0;
    box-shadow: v.$box-shadow-v2-list-flat;
  }

  // The dark list is the V2 `.v-sheet` surface (measured: the border colour computes to it on the deployed legacy).
  @at-root .v-menu.v-theme--dark > .v-overlay__content.instance-item-menu.instance-item-menu .v-list.v-list--small {
    border-color: var(--v-sheet-surface);
  }

  .v-list-item {
    border-color: currentcolor;
    border-style: none;
    padding-bottom: 0;
    padding-top: 0;
  }

  // V2 list items were a flex row (icon, then the title block); the V4 content is a block, which stacks the icon above the title.
  .v-list-item__content {
    display: flex;
    align-items: center;
  }

  .text--error {
    color: var(--v-error-base);
  }
}
</style>
