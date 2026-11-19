<template>
  <div class="w-100 top-bar">
    <TopBarSubinstanceBar
      :fetching="fetching"
      :instance="instance"
      @action-button-staging="emit('action-button-staging', $event)"
    />

    <template v-if="!fetching && instance">
      <div class="px-6">
        <v-container
          class="top-bar__container px-0"
          :class="{
            'mt-8': !lgAndDown,
            'mt-6': lg,
            'mt-4': mdAndDown,
          }"
        >
          <v-row
            class="justify-space-between mx-0 mb-6 align-start"
            :class="mdAndDown ? 'flex-column' : 'flex-nowrap'"
          >
            <TopBarTitle
              :fetching="fetching"
              :instance="instance"
              @dns-propagation-in-progress="isDnsPropagationInProgress = true"
              @instance-published="emit('instance-published', $event)"
            />

            <div
              class="top-bar-title__box d-flex justify-start justify-lg-end align-center"
              :class="smAndDown ? 'flex-wrap' : ''"
            >
              <div
                v-if="smAndDown"
                class="d-flex mt-4"
              >
                <div
                  v-if="instance.sharedAccess?.length"
                  class="align-self-center mr-6 cursor-pointer"
                  data-testid="top-bar-shares"
                  @click="emit('action-button-share', instance)"
                >
                  <SharesLabelBig :instance="instance" />
                </div>

                <router-link
                  v-if="!singleServer"
                  class="d-flex align-center mr-3"
                  :to="`/hosting/summary?id=${instance.hostingId}`"
                >
                  <span class="p-1 info--text d-flex align-center">
                    <v-icon
                      class="mr-2"
                      color="info"
                      icon="$externallink"
                      :size="16"
                    />
                    {{ t('general.hosting') }}
                  </span>
                </router-link>
              </div>

              <!-- `flex-wrap`: the row of seven icon buttons is wider than a narrow window (and than the space left of the title below
                   1200px); wrapped, it takes a second line instead of reaching past the page. -->
              <div
                class="d-flex justify-start justify-lg-end align-center flex-wrap"
                :class="mdAndDown ? 'mt-4' : ''"
              >
                <BaseIconButton
                  v-if="instance.hasManageSharedAccessPrivilege()"
                  class="top-bar__btn"
                  color="info"
                  data-testid="top-bar-share"
                  icon="$shareIcon"
                  :small="smAndDown"
                  :text="t('button.share')"
                  @click="emit('action-button-share', instance)"
                />

                <BaseIconButton
                  v-if="singleServer"
                  data-testid="top-bar-open-project"
                  :disabled="!instance.isActive"
                  icon="$externallink"
                  :text="t('button.openProject')"
                  @click="emit('action-button-open-project', instance)"
                />

                <BaseIconButton
                  v-if="showPreviewSiteButton"
                  data-testid="top-bar-preview"
                  :disabled="!instance.isActive"
                  icon="$previewDetails"
                  :text="t('button.preview')"
                  @click="emit('action-button-preview', instance)"
                />

                <BaseIconButton
                  v-if="showAdminArea"
                  class="top-bar__btn"
                  :class="smAndDown ? 'ml-3' : ''"
                  color="info"
                  data-testid="top-bar-admin-area"
                  :disabled="!instance.isActive"
                  :icon="adminSso.icon"
                  :loading="loginLoading"
                  :small="smAndDown"
                  :text="t(adminSso.labelKey)"
                  @click="openAdminArea"
                />

                <template
                  v-if="instance.subinstanceLabel !== 'staging' && instance.hasCreateStagingPrivilege() && !instance.hasStaging()"
                >
                  <v-tooltip
                    :disabled="instance.subInstances.length < 2"
                    location="bottom"
                    :open-delay="150"
                    transition="custom-tooltip"
                  >
                    <template #activator="{ props: activatorProps }">
                      <div v-bind="activatorProps">
                        <BaseIconButton
                          class="top-bar__btn"
                          :class="smAndDown ? 'ml-3' : ''"
                          data-testid="top-bar-staging"
                          :disabled="instance.subInstances.length >= 2 || !instance.isActive"
                          icon="$wrench"
                          :small="smAndDown"
                          :text="t('button.staging')"
                          @click="emit('action-button-staging', instance)"
                        />
                      </div>
                    </template>

                    <span>
                      {{ t('tooltip.topBar.staging.create.inProgress') }}
                    </span>
                  </v-tooltip>
                </template>

                <BaseIconButton
                  v-else-if="instance.subinstanceLabel !== 'staging' && instance.hasPushToStagingPrivilege() && instance.hasActiveStaging()"
                  class="primary-btn top-bar__btn"
                  data-testid="top-bar-push-to-staging"
                  :disabled="!instance.isActive"
                  icon="$copy"
                  :loading="pushLoading || instance.hasActionInProgress()"
                  :text="t('button.pushToStaging')"
                  @click="emit('action-button-push-to-staging', instance)"
                />

                <BaseIconButton
                  v-else-if="instance.subinstanceLabel === 'staging' && instance.hasPushToLivePrivilege()"
                  class="primary-btn top-bar__btn"
                  data-testid="top-bar-push-to-live"
                  :disabled="!instance.isActive"
                  icon="$send"
                  :loading="pushLoading || instance.hasActionInProgress()"
                  :text="t('button.pushToLive')"
                  @click="emit('action-button-push-to-live', instance)"
                />

                <BaseIconButton
                  v-if="showCopy"
                  class="top-bar__btn"
                  data-testid="top-bar-copy"
                  :disabled="!instance.isActive"
                  icon="$copy"
                  :small="lgAndDown"
                  :text="t('button.copy')"
                  @click="emit('action-button-copy', instance)"
                />

                <template v-if="updateAvailable">
                  <BaseIconButton
                    v-if="instance.hasWordPressUpdatePrivilege()"
                    class="top-bar__btn"
                    data-testid="top-bar-update"
                    :disabled="!instance.isActive"
                    icon="$update"
                    :loading="instance.hasUpdateInProgress()"
                    :small="lgAndDown"
                    :text="t('button.update')"
                    @click="emit('action-button-update', instance)"
                  />
                </template>

                <template v-else>
                  <v-tooltip
                    v-if="instance.hasWordPressUpdatePrivilege()"
                    location="bottom"
                    :open-delay="150"
                    transition="custom-tooltip"
                  >
                    <template #activator="{ props: activatorProps }">
                      <div v-bind="activatorProps">
                        <BaseIconButton
                          class="top-bar__btn"
                          data-testid="top-bar-update"
                          :disabled="true"
                          icon="$update"
                          :small="lgAndDown"
                          :text="t('button.update')"
                        />
                      </div>
                    </template>

                    <span>{{ t('tooltip.topBar.update') }}</span>
                  </v-tooltip>
                </template>

                <BaseIconButton
                  v-if="instance.hasClearCachePrivilege()"
                  class="top-bar__btn"
                  :class="lgAndDown ? 'ml-3' : ''"
                  data-testid="top-bar-cache"
                  :disabled="!instance.isActive"
                  icon="$restore"
                  :small="lgAndDown"
                  :text="t('button.cache')"
                  @click="emit('action-button-clearcache', instance)"
                />

                <BaseIconButton
                  v-if="instance.hasDeleteInstancePrivilege()"
                  class="top-bar__btn"
                  color="error"
                  data-testid="top-bar-delete"
                  icon="$xcircle"
                  :text="deleteButtonText(instance, t)"
                  @click="emit('action-button-delete', instance)"
                />
              </div>
            </div>
          </v-row>

          <InstanceTopBarTabs
            v-if="instance.isActive"
            :instance="instance"
          />
        </v-container>
      </div>
    </template>

    <template v-else>
      <TopBarSkeleton />
    </template>
  </div>
</template>

<script lang="ts" setup>
  // Layout B (the buttons without Collaborate).
  // Each button emits `action-button-*` to the frame, and the frame wires them. The SetYourDomain modal (trigger, dialog, DNS check) is in
  // TopBarTitle; its `instance-published` comes up through here to the frame. The Collaborate layout (A) is not built yet.
  // Admin Area (`showAdminAreaButton`, `supports_admin_sso`) replaces WP Admin and Log In. Its label
  // is "WP Admin" for a WordPress project and "Admin Area" for a custom app.
  import type { InstanceResource, RawInstance } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import { useDisplay } from 'vuetify'
  import { adminSsoButton, canShowAdminArea, canShowCopy, hasWordPressUpdate, isWordpressProject, PUSH_LEAVE_MESSAGE } from '@/views/projects/project/instance-frame-actions'
  import { deleteButtonText } from '@/entities/project/instance-row-actions'
  import { isPanelAlphaOnlineHost } from '@/entities/project/open-project'
  import SharesLabelBig from '@/entities/project/ui/SharesLabelBig.vue'
  import { useSessionStore } from '@/shared/session/session.store'
  import BaseIconButton from '@/shared/ui/buttons/BaseIconButton.vue'
  import { canShowPreviewSite } from './dns-propagation'
  import InstanceTopBarTabs from './InstanceTopBarTabs.vue'
  import TopBarSkeleton from './TopBarSkeleton.vue'
  import TopBarSubinstanceBar from './TopBarSubinstanceBar.vue'
  import TopBarTitle from './TopBarTitle.vue'

  const props = withDefaults(defineProps<{
    instance: InstanceResource | null
    fetching: boolean
    /** A push diff is loading, to live or to staging (the button spins, the page warns before it is left). */
    pushLoading?: boolean
    /** Admin Area waits for the users (`checkingWpLogin` / `checkingAppLogin`). */
    loginLoading?: boolean
  }>(), {
    pushLoading: false,
    loginLoading: false,
  })

  const emit = defineEmits<{
    'action-button-share': [instance: InstanceResource]
    'action-button-wplogin': [instance: InstanceResource]
    'action-button-applogin': [instance: InstanceResource]
    'action-button-open-project': [instance: InstanceResource]
    'action-button-preview': [instance: InstanceResource]
    'action-button-staging': [instance: InstanceResource]
    'action-button-push-to-live': [instance: InstanceResource]
    'action-button-push-to-staging': [instance: InstanceResource]
    'action-button-copy': [instance: InstanceResource]
    'action-button-update': [instance: InstanceResource]
    'action-button-clearcache': [instance: InstanceResource]
    'action-button-delete': [instance: InstanceResource]
    'instance-published': [instance: RawInstance]
  }>()

  const { t } = useTranslation()
  const { lg, lgAndDown, mdAndDown, smAndDown } = useDisplay()
  const session = useSessionStore()

  const singleServer = computed(() => session.home?.app.single_server?.active === true)

  const isWordpress = computed(() => isWordpressProject(props.instance?.type))

  const adminSso = computed(() => adminSsoButton(isWordpress.value))

  // `openWPLoginModal` (WordPress) / `openAppLoginModal` (custom): the frame wires both to the SSO dialogs.
  function openAdminArea (): void {
    if (!props.instance) {
      return
    }
    if (isWordpress.value) {
      emit('action-button-wplogin', props.instance)
    } else {
      emit('action-button-applogin', props.instance)
    }
  }

  const showAdminArea = computed(() => props.instance !== null && props.instance !== undefined && canShowAdminArea({
    supportsAdminSso: props.instance.supports_admin_sso,
    isWordpress: isWordpress.value,
    hasCreateSsoLinkPrivilege: props.instance.hasCreateSsoLinkPrivilege(),
    hasManageUsersPrivilege: props.instance.hasManageGeneralUsersPrivilege(),
  }))

  const showCopy = computed(() => !singleServer.value && canShowCopy({
    lgAndDown: lgAndDown.value,
    planSettings: props.instance?.plan_settings,
    hasPrivilege: props.instance?.hasCopyInstancePrivilege() ?? false,
  }))

  /** Set by the DNS check of the SetYourDomain modal (in the title), never reset. */
  const isDnsPropagationInProgress = ref(false)

  const showPreviewSiteButton = computed(() => canShowPreviewSite({
    singleServer: singleServer.value,
    hasPrivilege: props.instance?.hasPreviewInstancePrivilege() ?? false,
    providerEnabled: Boolean(session.home?.app?.integrations?.preview_site_provider_enabled),
    dnsPropagationInProgress: isDnsPropagationInProgress.value,
    panelAlphaOnline: isPanelAlphaOnlineHost(props.instance?.url || props.instance?.domain),
  }))

  const updateAvailable = computed(() => hasWordPressUpdate(props.instance?.status))

  // Leaving while a push to live loads asks first.
  function onBeforeUnload (event: BeforeUnloadEvent): string | undefined {
    if (!props.pushLoading) {
      return undefined
    }
    event.preventDefault()
    event.returnValue = PUSH_LEAVE_MESSAGE
    return PUSH_LEAVE_MESSAGE
  }

  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
</script>

<style lang="scss" scoped>
// Legacy V2 `.container` has 12px on top and `.row` a -16px top margin; V4 has 16px and none.
.top-bar__container {
  padding-top: 12px;
  padding-bottom: 12px;

  > .v-row:not(.top-bar__tabs) {
    margin-top: -16px;
    // V4 `.v-row` is a flex container with a 24px `gap`; V2 `.row` had none, so the stacked mobile title and actions sat 24px apart.
    gap: 0;
  }
}

.v-btn--vertical {
  padding-right: 12px;
}
</style>
