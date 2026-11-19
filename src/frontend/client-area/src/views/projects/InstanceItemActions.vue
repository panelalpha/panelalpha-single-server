<template>
  <div
    class="instance-actions__content text-center"
    :class="
      state
        ? state === 'error'
          ? 'instance-actions__content--error'
          : 'instance-actions__content--pending'
        : ''
    "
    data-testid="instance-actions"
  >
    <template v-if="!state">
      <AppButton
        data-testid="instance-manage-site"
        kind="primary"
        :loading="manageSiteLoading"
        max-width="184px"
        min-width="184px"
        size="small"
        @click.stop.prevent="manageSite"
      >
        <span class="font-weight-bold">{{ isCustomProject ? t('button.manage') : t('button.site.manage') }}</span>
      </AppButton>

      <!-- Inline background kept: the V4 `color` class would otherwise paint `--v-theme-info`. -->
      <AppButton
        class="mt-4 link-hover"
        color="info"
        data-testid="instance-wp-admin"
        kind="primary"
        max-width="184px"
        min-width="184px"
        size="small"
        style="background-color: var(--v-link-base);"
        @click.stop.prevent="onOpenLogin"
      >
        <v-icon
          v-if="!checkingWpLogin && !checkingAppLogin"
          class="white-text"
          :icon="opensProject ? '$externallink' : '$wordpressalt'"
          size="16"
        />

        <loader
          v-else-if="checkingWpLogin || checkingAppLogin"
          class="mr-3 white-text"
          color="info"
          no-margins
          size="16"
        />

        <span class="font-weight-bold white-text">{{ opensProject || isCustom ? t('button.openProject') : t('button.wpAdmin') }}</span>
      </AppButton>

      <v-tooltip
        v-if="previewNotAvailable"
        location="bottom"
        :offset="4"
        open-delay="150"
        transition="custom-tooltip"
        z-index="99"
      >
        <template #activator="{ props: activatorProps }">
          <div
            v-bind="activatorProps"
            class="preview-not-available__text p-4 pt-4 text--gray-darken2"
            data-testid="instance-preview-why"
          >
            {{ t('message.notPreview.title') }}
            <span class="text-primary">{{ t('button.why') }}</span>
          </div>
        </template>

        <span v-if="instance.isNew()">
          {{ t('message.notPreview.info.new') }}
        </span>

        <span v-else>
          {{ t('message.notPreview.info.other') }}
        </span>
      </v-tooltip>
    </template>

    <template v-else-if="state === 'error'">
      <span
        v-if="isCustom"
        class="font-weight-bold p2 heading--text"
        data-testid="instance-actions-message"
      >
        {{ t('deployLogs.deployFailed') }}
      </span>

      <span
        v-else-if="isImport"
        class="font-weight-bold p2 heading--text"
        data-testid="instance-actions-message"
      >
        {{ t('message.status.importing.failed') }} {{ t('button.try') }}
      </span>

      <span
        v-else
        class="font-weight-bold p2 heading--text"
        data-testid="instance-actions-message"
      >
        {{ t('message.status.install.failed') }} {{ t('button.try') }}
      </span>

      <div
        v-if="isCustom"
        class="instance-actions__row mt-3"
      >
        <AppButton
          class="flex-grow-1"
          data-testid="instance-show-logs"
          kind="primary"
          size="small"
          @click.stop.prevent="emit('show-deploy-logs', instance)"
        >
          <v-icon
            class="mr-1"
            color="white"
            icon="$filetext"
            size="16"
          />

          <span class="font-weight-bold">{{ t('deployLogs.showLogs') }}</span>
        </AppButton>

        <AppButton
          class="instance-actions__icon-btn flex-shrink-0"
          data-testid="instance-download-logs"
          kind="primary"
          size="small"
          :title="t('deployLogs.downloadLog')"
          @click.stop.prevent="emit('download-deploy-logs', instance)"
        >
          <v-icon
            color="white"
            icon="$downloadcloud"
            size="16"
          />
        </AppButton>
      </div>

      <AppButton
        v-if="isImport"
        class="mt-4"
        data-testid="instance-import-details"
        kind="primary"
        max-width="184px"
        min-width="184px"
        size="small"
        @click.stop.prevent="emit('import-details', instance)"
      >
        <span class="font-weight-bold">{{ t('button.import.details') }}</span>
      </AppButton>

      <AppButton
        v-if="!isImport"
        class="mt-4"
        color="success"
        data-testid="instance-retry-install"
        kind="primary"
        max-width="184px"
        min-width="184px"
        size="small"
        @click.stop.prevent="emit('retry-install', instance)"
      >
        <v-icon
          color="white"
          icon="$restore"
          size="16"
        />

        <span class="font-weight-bold">{{ t('button.try') }}</span>
      </AppButton>

      <AppButton
        class="cancel-installation-btn mt-4"
        color="error"
        data-testid="instance-cancel-install"
        kind="secondary"
        max-width="184px"
        min-width="184px"
        size="small"
        @click.stop.prevent="emit('cancel-install', instance)"
      >
        <span class="font-weight-bold">
          <span v-if="isImport">{{ t('button.import.cancel') }}</span>

          <span v-else>{{ t('button.installation.cancel') }}</span>
        </span>
      </AppButton>
    </template>

    <template v-else-if="state === 'in_progress'">
      <template v-if="isCustom">
        <div
          class="d-flex justify-center align-center font-weight-bold p2 heading--text"
          data-testid="instance-actions-message"
        >
          <loader
            class="mr-2"
            no-margins
            :size="14"
          />

          {{ t('deployLogs.deployInProgress') }}
        </div>

        <!-- Stacked like the other overlay states (Show Logs over Cancel Deploy, 184px each); legacy put both in one 184px row, where
             "Cancel Deploy" overflowed the card. -->
        <div class="instance-actions__row instance-actions__row--stack mt-3">
          <AppButton
            block
            data-testid="instance-show-logs"
            kind="primary"
            size="small"
            @click.stop.prevent="emit('show-deploy-logs', instance)"
          >
            <v-icon
              class="mr-1"
              color="white"
              icon="$filetext"
              size="16"
            />

            <span class="font-weight-bold">{{ t('deployLogs.showLogs') }}</span>
          </AppButton>

          <AppButton
            block
            class="cancel-installation-btn"
            color="error"
            data-testid="instance-cancel-deploy"
            kind="secondary"
            size="small"
            @click.stop.prevent="emit('cancel-deploy', instance)"
          >
            <span class="font-weight-bold">{{ t('deployLogs.cancelDeploy') }}</span>
          </AppButton>
        </div>
      </template>

      <template v-else-if="isImport">
        <div
          class="d-flex align-center font-weight-bold p2 heading--text mb-4"
          data-testid="instance-actions-message"
        >
          <loader
            class="mr-2"
            no-margins
            :size="14"
          />

          <span>{{ t('message.status.importing.inProgress') }}</span>
        </div>
      </template>

      <template v-else>
        <div
          class="d-flex justify-center align-center flex-column font-weight-bold p2 heading--text"
          data-testid="instance-actions-message"
        >
          <p class="d-flex justify-center align-center heading--text mb-1">
            <loader
              class="mr-2"
              no-margins
              :size="14"
            />
            {{ t('notification.instance.installation.inProgress') }}
          </p>

          <p class="heading--text mb-0">
            {{ t('message.managementNotAvailable') }}
          </p>
        </div>
      </template>

      <AppButton
        v-if="isImport"
        data-testid="instance-import-details"
        kind="primary"
        max-width="184px"
        min-width="184px"
        size="small"
        @click.stop.prevent="emit('import-details', instance)"
      >
        <span class="font-weight-bold">{{ t('button.import.details') }}</span>
      </AppButton>

      <AppButton
        class="cancel-installation-btn mt-4"
        color="error"
        data-testid="instance-cancel-install"
        kind="secondary"
        max-width="184px"
        min-width="184px"
        size="small"
        @click.stop.prevent="emit('cancel-install', instance)"
      >
        <span class="font-weight-bold">
          <span v-if="isImport">{{ t('button.import.cancel') }}</span>

          <span v-else>{{ t('button.installation.cancel') }}</span>
        </span>
      </AppButton>
    </template>
  </div>
</template>

<script lang="ts" setup>
  // app-lite adds the custom-project and deploy overlays.
  // WP Admin, Cancel, Import details and Try again only emit the instance. The cancel confirmation dialog of legacy is
  // the shared `CancelInstallationDialog`, hosted by `InstancesView`.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { useSpaResourcePath } from '@/shared/session/use-spa-resource-path'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'

  const props = withDefaults(defineProps<{
    instance: InstanceResource
    /** `Loader` instead of the WordPress icon on the WP Admin button; the host drives it while the SSO user list loads. */
    checkingWpLogin?: boolean
    /** Same for the app login of a custom project (`AppSsoModal`). */
    checkingAppLogin?: boolean
    /** app-lite: a `type === 'custom'` project (deploy overlays, "Open project"). */
    isCustom?: boolean
    state?: 'in_progress' | 'error' | false
    previewNotAvailable?: boolean
  }>(), {
    checkingWpLogin: false,
    checkingAppLogin: false,
    isCustom: false,
    state: false,
    previewNotAvailable: false,
  })

  const emit = defineEmits<{
    'wp-admin': [instance: InstanceResource]
    // The host opens `AppSsoModal` for it
    'app-login': [instance: InstanceResource]
    // app-lite single server: "Open Project", the host opens the url or the preview.
    'open-project': [instance: InstanceResource]
    'show-deploy-logs': [instance: InstanceResource]
    'download-deploy-logs': [instance: InstanceResource]
    'cancel-deploy': [instance: InstanceResource]
    'cancel-install': [instance: InstanceResource]
    'import-details': [instance: InstanceResource]
    'retry-install': [instance: InstanceResource]
  }>()

  const { t } = useTranslation()
  const router = useRouter()
  const { isSingleServer, managePath } = useSpaResourcePath()

  const manageSiteLoading = ref(false)

  const isImport = computed(() => props.instance.import_details !== null)

  // A project, not a WordPress site ("Manage", "Open project").
  const isCustomProject = computed(() => isSingleServer.value && props.isCustom)

  // Single server: a WordPress site with wp-admin SSO logs in to wp-admin ("WP Admin"), any other
  // project opens ("Open Project"). The legacy lite card opened every single-server project.
  const opensProject = computed(() => isSingleServer.value && (props.isCustom || !props.instance.supports_admin_sso
    || !props.instance.hasCreateSsoLinkPrivilege()))

  // Multi server logs in (WP Admin, or Log In of a custom project).
  function onOpenLogin (): void {
    if (opensProject.value) {
      emit('open-project', props.instance)
    } else if (props.isCustom) {
      emit('app-login', props.instance)
    } else {
      emit('wp-admin', props.instance)
    }
  }

  /** Shows the button loader, then goes to the instance (`/instances/:id`, which redirects to `general`). */
  function manageSite (): void {
    manageSiteLoading.value = true
    void router.push({ path: managePath(props.instance.id) })
  }
</script>

<style lang="scss" scoped>
.v-card {
  &:hover {
    .instance-actions {
      opacity: 1;

      &__content {
        transform: translateY(0px);
      }
    }
  }

  .instance-actions {
    &__row {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 184px;
      max-width: 100%;

      .flex-grow-1.v-btn {
        min-width: 0;
      }

      // Deploy in progress: the buttons one under the other, 16px apart like the `mt-4` stacks of the other states.
      &--stack {
        flex-direction: column;
        align-items: stretch;
        gap: 16px;
      }
    }

    // !important is kept: it beats the V4 `.v-btn--icon` size/padding rules.
    &__icon-btn.v-btn {
      min-width: 32px !important;
      width: 32px;
      padding: 0 !important;

      .v-icon {
        margin-right: 0;
      }
    }

    &__content {
      width: 100%;
      transition: transform 0.3s ease-out;
      transform: translateY(16px);
      position: relative;
      z-index: 9;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
  }
}

// V2 `small` buttons are 14px; V4 `size="small"` is 12px.
.instance-actions__content .v-btn {
  font-size: 14px;
}

.link-hover:hover {
  // !important is kept: it beats the `bg-info` colour class of the V4 button.
  background: var(--v-link-hover) !important;
  border-color: var(--v-link-hover) !important;
}

.cancel-installation-btn {
  // !important is kept: it beats the V4 outlined text/border colour.
  &.v-btn.v-btn--variant-outlined {
    .v-btn__content {
      > span {
        color: var(--v-error-base) !important;
      }
    }

    border-color: var(--v-error-base) !important;
  }
}
</style>
