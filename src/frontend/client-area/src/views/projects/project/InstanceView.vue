<template>
  <div>
    <InstanceTopBar
      :key="`instance-tb-${resource?.id}-${(resource?.sharedAccess ?? []).length}`"
      :fetching="instance.fetching"
      :instance="resource"
      :login-loading="loginLoading"
      :push-loading="pushLoading"
      @action-button-applogin="showAppLoginModal"
      @action-button-clearcache="showClearCacheModal"
      @action-button-copy="showCopyModal"
      @action-button-delete="showDeleteModal"
      @action-button-open-project="openProject"
      @action-button-preview="openPreview"
      @action-button-push-to-live="showPushModal"
      @action-button-push-to-staging="showPushToStagingModal"
      @action-button-share="openShare"
      @action-button-staging="showStagingModal"
      @action-button-update="showUpdateModal"
      @action-button-wplogin="showWpAdminModal"
      @instance-published="onInstancePublished"
    />

    <v-divider />

    <div
      class="px-6"
      data-testid="instance-page-content"
    >
      <router-view
        v-if="instance.pageMounted && resource && resource.isActive"
        :key="`instance-rv-${resource.id}`"
        :fetching="instance.fetching"
        :instance="resource"
        @action-button-install-woocommerce="showInstallWoocommerceModal"
        @action-button-retry="retryInstall"
        @action-button-update="showUpdateModal"
        @action-update-woocommerce="showWoocommerceUpdateModal"
        @reload-instance="reloadFrame"
      />
    </div>

    <action-modal-host
      :confirmed="Boolean(modalValues.confirm)"
      :modal="modal"
      :open="modalOpen"
      :persistent="modalPersistent"
      :render="modalRender"
      :submitting="modalSubmitting"
      :values="modalValues"
      :width="modal?.width"
      @button="onModalButton"
      @close="modalClose"
      @update:values="setModalValues"
    />

    <woocommerce-update-modal
      :model-value="woocommerceUpdateOpen"
      :submitting="woocommerceUpdating"
      :update-version="resource?.status.woocommerce_available"
      @confirm="confirmWoocommerceUpdate"
      @update:model-value="woocommerceUpdateOpen = $event"
    />

    <wp-admin-sso-modal
      ref="ssoModal"
      :preview-provider-enabled="previewProviderEnabled"
      :single-server="isSingleServer"
    />

    <app-sso-modal
      ref="appLoginModal"
      :preview-provider-enabled="previewProviderEnabled"
      :single-server="isSingleServer"
      title-key="button.adminArea"
    />

    <create-staging-modal
      ref="stagingModal"
      @created="onStagingCreated"
    />

    <share-instance-modal
      v-if="resource"
      v-model="shareOpen"
      :current-user-email="session.home?.user?.email"
      :instance="resource"
      :single-server="isSingleServer"
    />

    <preview-site-modal
      v-if="resource"
      v-model="previewOpen"
      :instance="resource"
      @preview-site-generated="onPreviewSiteGenerated"
    />
  </div>
</template>

<script lang="ts" setup>
  // The frame (its `$root` events, the modal host and the standalone modals) with the top bar in
  // `topbar/`. The row actions run on the builders and runners of `@/entities/project/instance-row-actions`; the rules that decide
  // what follows an action are in `instance-frame-actions.ts`.
  import type { InstanceResource, RawInstance } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { clearInstanceCache, deleteInstance } from '@/views/projects/instances.api'
  import { useLabelsStore } from '@/entities/label/labels.store'
  import { isContainerProject } from '@/entities/project/container-project'
  import {
    copyInstance,
    getAppSsoUsers,
    getPushToLiveDiff,
    getPushToStagingDiff,
    getServiceInstanceOptions,
    getWordpressSsoUsers,
    getWordpressUpdates,
    pushToLive,
    pushToStaging,
    updateWordpress,
  } from '@/entities/project/instance-actions.api'
  import { toInstanceResource } from '@/entities/project/instance-resource'
  import {
    applyWordpressVersions,
    buildClearCacheModal,
    buildCopyModal,
    buildPushLoadingModal,
    buildSingleDeleteModal,
    type CopyService,
    loadPushModal,
    loadPushStagingModal,
    prefetchUpdates,
    type PushToStagingDeps,
    runClearCache,
    runPushToLive,
    runPushToStaging,
    runSingleDelete,
    runUpdate,
    submitCopy,
  } from '@/entities/project/instance-row-actions'
  import {
    buildInstallWoocommerceModal,
    runInstallWoocommerce,
    runWoocommerceUpdate,
    type WoocommerceDeps,
  } from '@/entities/project/instance-woocommerce'
  import { installWoocommerce, updateWoocommerce } from '@/entities/project/instance-woocommerce.api'
  import { resolveOpenProject } from '@/entities/project/open-project'
  import ActionModalHost from '@/entities/project/ui/ActionModalHost.vue'
  import AppSsoModal from '@/entities/project/ui/AppSsoModal.vue'
  import CreateStagingModal from '@/entities/project/ui/CreateStagingModal.vue'
  import WoocommerceUpdateModal from '@/entities/project/ui/plugins/WoocommerceUpdateModal.vue'
  import PreviewSiteModal from '@/entities/project/ui/PreviewSiteModal.vue'
  import ShareInstanceModal from '@/entities/project/ui/ShareInstanceModal.vue'
  import WpAdminSsoModal from '@/entities/project/ui/WpAdminSsoModal.vue'
  import { type SsoUserOption, toAppSsoOptions, toSsoOptions } from '@/entities/project/wp-admin-sso'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { apiBaseUrl } from '@/shared/api/client'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { emit as emitAppEvent } from '@/shared/events/app-events'
  import { preferredSpaBase } from '@/shared/session/preferred-spa-base'
  import { useSessionStore } from '@/shared/session/session.store'
  import { type ActionContext, useActionModal } from '@/shared/ui/modal/use-action-modal'
  import { frameNotFoundPushes, resolveFrameRedirect } from './instance-frame'
  import { deleteFollowUp, pushStatusPatches, pushToStagingStatusPatches, type StatusPatch, updateStatusPatches } from './instance-frame-actions'
  import { useInstanceStore } from './instance.store'
  import InstanceTopBar from './topbar/InstanceTopBar.vue'
  import { useInstanceFrameEvents } from './use-instance-frame-events'

  const { t } = useTranslation()
  const route = useRoute()
  const router = useRouter()
  const session = useSessionStore()
  const alerts = useAlertsStore()
  const labels = useLabelsStore()
  const instance = useInstanceStore()

  const resource = computed(() => instance.instance)
  const instanceId = computed(() => String(route.params.id))
  const isSingleServer = computed(() => session.home?.app?.single_server?.active === true)
  const previewProviderEnabled = computed(() => Boolean(session.home?.app?.integrations?.preview_site_provider_enabled))

  /**
   * Runs after the GET of the frame (mount or `:id` change): the title, the redirects of `mountInstancePage`, then the modes. A failed
   * GET pushes the 404 page and then the list, as legacy does: `fetch` swallows the error, and `mountInstancePage`
   * sees the empty instance as not active and replaces the 404 page with the list (`preferredSpaBase`).
   */
  async function passFrame (request: Promise<boolean>): Promise<void> {
    try {
      // `false`: a newer GET (quick live/staging switch) replaced this one, so its redirects and modes are not ours.
      if (!await request) {
        return
      }
    } catch {
      for (const path of frameNotFoundPushes(preferredSpaBase(session.home))) {
        void router.push(path)
      }
      return
    }

    emitAppEvent('document-title-update')

    const current = instance.instance
    if (!current) {
      return
    }
    const redirect = resolveFrameRedirect(current, preferredSpaBase(session.home))
    if (redirect) {
      if (redirect.alertKey) {
        alerts.addAlert({ success: false, errorMessage: t(redirect.alertKey) })
      }
      void router.push(redirect.path)
      return
    }

    instance.fetchModes()
    instance.pageMounted = true
    void refreshWordpressVersions(current)
  }

  onMounted(() => {
    void labels.loadLabels()
    void passFrame(instance.load(instanceId.value))
  })

  watch(instanceId, (id, previous) => {
    if (id === previous) {
      return
    }
    void passFrame(instance.reload(id))
  })

  onBeforeUnmount(() => {
    instance.clear()
  })

  useInstanceFrameEvents({
    currentId: () => resource.value?.id ?? null,
    singleServer: () => isSingleServer.value,
    // On `instance-changed` the route keeps its name and the id changes; the `:id` watch reloads the frame.
    openInstance: id => {
      if (route.name) {
        void router.push({ name: route.name, params: { ...route.params, id: String(id) } })
      }
    },
    leave: () => {
      void router.push(preferredSpaBase(session.home))
    },
    onUpdateFinished: () => {
      void reloadAfterUpdate()
    },
    onWoocommerceChanged: () => {
      void reloadAfterUpdate()
    },
    onWoocommerceInstallFailed: () => {
      alerts.addAlert({ success: false, errorMessage: t('notification.instance.plugin.install.failed') })
    },
  })

  // Update and install notifications carry no facts: read the project and the live versions again; a failed read keeps the last.
  async function reloadAfterUpdate (): Promise<void> {
    const id = instance.instance?.id
    if (id === undefined) {
      return
    }
    try {
      if (!await instance.reload(id)) {
        return
      }
    } catch {
      return
    }
    const current = instance.instance
    if (current) {
      void refreshWordpressVersions(current)
    }
  }

  // A child asks for the resource again (`reload-instance`) without a redirect pass. While a GET of the
  // frame is in flight its answer is fresh anyway, and a new ticket would make the `:id` pass skip its redirects.
  function reloadFrame (): void {
    if (instance.fetching) {
      return
    }
    void instance.reload(instanceId.value)
  }

  // The deps of the row actions (`RowActionDeps`), as the list builds them (`InstancesView.vue`). The frame adds the two staging calls.
  const deps: PushToStagingDeps = {
    clearInstanceCache,
    deleteInstance: (id, body) => deleteInstance(id, body),
    getWordpressUpdates,
    updateWordpress,
    getServiceInstanceOptions,
    copyInstance,
    getPushToLiveDiff,
    pushToLive,
    getPushToStagingDiff,
    pushToStaging,
    refreshHome: () => session.ensureHome(true),
    addSuccessAlert: message => alerts.addAlert({ success: true, successMessage: message }),
    addErrorAlert: message => alerts.addAlert({ success: false, errorMessage: message }),
    getErrorMessage,
    t: (key, options) => String(t(key, options as never)),
  }

  // WooCommerce (General, Installation card): the same alerts and clients as the row actions.
  // The install is queued: the card shows it running until its notification (`onWoocommerceChanged`).
  const wooDeps: WoocommerceDeps = {
    ...deps,
    installWoocommerce: id => installWoocommerce(id),
    setInstalling: installing => instance.instance?.setWoocommerceInstalling(installing),
    updateWoocommerce: async id => {
      await updateWoocommerce(id)
      await instance.reload(id)
    },
  }

  function applyStatusPatches (patches: StatusPatch[]): void {
    for (const patch of patches) {
      instance.patchAsyncStatus(patch.id, patch.key, patch.value)
    }
  }

  /** `deleteInstance` follow-up: a staging copy leaves its parent (`instance-changed`), a live instance goes to `/`. */
  function afterDelete (target: InstanceResource): void {
    const follow = deleteFollowUp(target)
    if (follow.kind === 'to-parent') {
      instance.removeSubinstance(target.id)
      emitAppEvent('instance-changed', { id: follow.parent.id })
      return
    }
    void router.push({ path: '/' })
  }

  // The copy dialog's two steps share one handler, the same steps as the list.
  const copyHandler = {
    async run (values: Record<string, unknown>, ctx: ActionContext<InstanceResource>): Promise<void> {
      if (!ctx.target) {
        return
      }
      const step = await submitCopy(ctx.target, values, session.services as CopyService[], deps)
      if (step.kind === 'options') {
        ctx.open(step.modal)
      } else if (step.kind === 'copied') {
        ctx.close()
      }
    },
  }

  const {
    modal,
    modalOpen,
    submitting: modalSubmitting,
    render: modalRender,
    values: modalValues,
    persistent: modalPersistent,
    open: openModal,
    close: modalClose,
    setValues: setModalValues,
    onButton: onModalButton,
  } = useActionModal<InstanceResource>({
    'clear-cache': {
      async run (_values, ctx) {
        if (!ctx.target) {
          return
        }
        // The dialog closes in `finally`, whatever the outcome.
        await runClearCache(ctx.target, deps)
        ctx.close()
      },
    },
    'mass-delete': {
      async run (values, ctx) {
        const target = ctx.target
        if (!target) {
          return
        }
        if (await runSingleDelete(target, values, deps) === 'deleted') {
          ctx.close()
          afterDelete(target)
        }
      },
    },
    'update': {
      async run (values, ctx) {
        const target = ctx.target
        if (!target) {
          return
        }
        if (await runUpdate(target, values, deps) === 'success') {
          ctx.close()
          applyStatusPatches(updateStatusPatches(target.id))
        }
      },
    },
    'copy': copyHandler,
    'copy-options': copyHandler,
    'push': {
      async run (values, ctx) {
        const target = ctx.target
        if (!target) {
          return
        }
        if (await runPushToLive(target, values, deps) === 'success') {
          ctx.close()
          applyStatusPatches(pushStatusPatches(target))
        }
      },
    },
    'push-staging': {
      async run (values, ctx) {
        const target = ctx.target
        if (!target) {
          return
        }
        if (await runPushToStaging(target, values, deps) === 'success') {
          ctx.close()
          applyStatusPatches(pushToStagingStatusPatches(target))
        }
      },
    },
    // The dialog is busy (and persistent) while the request runs, as in legacy (`modalOptions.persistent`).
    'install-woocommerce': {
      async run (_values, ctx) {
        const target = ctx.target
        if (!target) {
          return
        }
        if (await runInstallWoocommerce(target, wooDeps) === 'success') {
          ctx.close()
        }
      },
    },
  })

  function showInstallWoocommerceModal (target: InstanceResource): void {
    openModal(buildInstallWoocommerceModal(deps.t), target)
  }

  // Update of WooCommerce (General, Installation card): its own dialog (`WoocommerceUpdateModal`), the request is the frame's.
  const woocommerceUpdateOpen = ref(false)
  const woocommerceUpdating = ref(false)

  function showWoocommerceUpdateModal (): void {
    woocommerceUpdateOpen.value = true
  }

  async function confirmWoocommerceUpdate (): Promise<void> {
    const target = resource.value
    if (!target) {
      return
    }
    woocommerceUpdating.value = true
    try {
      if (await runWoocommerceUpdate(target, wooDeps) === 'success') {
        woocommerceUpdateOpen.value = false
      }
    } finally {
      woocommerceUpdating.value = false
    }
  }

  function showClearCacheModal (target: InstanceResource): void {
    openModal(buildClearCacheModal(target, deps.t), target)
  }

  function showDeleteModal (target: InstanceResource): void {
    openModal(buildSingleDeleteModal(target, deps.t), target)
  }

  function showCopyModal (target: InstanceResource): void {
    openModal(buildCopyModal(session.services as CopyService[], deps.t), target)
  }

  // Try again of a failed installation (General, Installation card): the shell's `instance-retry-install` consumer runs it.
  function retryInstall (target: InstanceResource): void {
    emitAppEvent('instance-retry-install', { id: target.id, import_details: target.import_details, install_details: target.install_details })
  }

  // Update: the versions load first; no updates is an alert only.
  async function showUpdateModal (target: InstanceResource): Promise<void> {
    const result = await prefetchUpdates(target, deps)
    if (result.kind === 'modal') {
      openModal(result.modal, target)
    }
  }

  // The Installation card and the top bar read the core version the panel cached for the project answer, which a change made
  // outside the panel (WP Admin, WP-CLI) leaves stale for minutes. Every load of a WordPress project reads the Engine's own answer
  // (the read the update dialog makes) so the card and the Update button are right. A failed read keeps the cached version.
  async function refreshWordpressVersions (target: InstanceResource): Promise<void> {
    if (!target.hasInstallationDetails()) {
      return
    }
    try {
      applyWordpressVersions(target, await getWordpressUpdates(target.id))
    } catch {
      // The card keeps the version the project answer carried; the dialog reports its own failures.
    }
  }

  // Push to live: the button loads, the diff answers the dialog. The answer
  // reopens the dialog even when it was closed meanwhile, unless another push was requested since (as the list does).
  const pushLoading = ref(false)
  let pushRequest = 0

  async function showPushModal (staging: InstanceResource): Promise<void> {
    const request = ++pushRequest
    pushLoading.value = true
    try {
      // A container project has no diff request, so no loading dialog either.
      if (!isContainerProject(staging)) {
        openModal(buildPushLoadingModal(deps.t), staging)
      }
      const next = await loadPushModal(staging, deps)
      if (request === pushRequest) {
        openModal(next, staging)
      }
    } finally {
      if (request === pushRequest) {
        pushLoading.value = false
      }
    }
  }

  // Push to staging: the same flow as push to live, from the live project.
  // It shares `pushLoading` and `pushRequest`, because the live and the staging buttons never show together.
  async function showPushToStagingModal (live: InstanceResource): Promise<void> {
    const request = ++pushRequest
    pushLoading.value = true
    try {
      // A container project has no diff request, so no loading dialog either.
      if (!isContainerProject(live)) {
        openModal(buildPushLoadingModal(deps.t, 'staging'), live)
      }
      const next = await loadPushStagingModal(live, deps)
      if (request === pushRequest) {
        openModal(next, live)
      }
    } finally {
      if (request === pushRequest) {
        pushLoading.value = false
      }
    }
  }

  // Admin Area loader of the top bar: legacy had one flag per login, here it is one flag because the frame shows one of the two buttons.
  const loginLoading = ref(false)

  // WP Admin: the administrators load first; a failure is an alert and the dialog does not open.
  const ssoModal = useTemplateRef<InstanceType<typeof WpAdminSsoModal>>('ssoModal')

  async function showWpAdminModal (target: InstanceResource): Promise<void> {
    loginLoading.value = true
    try {
      const users = await getWordpressSsoUsers(target.id)
      void ssoModal.value?.open(target, toSsoOptions(users))
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      loginLoading.value = false
    }
  }

  // app-lite Log In: the project users load first, then `AppSsoModal` opens.
  const appLoginModal = useTemplateRef<{ open: (instance: InstanceResource, options: SsoUserOption[]) => Promise<void> | undefined }>('appLoginModal')

  async function showAppLoginModal (target: InstanceResource): Promise<void> {
    loginLoading.value = true
    try {
      const users = await getAppSsoUsers(target.id)
      void appLoginModal.value?.open(target, toAppSsoOptions(users))
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      loginLoading.value = false
    }
  }

  // Create staging: the dialog runs its own requests; the new copy joins the sub-instances.
  const stagingModal = useTemplateRef<InstanceType<typeof CreateStagingModal>>('stagingModal')

  function showStagingModal (target: InstanceResource): void {
    void stagingModal.value?.open(target)
  }

  function onStagingCreated (staging: Record<string, unknown>): void {
    instance.addSubinstance(staging)
  }

  // Share (`ShareInstanceModal`): the top bar's share button and the shares label open it.
  const shareOpen = ref(false)

  function openShare (): void {
    shareOpen.value = true
  }

  // Preview (`PreviewSiteModal`): the answer is the preview site; the page keeps it on the instance.
  const previewOpen = ref(false)

  // A panelalpha.online site opens in a new tab, any other gets the preview modal.
  function openProject (target: InstanceResource): void {
    const action = resolveOpenProject(target)
    if (action.kind === 'open') {
      window.open(action.href, '_blank', 'noopener,noreferrer')
    } else if (action.kind === 'preview') {
      previewOpen.value = true
    }
  }

  function openPreview (): void {
    previewOpen.value = true
  }

  function onPreviewSiteGenerated (previewSite: unknown): void {
    if (resource.value) {
      resource.value.preview_site = previewSite
    }
  }

  // The raw instance a change-domain PUT answers becomes the resource.
  function onInstancePublished (raw: RawInstance): void {
    instance.replace(toInstanceResource(raw, session.home, { apiBase: apiBaseUrl() }))
    void refreshAfterDomainChange()
  }

  // A failed read keeps what the page shows: the rename is already saved.
  async function refreshAfterDomainChange (): Promise<void> {
    const id = instance.instance?.id
    if (id === undefined) {
      return
    }
    try {
      if (!await instance.refresh(id)) {
        return
      }
    } catch {
      return
    }
    const current = instance.instance
    if (current) {
      void refreshWordpressVersions(current)
    }
  }
</script>
