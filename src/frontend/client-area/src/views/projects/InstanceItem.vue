<template>
  <div
    class="data-iterator-card"
    :class="[
      checked ? 'data-iterator-card--selected' : '',
      isSuspended ? 'data-iterator-card--suspended' : '',
    ]"
    data-testid="instance-card"
  >
    <v-card
      elevation="4"
      rounded
    >
      <div
        v-if="item.hasInstallStatus()"
        class="v-card__img v-card__img-installation-pending"
        :class="{ 'v-card__img-installation-pending--error': item.hasInstallFailed() }"
      >
        <instance-card-img-deploy-pending
          v-if="isCustomProject"
          :status="item.hasInstallFailed() ? 'error' : 'in_progress'"
        />

        <instance-card-img-import-pending
          v-else-if="item.import_details"
          :instance="item"
          :status="item.hasInstallFailed() ? 'error' : 'in_progress'"
        />

        <instance-card-img-installation-pending
          v-else
          :status="item.hasInstallFailed() ? 'error' : 'in_progress'"
        />
      </div>

      <div v-else>
        <div
          v-if="!item.screenshot_url"
          class="v-card__img v-card__img-not-available"
        >
          <instance-card-img-not-available :instance="item" />
        </div>

        <v-img
          v-else
          class="data-iterator-card__image"
          cover
          height="200px"
          max-height="200px"
          position="center top"
          :src="item.screenshot_url"
          width="100%"
        >
          <template #placeholder>
            <image-loader />
          </template>
        </v-img>
      </div>

      <div
        v-if="isSuspended"
        class="instance-actions instance-actions--suspended cursor-pointer"
        data-testid="instance-overlay-suspended"
        @click="unsuspend"
      >
        <div
          class="instance-actions__suspended-box d-flex align-center justify-center flex-column"
        >
          <v-icon
            class="mb-3"
            color="sand-darken-1"
            icon="$suspended"
            size="32"
          />

          <p class="font-weight-600 p-2 text-sand-darken-1 text-center">
            {{ t('message.serviceSuspended') }}
          </p>
        </div>
      </div>

      <router-link
        v-else
        class="instance-actions px-12"
        data-testid="instance-overlay"
        :to="item.isActive && item.service_status == 'active' ? { path: managePath(item.id) } : ''"
      >
        <instance-item-actions
          :checking-app-login="checkingAppLogin"
          :checking-wp-login="checkingWpLogin"
          :instance="item"
          :is-custom="isCustomProject"
          :preview-not-available="!item.screenshot_url"
          :state="installStatus"
          @app-login="emit('app-login', $event)"
          @cancel-deploy="deployLogs.cancelDeploy($event)"
          @cancel-install="emit('cancel-install', $event)"
          @download-deploy-logs="deployLogs.downloadDeployLogs($event)"
          @import-details="emit('import-details', $event)"
          @open-project="openProject"
          @retry-install="emit('retry-install', $event)"
          @show-deploy-logs="deployLogs.openDeployLogs($event)"
          @wp-admin="emit('wp-admin', $event)"
        />
      </router-link>

      <div
        v-if="!item.hasInstallStatus()"
        class="data-iterator-card__checkbox-container"
      >
        <checkbox
          :aria-label="t('button.selectProject', { name: item.title })"
          :model-value="checked"
          @update:model-value="emit('checked', $event)"
        />
      </div>

      <v-divider />

      <v-card-title>
        <div class="d-flex w-100 justify-space-between flex-nowrap align-start data-iterator-card__title-wrapper">
          <v-tooltip
            v-if="hasBlockingActionInProgress"
            location="bottom"
            :offset="12"
            open-delay="150"
            open-on-click
            open-on-hover
            transition="custom-tooltip"
          >
            <template #activator="{ props: activatorProps }">
              <div v-bind="activatorProps">
                <span
                  class="h5 font-weight-bold data-iterator-card__title data-iterator-card__title--link"
                  data-testid="instance-card-title"
                >
                  {{ item.title }}
                </span>
              </div>
            </template>

            <span>{{ t('message.status.instance.notAvailable') }}</span>
          </v-tooltip>

          <component
            :is="!item.hasInstallInProgress() ? RouterLink : 'div'"
            v-else
            :to="item.isActive ? spaPath(`${item.id}/general`) : ''"
          >
            <span
              class="h5 font-weight-bold data-iterator-card__title data-iterator-card__title--link"
              data-testid="instance-card-title"
              v-text="item.title"
            />
          </component>

          <div
            v-if="!(item.hasInstallInProgress() || item.hasInstallFailed())"
            :class="{ 'instance-card-status-slot': !isAppSingleServer }"
          >
            <status-indicator
              :key="item.id"
              ref="issueIndicator"
              :instance="item"
              :submitting="issueResolve.isSubmitting(item.id)"
              @action="onIssueAction"
              @error="issueResolve.onError"
              @resolve="payload => issueResolve.onResolve(item.id, payload, issueIndicator)"
            />
          </div>
        </div>

        <v-tooltip
          v-if="item.hasInstallInProgress()"
          location="bottom"
          :offset="12"
          open-delay="150"
          open-on-click
          open-on-hover
          transition="custom-tooltip"
        >
          <template #activator="{ props: activatorProps }">
            <div
              class="d-flex data-iterator-card__url-box"
              v-bind="activatorProps"
            >
              <span
                class="instance-domain-link p-4"
                data-testid="instance-card-url"
                v-text="item.url"
              />
            </div>
          </template>

          {{ t('message.status.instance.notAvailable') }}
        </v-tooltip>

        <div
          v-else-if="item.hasInstallFailed()"
          class="d-flex data-iterator-card__url-box"
        >
          <span
            class="instance-domain-link p-4"
            data-testid="instance-card-url"
            v-text="item.url"
          />
        </div>

        <div
          v-else
          class="d-flex data-iterator-card__url-box flex-wrap"
        >
          <div class="d-flex w-100">
            <dns-ssl-indicator
              v-if="!item.hasIpAddressInUrl()"
              :documentation-link="documentationLink"
              :instance="item"
              :single-server="isAppSingleServer"
              @dns-propagation-in-progress="isDnsPropagationInProgress = true"
            />

            <a
              class="instance-domain-link p-4 ml-1"
              data-testid="instance-card-url"
              :href="item.url"
              target="_blank"
              v-text="item.url"
            />
          </div>

          <preview-site-button
            v-if="showPreviewSiteButton"
            :instance="item"
          />
        </div>
      </v-card-title>

      <v-card-text class="pt-3">
        <div
          ref="labelContainer"
          class="w-100"
        >
          <instance-labels
            chips
            container-class="ml-0"
            :disabled="hasBlockingActionInProgress"
            :filters-active="true"
            :instance="item"
            :labels="item.labels"
            :max-labels-displayed="99"
            :max-width="maxLabelWidth"
            remaining-as-button
            xsmall
            @toggle-filter="toggleFilter"
          />
        </div>
      </v-card-text>

      <v-card-actions class="justify-space-between pt-3">
        <div class="d-flex">
          <instance-subinstance-indicator
            :key="`instance-${item.id}`"
            :instance="item"
            @cancel-installation="emit('cancel-installation', item)"
            @restart-installation="emit('retry-install', item)"
          />

          <instance-subinstance-indicator
            v-for="subinstanceItem in item.subInstances"
            :key="`subinstance-${subinstanceItem.id}`"
            :instance="subinstanceItem"
            @cancel-installation="emit('cancel-installation', item)"
            @restart-installation="emit('retry-install', item)"
          />
        </div>

        <div class="d-flex">
          <collaborate-label
            v-if="isCollaborateEnabled && item.hasCollaborationPrivilege()"
            class="mr-2"
            is-small
            @click="collaboration.open(item.id)"
          />

          <shares-label
            v-if="item.hasManageSharedAccessPrivilege()"
            :instance="item"
            is-small
            @open="emit('share', item)"
          />
        </div>
      </v-card-actions>
    </v-card>

    <preview-site-modal
      v-if="isAppSingleServer"
      v-model="previewOpen"
      :instance="item"
    />

    <instance-deploy-logs-modal
      v-if="isCustomProject && deployLogs.instanceId.value !== null"
      :instance-id="deployLogs.instanceId.value"
      :is-open="deployLogs.isOpen.value"
      :live="deployLogs.live.value"
      :log-id="deployLogs.logId.value"
      :no-logs="deployLogs.noLogs.value"
      :source="deployLogs.source.value"
      @close="deployLogs.closeDeployLogs"
    />
  </div>
</template>

<script lang="ts" setup>
  // The card in its default, no-preview, suspended, staging-chip, installing, importing and failed variants, with the hover overlay.
  // app-lite adds the custom-project card. The buttons (WP Admin, Cancel, Import details, Try again) only emit; the host
  // (`InstancesView`) runs them.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import type { HydratedIssue } from '@/entities/project/ui/status-issues/issue-registry'
  import type { IssueIndicator } from '@/entities/project/use-issue-resolve'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref, useTemplateRef } from 'vue'
  import { RouterLink, useRouter } from 'vue-router'
  import InstanceLabels from '@/entities/label/ui/InstanceLabels.vue'
  import { resolveOpenProject } from '@/entities/project/open-project'
  import DnsSslIndicator from '@/entities/project/ui/DnsSslIndicator.vue'
  import InstanceCardImgNotAvailable from '@/entities/project/ui/InstanceCardImgNotAvailable.vue'
  import PreviewSiteModal from '@/entities/project/ui/PreviewSiteModal.vue'
  import SharesLabel from '@/entities/project/ui/SharesLabel.vue'
  import StatusIndicator from '@/entities/project/ui/status-issues/StatusIndicator.vue'
  import { useCollaborationLink } from '@/entities/project/use-collaboration-link'
  import { useIssueResolve } from '@/entities/project/use-issue-resolve'
  import { preferredSpaBase } from '@/shared/session/preferred-spa-base'
  import { useSessionStore } from '@/shared/session/session.store'
  import { useSpaResourcePath } from '@/shared/session/use-spa-resource-path'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import ImageLoader from '@/shared/ui/loader/ImageLoader.vue'
  import CollaborateLabel from './CollaborateLabel.vue'
  import InstanceCardImgDeployPending from './InstanceCardImgDeployPending.vue'
  import InstanceCardImgImportPending from './InstanceCardImgImportPending.vue'
  import InstanceCardImgInstallationPending from './InstanceCardImgInstallationPending.vue'
  import InstanceDeployLogsModal from './InstanceDeployLogsModal.vue'
  import InstanceItemActions from './InstanceItemActions.vue'
  import InstanceSubinstanceIndicator from './InstanceSubinstanceIndicator.vue'
  import PreviewSiteButton from './PreviewSiteButton.vue'
  import { useDeployLogsModal } from './use-deploy-logs-modal'

  const props = defineProps<{
    item: InstanceResource
    checked?: boolean
    /** The SSO users of this instance are loading: the overlay's WP Admin button shows its loader. */
    checkingWpLogin?: boolean
    /** app-lite: the users of this project are loading (`GET /instances/:id/users`), the overlay's Log In button shows its loader. */
    checkingAppLogin?: boolean
  }>()

  const emit = defineEmits<{
    'checked': [value: boolean]
    'toggle-filter': [label: { title: string, color?: string }]
    // The unsuspend event takes the link, the same payload the table emits.
    'unsuspend': [link: string | true]
    // The host handles these four; they only report the instance.
    'wp-admin': [instance: InstanceResource]
    // app-lite custom project: the host opens `AppSsoModal`
    'app-login': [instance: InstanceResource]
    // The overlay's Cancel button and the installation indicator's one both open `CancelInstallationDialog` in the host, whose
    // checkbox is the acknowledgement the delete needs.
    'cancel-install': [instance: InstanceResource]
    'cancel-installation': [instance: InstanceResource]
    'import-details': [instance: InstanceResource]
    'retry-install': [instance: InstanceResource]
    'share': [instance: InstanceResource]
  }>()

  const { t } = useTranslation()
  const router = useRouter()
  const session = useSessionStore()
  const { managePath, spaPath } = useSpaResourcePath()

  // Lite host duties of the issue menu (upload + redeploy), see `use-issue-resolve.ts`.
  // Not `statusIndicator`: a setup binding of that name would shadow the `<status-indicator>` tag.
  const issueIndicator = useTemplateRef<IssueIndicator>('issueIndicator')
  const issueResolve = useIssueResolve()
  const collaboration = useCollaborationLink()

  const labelContainer = ref<HTMLElement | null>(null)
  const maxLabelWidth = ref(0)
  const isDnsPropagationInProgress = ref(false)

  const isSuspended = computed(() =>
    props.item.service_status === 'suspended' || props.item.service_status === 'cancelled',
  )

  const hasBlockingActionInProgress = computed(() => props.item.hasInstallStatus())

  // What `InstanceItemActions` renders instead of the Manage site / WP Admin buttons.
  const installStatus = computed<'error' | 'in_progress' | false>(() => {
    if (!props.item.hasInstallStatus()) {
      return false
    }
    return props.item.hasInstallFailed() ? 'error' : 'in_progress'
  })

  const isAppSingleServer = computed(() => !!session.home?.app?.single_server?.active)
  const documentationLink = computed(() => String(session.home?.app?.documentation_link ?? ''))

  // app-lite: a project that is not a WordPress site.
  const isCustomProject = computed(() => (props.item.type || 'wordpress') === 'custom')

  const deployLogs = useDeployLogsModal({ t: key => String(t(key)) })

  const isCollaborateEnabled = computed(() => session.home?.app?.integrations?.atarim_enabled)

  // app-lite: the card has no Preview Site row; only the multi-server/app variant renders it.
  const showPreviewSiteButton = computed(() => {
    return !isAppSingleServer.value && session.home?.app?.integrations?.preview_site_provider_enabled && isDnsPropagationInProgress.value
  })

  // A panelalpha.online site opens its url, any other the preview dialog.
  const previewOpen = ref(false)

  function openProject (): void {
    const action = resolveOpenProject(props.item)
    if (action.kind === 'open') {
      window.open(action.href, '_blank', 'noopener,noreferrer')
    } else if (action.kind === 'preview') {
      previewOpen.value = true
    }
  }

  /** The unsuspend link when the user has one, otherwise `true` (so the overlay is always clickable). */
  function unsuspendUrl (): string | true {
    const link = session.home?.user?.service_unsuspend_link as string | undefined
    return link || true
  }

  function unsuspend (): void {
    emit('unsuspend', unsuspendUrl())
  }

  function toggleFilter (label: { title: string, color?: string }): void {
    emit('toggle-filter', label)
  }

  /** The kit `StatusIndicator` leaves navigation to the host. */
  function onIssueAction (issue: HydratedIssue): void {
    if (issue.action?.type === 'navigate') {
      void router.push(`${preferredSpaBase(session.home)}/${issue.action.to(props.item)}`)
    }
  }

  onMounted(() => {
    maxLabelWidth.value = labelContainer.value ? labelContainer.value.scrollWidth : 0
  })
</script>

<style lang="scss" scoped>
.data-iterator-card--suspended {
  border-top: 3px solid var(--v-sand-base);
  border-radius: 8px;
}

.instance-actions__suspended-box {
  max-width: 200px;
  min-width: 200px;
}

.v-card {
  border-radius: 8px;

  &__img {
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;

    &-installation-pending--error {
      background: var(--v-instance-card-gradient);
    }
  }

  &__img-not-available {
    height: 200px;
  }

  // V2 `.v-card > :first-child` took the card's top radius; V4 puts `.v-card__loader` / `.v-card__underlay` before the image block.
  &__img-installation-pending {
    border-top-left-radius: inherit;
    border-top-right-radius: inherit;
  }

  &__img-tooltip {
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
}

.v-card-actions {
  padding: 0px 16px 10px 16px;
}

.v-card-text,
.v-card-title {
  padding-left: 16px;
  padding-right: 16px;
  padding-bottom: 0px;
  padding: 12px 16px 0px 16px;
}

// V4 `.v-card-text` grows (`flex: 1 1 auto`) and takes the free height of a stretched card; V2 left it to the `margin: auto` of
// the text and the actions (1.5px each), which keeps the content rows at their natural height.
.v-card-text {
  flex-grow: 0;
}

// The legacy app `StatusIndicator` wraps its icon in `.status-indicator-container { min-height: 32px }` and always renders it (green
// check, red chip). The kit version renders nothing without issues, so the row keeps the legacy height here (the green check
// itself is the accepted exception). The app-lite card has no such wrapper: its row is as tall as the title (single server).
.instance-card-status-slot {
  min-height: 32px;
}

.v-tooltip {
  cursor: pointer;
}

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
    // V2 `.v-application a { color: var(--v-anchor-base) }`: the overlay is a router link (V4 leaves the user-agent blue).
    color: var(--v-anchor-base);
    position: absolute;
    top: 0;
    height: 200px;
    z-index: 5;
    width: 100%;
    background: var(--v-card-hit-overlay);
    transition: opacity 0.2s ease;
    opacity: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    backdrop-filter: blur(8px);
    border-radius: 8px;
    overflow: hidden;

    &--suspended {
      height: 100%;
      background-color: var(--v-panel-action-hover);
      color: var(--v-sand-darken1);
      backdrop-filter: blur(13.5px);
    }
  }
}

.cursor-pointer {
  cursor: pointer;
}
</style>
