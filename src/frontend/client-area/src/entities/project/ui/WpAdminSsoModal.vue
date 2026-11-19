<template>
  <v-dialog
    v-model="opened"
    :persistent="persistent"
  >
    <v-card
      class="basic-modal"
      data-testid="sso-modal"
      elevation="4"
    >
      <v-card-title class="d-flex justify-space-between">
        <h6 class="heading--text d-flex align-center">
          <v-icon
            class="sso-modal__icon mr-4"
            color="info"
            :icon="icon"
            size="24"
          />

          <span data-testid="sso-title"> {{ t(titleKey) }}</span>
        </h6>

        <modal-close-button
          v-if="!submitting"
          @click="opened = false"
        />
      </v-card-title>

      <v-card-text>
        <div>
          <v-form
            v-if="view.showUserSelect"
            class="d-flex flex-column"
            data-testid="sso-user-form"
          >
            <div class="d-flex flex-column">
              <label class="base--text mb-2">
                {{ t('form.label.loginAs') }}
                <form-help-icon :text="t('tooltip.instance.ssoLogin.field.user')" />
              </label>

              <div class="last-child">
                <v-select
                  v-model="wpUser"
                  density="compact"
                  hide-details="auto"
                  item-title="label"
                  item-value="value"
                  :items="wpUsers"
                  menu-icon="$dropdown"
                  :menu-props="{ offset: 8 }"
                  variant="outlined"
                />
              </div>
            </div>
          </v-form>

          <p
            v-if="message"
            class="mb-4 p-2"
            data-testid="sso-message"
          >
            {{ message }}
          </p>

          <AppMessage
            v-if="alert"
            class="my-5"
            data-testid="sso-alert"
            icon="$alertcircle"
            variant="warning"
          >
            <span>{{ alert }}</span>
          </AppMessage>
        </div>
      </v-card-text>

      <v-card-actions class="d-flex flex-wrap pb-4">
        <div
          v-if="view.showPreviewButtons"
          class="w-100 pb-2"
        >
          <v-row>
            <v-col>
              <AppButton
                block
                data-testid="sso-preview"
                kind="primary"
                :loading="submitting"
                size="large"
                @click="!submitting && generateSsoPreviewUrl()"
              >
                <template #loader>
                  <loader color="white" no-margins :size="20" />
                </template>

                <span class="p-2 font-weight-600">
                  {{ t('button.loginWithTempUrl') }}
                </span>
              </AppButton>
            </v-col>

            <v-col>
              <AppButton
                block
                color="gray"
                data-testid="sso-direct"
                kind="primary"
                :loading="submitting"
                size="large"
                @click="!submitting && submit()"
              >
                <template #loader>
                  <loader color="white" no-margins :size="20" />
                </template>

                <span class="p-2 font-weight-600">
                  {{ t('button.loginDirectly') }}
                </span>
              </AppButton>
            </v-col>
          </v-row>
        </div>

        <div
          v-else-if="view.showGenerateButton"
          class="w-100 pb-2"
        >
          <AppButton
            block
            data-testid="sso-generate"
            kind="primary"
            :loading="submitting"
            size="large"
            @click="!submitting && submit()"
          >
            <template #loader>
              <loader color="white" no-margins :size="20" />
            </template>

            <span class="p-2 font-weight-600">
              {{ t('button.generateSsoLink') }}
            </span>
          </AppButton>
        </div>

        <div
          v-if="view.showLoginButton"
          class="w-100 pb-2"
        >
          <AppButton
            block
            data-testid="sso-login"
            kind="primary"
            :loading="submitting"
            size="large"
            @click="loginFromFallback"
          >
            <template #loader>
              <loader color="white" no-margins :size="20" />
            </template>

            <span class="p-2 font-weight-600">
              {{ t('button.ssoLogin') }}
            </span>
          </AppButton>
        </div>

        <div class="w-100 pb-2 cancel-btn">
          <AppButton
            block
            class="normal"
            data-testid="sso-cancel"
            kind="text"
            size="large"
            @click="!submitting && close()"
          >
            <span class="p-2 font-weight-bold text--gray-darken1">
              {{ t('button.cancel') }}
            </span>
          </AppButton>
        </div>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  // With the app-lite `noUsers` guards (lite wins on a conflict).
  // The modal runs its own requests (`ShareInstanceModal` precedent): the host only calls `open(instance, options)`. DNS check: the app
  // superset (`getDnsIpv4Addresses` + `cdnDnsPending`), as `DnsSslIndicator`.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { verifyDomainResolving } from '@/entities/domain/verify-domain-resolving'
  import { createAppSsoPreviewUrl, createAppSsoUrl, createSsoPreviewUrl, createSsoUrl } from '@/entities/project/instance-actions.api'
  import { cdnDnsPending } from '@/entities/project/instance-resource'
  import { popupBlocked, shouldAutoSubmit, type SsoUserOption, ssoView } from '@/entities/project/wp-admin-sso'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import FormHelpIcon from '@/shared/ui/form/FormHelpIcon.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import { useMobileScrollLock } from '@/shared/ui/modal/mobile-scroll-lock'
  import ModalCloseButton from '@/shared/ui/modal/ModalCloseButton.vue'

  // The kit takes the app flags from its host: `single_server.active` and `integrations.preview_site_provider_enabled` of `/home`.
  const props = withDefaults(defineProps<{
    singleServer?: boolean
    previewProviderEnabled?: boolean
    // `AppSsoModal` is this dialog with another title, icon and the `/instances/:id/users/:user/sso-*` endpoints.
    icon?: string
    titleKey?: string
    appUsers?: boolean
  }>(), {
    singleServer: false,
    previewProviderEnabled: false,
    icon: '$wordpress',
    titleKey: 'heading.instance.ssoSingleLogin.title',
    appUsers: false,
  })

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const opened = ref(false)
  useMobileScrollLock(opened)
  const persistent = ref(false)
  const submitting = ref(false)
  const submitSuccess = ref(false)
  const checkingDns = ref(false)
  const showLoginButton = ref(false)
  const loginUrl = ref('')
  const wpUsers = ref<SsoUserOption[]>([])
  const wpUser = ref<number | string | null>(null)
  const instance = ref<InstanceResource | null>(null)
  // The resolve status lives on the instance (`setDnsResolveStatus`); a local copy keeps the view reactive to it.
  const dnsStatus = ref<boolean | null>(null)

  const view = computed(() => ssoView({
    userCount: wpUsers.value.length,
    dnsMismatch: dnsStatus.value === false,
    singleServer: props.singleServer,
    previewProviderEnabled: props.previewProviderEnabled,
    submitting: submitting.value,
    checkingDns: checkingDns.value,
    submitSuccess: submitSuccess.value,
    showLoginButton: showLoginButton.value,
  }))

  const message = computed(() => view.value.messageKey ? String(t(view.value.messageKey)) : '')
  const alert = computed(() => view.value.alertKey ? String(t(view.value.alertKey)) : '')

  // Closing from outside (the X, Esc, a click on the scrim) also reports it.
  watch(opened, value => {
    if (!value) {
      emit('close')
    }
  })

  async function ensureDnsResolveStatus (): Promise<void> {
    const current = instance.value
    if (!current || current.getDnsResolveStatus() !== null || current.hasIpAddressInUrl()) {
      return
    }

    checkingDns.value = true
    try {
      const resolvedCorrectly = await verifyDomainResolving({
        domain: current.domain as string,
        onboardingSubdomain: current.onboarding_subdomain,
        dnsSettings: current.dns_settings as never,
        hasDnsServer: Boolean(current.service_has_dns),
        ipv4Addresses: current.getDnsIpv4Addresses() as string[],
        nameservers: current.dns_nameservers as string[],
        hostCNames: current.host_c_names ?? [],
        recordsFromDnsServer: ((current.domain_zone_details as { configuration_records?: never[] } | undefined)?.configuration_records ?? []),
        eagerDnsVerification: false,
        skipARecordVerification: cdnDnsPending(current),
      })
      current.setDnsResolveStatus(resolvedCorrectly)
    } catch {
      current.setDnsResolveStatus(false)
    } finally {
      dnsStatus.value = current.getDnsResolveStatus()
      checkingDns.value = false
    }
  }

  async function open (target: InstanceResource, options: SsoUserOption[]): Promise<void> {
    submitSuccess.value = false
    loginUrl.value = ''
    showLoginButton.value = false
    instance.value = target
    dnsStatus.value = target.getDnsResolveStatus()
    wpUsers.value = options
    if (options.length > 0) {
      wpUser.value = options[0]!.value
    }
    opened.value = true
    await ensureDnsResolveStatus()
    if (!opened.value) {
      return
    }
    if (shouldAutoSubmit(wpUsers.value.length, view.value.alertKey)) {
      void submit()
    }
  }

  function close (): void {
    opened.value = false
  }

  // `window.open` runs in the same tick as the response handling, so the popup blocker lets it through.
  async function openUrl (request: (id: number, user: number | string | null) => Promise<{ sso_url: string }>): Promise<void> {
    const target = instance.value
    if (!target) {
      return
    }
    persistent.value = true
    submitting.value = true
    try {
      const { sso_url: url } = await request(target.id, wpUser.value)
      submitSuccess.value = true
      if (popupBlocked(window.open(url, '_blank'))) {
        loginUrl.value = url
        showLoginButton.value = true
      } else {
        close()
      }
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      persistent.value = false
      submitting.value = false
    }
  }

  function submit (): Promise<void> {
    return openUrl(props.appUsers ? createAppSsoUrl : createSsoUrl)
  }

  function generateSsoPreviewUrl (): Promise<void> {
    return openUrl(props.appUsers ? createAppSsoPreviewUrl : createSsoPreviewUrl)
  }

  function loginFromFallback (): void {
    window.open(loginUrl.value, '_blank')
    close()
  }

  defineExpose({ open })
</script>

<style
  lang="scss"
  scoped
  src="@/shared/ui/modal/BasicModal.scss"
/>

<style lang="scss" scoped>
// Margin -16px and 12px column padding (V2 `.col`). V4 spaces columns
// with a `gap` and has no row margin, so the two buttons of the temporary URL variant sat 4px narrower and 4px apart vertically.
.v-card-actions .v-row {
  --v-col-gap-x: 0px;
  --v-col-gap-y: 0px;
  margin: -16px;
}

.v-card-actions .v-col {
  padding: 12px;
}

// The global `.v-icon` colour beats the `color` prop in V4; legacy `color="info"` on the title icon.
.sso-modal__icon {
  color: var(--v-info-base);
}
</style>
