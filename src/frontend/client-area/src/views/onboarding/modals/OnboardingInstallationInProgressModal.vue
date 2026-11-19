<template>
  <OnboardingDialog
    close-on-back
    data-testid="onboarding-installation-progress-modal"
    fullscreen
    :model-value="modelValue"
  >
    <ProgressScreen>
      <!-- The custom deploy branch: the deploy logs stay on the screen. -->
      <div
        v-if="customDeploy"
        class="custom-deploy d-flex flex-column align-center w-100"
      >
        <div class="d-flex justify-center">
          <BrandLogo
            compact
            :dark-logo="themeStore.darkLogo"
            :logo="themeStore.lightLogo"
          />
        </div>

        <div class="d-flex justify-center pt-10">
          <h1 class="text-center">
            <span v-if="!completed">{{ t('deployLogs.creatingProject') }}</span>

            <span
              v-else-if="!error"
              class="text-primary"
            >
              {{ t('heading.onboarding.installation.title.completed') }}
            </span>

            <span
              v-else
              class="text-error"
            >
              {{ t('heading.onboarding.installation.title.failed') }}
            </span>
          </h1>
        </div>

        <p class="p-1 pt-6 mb-0 text-center heading--text">
          {{ customInfoText }}
        </p>

        <div class="custom-deploy__viewer mt-8 text-left">
          <OnboardingDeployLogsHost
            ref="deployLogs"
            :active="modelValue && !completed"
            :instance-id="instanceId"
            :source="source"
            @terminal="onDeployTerminal"
          />
        </div>

        <div class="d-flex justify-center align-center flex-wrap pt-8 mb-10">
          <template v-if="!completed">
            <AppButton
              v-if="!confirmingCancel"
              class="btn-xx-large"
              :disabled="cancellingDeploy"
              kind="danger"
              size="x-large"
              width="210px"
              @click="confirmingCancel = true"
            >
              {{ t('deployLogs.cancelDeploy') }}
            </AppButton>

            <div
              v-else
              class="d-flex align-center flex-wrap"
            >
              <span class="text-error p-4 mr-2">{{ t('deployLogs.cancelConfirmTitle') }}</span>

              <AppButton
                color="error"
                elevation="0"
                :loading="cancellingDeploy"
                @click="cancelDeploy"
              >
                {{ t('button.confirm') }}
              </AppButton>

              <AppButton
                :disabled="cancellingDeploy"
                variant="text"
                @click="confirmingCancel = false"
              >
                {{ t('button.cancel') }}
              </AppButton>
            </div>

            <AppButton
              class="btn-xx-large ml-6"
              elevation="0"
              size="x-large"
              variant="outlined"
              width="210px"
              @click="emit('go-to-dashboard')"
            >
              {{ t('button.dashboard.back') }}
            </AppButton>
          </template>

          <AppButton
            v-else-if="!error"
            class="btn-xx-large"
            :disabled="!installed && !demo"
            kind="primary"
            size="x-large"
            width="210px"
            @click="manageSite"
          >
            {{ t('button.project.details', { defaultValue: 'Project Details' }) }}
          </AppButton>

          <template v-else>
            <AppButton
              class="btn-xx-large"
              color="gray"
              elevation="0"
              size="x-large"
              variant="outlined"
              width="210px"
              @click="emit('try-again')"
            >
              <span class="heading--text">{{ t('button.try') }}</span>
            </AppButton>

            <AppButton
              class="btn-xx-large ml-6"
              kind="primary"
              size="x-large"
              width="210px"
              @click="emit('go-to-dashboard')"
            >
              {{ t('button.dashboard.back') }}
            </AppButton>
          </template>
        </div>
      </div>

      <template v-else>
        <ProgressCard :status="progressStatus">
          <template #logo>
            <BrandLogo
              compact
              :dark-logo="themeStore.darkLogo"
              :logo="themeStore.lightLogo"
            />
          </template>

          <template #title>
            <span
              v-if="completed && !error"
              class="text-center text-primary"
            >
              {{ t('heading.onboarding.installation.title.completed') }}
            </span>

            <span
              v-else-if="completed && error"
              class="text-center text-error"
            >
              {{ t('heading.onboarding.installation.title.failed') }}
            </span>

            <span
              v-if="!completed"
              class="text-center"
            >
              {{ t('heading.onboarding.installation.subtitle.inProgress') }}
            </span>

            <span
              v-else-if="!error"
              class="text-center"
            >
              {{ t('heading.onboarding.installation.subtitle.completed') }}
            </span>

            <span
              v-else
              class="text-center"
            >
              {{ t('heading.onboarding.installation.subtitle.failed') }}
            </span>
          </template>

          <img
            v-if="!completed"
            alt=""
            :src="partialLogoUrl"
          >

          <img
            v-if="completed && !error"
            alt=""
            :src="checkUrl"
          >

          <img
            v-if="completed && error"
            alt=""
            :src="failedUrl"
          >

          <template #media>
            <v-img
              height="315px"
              position="center top"
              :src="theme?.screenshot_url"
              width="100vw"
            />
          </template>

          <template #actions>
            <div
              v-if="showDnsBox"
              class="success-box mt-8"
            >
              <p class="font-weight-600 mb-0">
                <i18next :translation="t('heading.onboarding.installation.info.setDnsRecords')">
                  <template #domain>
                    <a
                      class="font-weight-600"
                      :href="installed?.url ?? undefined"
                      target="_blank"
                    >{{ installed?.domain }}</a>
                  </template>
                </i18next>
              </p>

              <DnsOptions
                :cdn-dns-records="installed?.cdn_dns_records ?? []"
                :cdn-pending="cdnPending"
                class="mt-3 installation-card__dns"
                :dns-server-records="installed?.domain_zone?.details?.configuration_records ?? []"
                :dns-settings="installed?.dns_settings"
                :domain="installed?.domain ?? ''"
                :has-dns-server="installed?.service_has_dns"
                hide-title
                :host-c-names="installed?.host_c_names ?? []"
                :ipv4-addresses="installed?.host_ipv4_addresses ?? []"
                :nameservers="installed?.domain_zone?.details?.nameservers ?? []"
                :onboarding-subdomain="installed?.onboarding_subdomain"
              />
            </div>

            <p
              v-if="!showDnsBox"
              class="p-1 pt-8 mb-0 text-center heading--text"
            >
              {{ infoText }}
            </p>

            <div
              class="d-flex pt-8"
              :class="mdAndDown ? 'flex-column' : ''"
            >
              <AppButton
                v-if="!error"
                class="btn-xx-large"
                :class="mdAndDown ? 'mr-0' : ''"
                :disabled="!completed || !installed"
                kind="primary"
                :loading="loggingIn"
                size="x-large"
                width="210px"
                @click="logIn"
              >
                {{ t('button.ssoLogin') }}
              </AppButton>

              <AppButton
                v-if="error"
                class="btn-xx-large"
                :class="mdAndDown ? 'ml-0 mt-4' : ''"
                color="gray"
                elevation="0"
                size="x-large"
                variant="outlined"
                width="210px"
                @click="emit('try-again')"
              >
                <span class="heading--text">{{ t('button.try') }}</span>
              </AppButton>

              <AppButton
                v-if="completed && error"
                class="btn-xx-large mb-10"
                :class="mdAndDown ? 'ml-0 mt-4' : 'ml-6'"
                kind="primary"
                size="x-large"
                width="210px"
                @click="emit('go-to-dashboard')"
              >
                {{ t('button.dashboard.back') }}
              </AppButton>

              <template v-else>
                <AppButton
                  v-if="isSingleServer && !completed"
                  class="btn-xx-large mb-10"
                  :class="mdAndDown ? 'ml-0 mt-4' : 'ml-6'"
                  elevation="0"
                  size="x-large"
                  variant="outlined"
                  width="210px"
                  @click="emit('go-to-dashboard')"
                >
                  {{ t('button.dashboard.back') }}
                </AppButton>

                <AppButton
                  v-else
                  class="btn-xx-large mb-10"
                  :class="mdAndDown ? 'ml-0 mt-4' : 'ml-6'"
                  :disabled="!completed || error || (!installed && !demo)"
                  elevation="0"
                  size="x-large"
                  variant="outlined"
                  width="210px"
                  @click="manageSite"
                >
                  {{ t('button.project.details', { defaultValue: 'Project Details' }) }}
                </AppButton>
              </template>
            </div>
          </template>
        </ProgressCard>
      </template>
    </ProgressScreen>

    <WpAdminSsoModal
      ref="ssoModal"
      :preview-provider-enabled="previewProviderEnabled"
      :single-server="isSingleServer"
    />
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  import type { OnboardingTheme } from '@/views/onboarding/onboarding.api'
  // The standard progress (in-progress, completed, failed and the
  // DNS mismatch box), and with `customDeploy` the deploy branch (live logs, cancel confirmation). The demo account has no instance:
  // its details button emits `manage-first-instance` instead.
  import type { RawInstance } from '@/entities/project/instance-resource'
  import type { DeploySource } from '@/entities/project/ui/deploy/deploy-steps'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, useTemplateRef, watch } from 'vue'
  import { useDisplay } from 'vuetify'
  import checkUrl from '@/views/onboarding/assets/Check.svg'
  import failedUrl from '@/views/onboarding/assets/Failed.svg'
  import partialLogoUrl from '@/views/onboarding/assets/LogoPartialWhite.svg'
  import { installedDnsInput, type InstalledInstancePayload, narrowInstalledInstance } from '@/views/onboarding/installation-events'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import ProgressScreen from '@/views/onboarding/ui/ProgressScreen.vue'
  import DnsOptions from '@/entities/domain/ui/DnsOptions.vue'
  import { verifyDomainResolving } from '@/entities/domain/verify-domain-resolving'
  import { createSsoUrl } from '@/entities/project/instance-actions.api'
  import { cdnDnsPending, toInstanceResource } from '@/entities/project/instance-resource'
  import WpAdminSsoModal from '@/entities/project/ui/WpAdminSsoModal.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { isSingleServerActive } from '@/shared/api/resource-paths'
  import { useSessionStore } from '@/shared/session/session.store'
  import { useThemeStore } from '@/shared/theme/theme.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import BrandLogo from '@/shared/ui/logo/BrandLogo.vue'
  import ProgressCard from '@/shared/ui/progress-card/ProgressCard.vue'
  import OnboardingDeployLogsHost from './OnboardingDeployLogsHost.vue'

  const props = withDefaults(defineProps<{
    modelValue: boolean
    /** The screenshot of the picked template. */
    theme: OnboardingTheme | null
    completed?: boolean
    error?: boolean
    /** The installed project (the wrapper passes `newInstance`). */
    installedInstance?: Record<string, unknown> | null
    installedInstanceDnsMismatch?: boolean
    /** The demo account's progress has no instance, so its details button goes on without one. */
    demo?: boolean
    /** The git and files installations show the live deploy logs instead of the standard progress. */
    customDeploy?: boolean
    /** The custom deploy's source (the git and files installations), for the step names of its live logs. */
    source?: DeploySource | null
    /** A files project's archive has not been uploaded by this browser yet: the deploy cannot continue in the background before that. */
    archivePending?: boolean
    /** The id for the deploy logs: null until the install request returns the instance. */
    instanceId?: number | string | null
  }>(), {
    completed: false,
    error: false,
    installedInstance: null,
    installedInstanceDnsMismatch: false,
    demo: false,
    customDeploy: false,
    source: null,
    archivePending: false,
    instanceId: null,
  })

  const emit = defineEmits<{
    'go-to-dashboard': []
    'try-again': []
    /** The instance page (the wrapper resets the flow and routes). */
    'go-to-details': [id: number | string]
    /** The demo's first-instance event (the wrapper emits it and closes the flow). */
    'manage-first-instance': []
    /** The user confirmed Cancel Deploy: a files create still uploading has to stop (there is no Engine deploy to cancel yet). */
    'cancel-deploy': []
  }>()

  const { t } = useTranslation()
  const { mdAndDown } = useDisplay()
  const session = useSessionStore()
  const themeStore = useThemeStore()
  const alerts = useAlertsStore()
  const ssoModal = useTemplateRef<InstanceType<typeof WpAdminSsoModal>>('ssoModal')
  const deployLogs = useTemplateRef<InstanceType<typeof OnboardingDeployLogsHost>>('deployLogs')
  const loggingIn = ref(false)
  /** The cancel button opens a confirmation row in the modal (not `CancelInstallationDialog`). */
  const confirmingCancel = ref(false)
  const cancellingDeploy = ref(false)

  /** The single-server dashboard is `/projects`, the button names it. */
  const isSingleServer = computed(() => isSingleServerActive())
  const previewProviderEnabled = computed(() => Boolean(session.home?.app?.integrations?.preview_site_provider_enabled))

  const installed = computed<InstalledInstancePayload | null>(() => narrowInstalledInstance(props.installedInstance))
  const cdnPending = computed(() => installed.value ? cdnDnsPending(installed.value) : false)
  const showDnsBox = computed(() => props.installedInstanceDnsMismatch && props.completed && !props.error)

  /** Bar status of the progress card (kit `ProgressCard`): working until the install completes, then success or failed. */
  const progressStatus = computed<'in-progress' | 'success' | 'failed'>(() => {
    if (!props.completed) {
      return 'in-progress'
    }
    return props.error ? 'failed' : 'success'
  })

  const infoText = computed(() => {
    if (!props.completed) {
      return t('heading.onboarding.installation.info.inProgress')
    }
    return props.error ? t('heading.onboarding.installation.info.failed') : t('heading.onboarding.installation.info.completed')
  })

  /** The hint of the custom branch: the live hint while the deploy runs, then the result. */
  const customInfoText = computed(() => {
    if (!props.completed) {
      // A files project's archive is uploaded by this window: only after that does the deployment continue without it.
      if (props.source === 'files' && props.archivePending) {
        return t('deployLogs.uploadingFiles')
      }
      return t('deployLogs.liveHint')
    }
    return props.error ? t('heading.onboarding.installation.info.failed') : t('heading.onboarding.installation.info.completed')
  })

  /** The host cancels, the row closes once it went through. */
  async function cancelDeploy (): Promise<void> {
    cancellingDeploy.value = true
    try {
      // The flow stops a files create whose archive it is still uploading; a posted deploy is the host's to cancel.
      emit('cancel-deploy')
      const cancelled = await deployLogs.value?.cancel()
      if (cancelled) {
        confirmingCancel.value = false
      }
    } finally {
      cancellingDeploy.value = false
    }
  }

  /** The deploy reached a terminal status, so the cancel confirmation closes. */
  function onDeployTerminal (): void {
    confirmingCancel.value = false
  }

  // The install result can arrive before the log's own terminal status.
  watch(() => props.completed, completed => {
    if (completed && props.customDeploy) {
      void deployLogs.value?.readFinal()
    }
  })

  /** The demo emits its event, a real instance opens its page. */
  function manageSite (): void {
    if (props.demo) {
      emit('manage-first-instance')
      return
    }
    if (installed.value) {
      emit('go-to-details', installed.value.id)
    }
  }

  /**
    * Single server: the DNS is checked, the WP admin
   * dialog opens for the one administrator, and the instance page opens. Multi server: the SSO link opens in this window.
   */
  async function logIn (): Promise<void> {
    const instance = installed.value
    if (!instance) {
      return
    }
    loggingIn.value = true
    try {
      if (isSingleServer.value) {
        const resource = toInstanceResource(instance as unknown as RawInstance, session.home)
        resource.setDnsResolveStatus(await verifyDomainResolving(installedDnsInput(instance)))
        void ssoModal.value?.open(resource, [{ label: '', value: 1 }])
        manageSite()
        return
      }
      const { sso_url: url } = await createSsoUrl(instance.id, 1)
      window.location.href = url
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      loggingIn.value = false
    }
  }

</script>

<style lang="scss" scoped>
  .installation-card {
    // Legacy inline `color: #000; text-align: left` on the DNS options.
    .installation-card__dns {
      color: var(--v-black-base);
      text-align: left;
    }
  }

  .custom-deploy {
    &__viewer {
      width: 100%;
    }
  }

  h1 {
    font-size: 40px;
    line-height: 50px;
  }
</style>
