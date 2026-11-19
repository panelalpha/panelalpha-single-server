<template>
  <div>
    <v-menu
      v-model="menuOpen"
      close-delay="150"
      :close-on-content-click="false"
      content-class="dns-ssl-menu"
      :location="left ? 'start top' : 'end top'"
      :max-width="308"
      :min-width="308"
      :offset="12"
      open-delay="150"
      open-on-hover
    >
      <template #activator="{ props: activatorProps }">
        <div class="d-flex align-center">
          <v-progress-circular
            v-if="view.kind === 'ssl-order-progress'"
            v-bind="activatorProps"
            color="primary"
            indeterminate
            size="16"
          />

          <v-icon
            v-else-if="view.kind === 'ssl-order-failed'"
            v-bind="activatorProps"
            class="dns-ssl-icon dns-ssl-icon--error"
            icon="$alertwarning"
            size="16"
          />

          <loader
            v-else-if="view.kind === 'loader'"
            v-bind="activatorProps"
            color="primary"
            no-margins
            :size="16"
          />

          <v-icon
            v-else
            v-bind="activatorProps"
            class="dns-ssl-icon"
            :class="`dns-ssl-icon--${icon.color}`"
            :icon="`$${icon.type}`"
            size="16"
          />
        </div>
      </template>

      <div
        v-if="menu.kind === 'ssl-order'"
        class="pa-4"
      >
        <div class="d-flex">
          <v-icon
            :color="menu.color"
            icon="$alertcircle"
            size="20"
          />

          <p :class="`text-${menu.color} px-2 mb-2 p-3`">
            {{ t(menu.textKey, sslKeyOptions(menu.textKey)).replace('{domain}', instance.domain as string) }}
          </p>
        </div>
      </div>

      <div
        v-else-if="menu.kind === 'dns-alert' || menu.kind === 'dns-ignored'"
        class="pa-4"
      >
        <div class="d-flex">
          <v-icon
            v-if="menu.kind === 'dns-ignored'"
            color="gray"
            icon="$okcircle"
            size="20"
          />

          <v-icon
            v-else
            color="error"
            icon="$alertcircle"
            size="20"
          />

          <p
            v-if="menu.kind === 'dns-ignored'"
            class="text--gray-darken1 px-2 mb-2 p-3"
          >
            {{ t('heading.instance.dnsTooltip.alertsIgnored') }}
          </p>

          <p
            v-else
            class="text-error px-2 mb-2 p-3"
          >
            {{ t('heading.instance.dnsTooltip.desc') }}
          </p>
        </div>

        <div class="d-flex">
          <template v-if="menu.kind === 'dns-alert'">
            <AppButton
              class="v-btn--fix-dns ml-7 px-3"
              kind="danger"
              size="small"
              @click="openFixDns"
            >
              <v-icon
                class="mr-1"
                color="white"
                icon="$wrenchRight"
                size="20"
              />

              <span>{{ t('heading.instance.dnsTooltip.button') }}</span>
            </AppButton>

            <AppButton
              class="v-btn--fix-dns ml-7 px-3"
              color="gray"
              kind="primary"
              :loading="togglingDnsAlerts"
              size="small"
              @click="toggleDnsAlerts(false)"
            >
              <span>{{ t('button.ignore') }}</span>
            </AppButton>
          </template>

          <AppButton
            v-else
            class="v-btn--fix-dns ml-7 px-3 mt-7"
            color="gray"
            kind="primary"
            :loading="togglingDnsAlerts"
            size="small"
            @click="toggleDnsAlerts(true)"
          >
            <span>{{ t('button.restoreAlerts') }}</span>
          </AppButton>
        </div>
      </div>

      <div
        v-else
        class="pa-4"
      >
        <div class="d-flex">
          <v-icon
            :color="icon.color"
            :icon="`$${icon.type}`"
            size="20"
          />

          <p :class="icon.color === 'gray' ? 'text--gray-darken1 px-2 mb-2 p-3' : `text-${icon.color} px-2 mb-2 p-3`">
            {{ t(menu.textKey, { url: instance.url, ...sslKeyOptions(menu.textKey) }) }}
          </p>
        </div>
      </div>
    </v-menu>

    <v-dialog
      v-model="fixDnsOpen"
      transition="custom-dialog-transition"
    >
      <div
        class="card-overlay"
        @click="fixDnsOpen = false"
      />

      <v-card class="card-width-560">
        <v-card-title class="pb-6 d-flex justify-space-between align-center">
          <h4 class="font-weight-light">
            {{ t('heading.instance.modal.setDomain.title') }}
          </h4>

          <modal-close-button @click="fixDnsOpen = false" />
        </v-card-title>

        <v-card-text class="pb-8">
          <div class="domain-container">
            <span class="p-3">
              {{ t('heading.instance.modal.setDomain.config.subtitle') }}

              <span class="text--heading font-weight-600">
                {{ instance.domain }}
              </span>
            </span>
          </div>

          <div
            v-if="singleServer && showPreviewSiteCta"
            class="domain-container"
          >
            <span class="p-3">
              {{ t('heading.instance.modal.setDomain.previewSite') }}
            </span>

            <AppButton
              kind="primary"
              size="small"
              @click="openPreviewSite"
            >
              {{ t('heading.instance.modal.setDomain.generateUrl') }}
            </AppButton>
          </div>

          <dns-options
            :cdn-dns-records="instance.cdn_dns_records || []"
            :cdn-pending="cdnDnsPending(instance)"
            :dns-server-records="dnsServerRecords"
            :dns-settings="dnsSettings"
            :documentation-link="documentationLink"
            :domain="instance.domain"
            :has-dns-server="Boolean(instance.service_has_dns)"
            :host-c-names="instance.host_c_names ?? []"
            :ipv4-addresses="instance.getDnsIpv4Addresses() ?? []"
            :nameservers="instance.dns_nameservers ?? []"
            :onboarding-subdomain="instance.onboarding_subdomain"
          />
        </v-card-text>

        <v-card-actions class="d-flex flex-column pb-4 px-8 pt-0">
          <AppButton
            block
            class="dns-fix-close"
            kind="primary"
            size="x-large"
            @click="fixDnsOpen = false"
          >
            {{ t('button.close') }}
          </AppButton>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Outside the Fix DNS dialog: a V4 lazy dialog unmounts its content after it closes, and `openPreviewSite` closes it
         (legacy nested the modal in the dialog, V2 kept closed content mounted). -->
    <preview-site-modal
      v-if="singleServer"
      v-model="previewSiteOpen"
      :instance="instance"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { DnsRecordInput } from '@/entities/domain/ui/dns-options'
  // The SSL order state follows app-lite (it wins on a conflict). The icon, the hover menu
  // (SSL order, DNS alerts with Ignore and Restore, SSL text) and the Fix DNS dialog with `DnsOptions` and the preview box (single server).
  // The menu styles follow lite (`p-3`, `pa-4`); the CDN records and `cdnPending` of app stay.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import DnsOptions from '@/entities/domain/ui/DnsOptions.vue'
  import { verifyDomainResolving } from '@/entities/domain/verify-domain-resolving'
  import { setDnsAlerts } from '@/entities/project/instance-dns.api'
  import { cdnDnsPending } from '@/entities/project/instance-resource'
  import { getDetectedCertificate } from '@/entities/project/instance-ssl.api'
  import { isPanelAlphaOnlineHost } from '@/entities/project/open-project'
  import { sslKeyOptions } from '@/entities/ssl/ssl-order-status'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import ModalCloseButton from '@/shared/ui/modal/ModalCloseButton.vue'
  import { dnsSslIcon, dnsSslMenu, dnsSslView, needsDetectedCertificate, sslInfo } from './dns-ssl-status'
  import PreviewSiteModal from './PreviewSiteModal.vue'

  const props = defineProps<{
    instance: InstanceResource
    hasText?: boolean
    left?: boolean
    /** `session.home.app.single_server.active`: the Fix DNS dialog shows the preview box. The host passes it, the kit does not read the session. */
    singleServer?: boolean
    /** `session.home.app.documentation_link`, shown by `DnsOptions`. */
    documentationLink?: string
  }>()

  const emit = defineEmits<{
    'dns-propagation-in-progress': []
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const loading = ref(true)
  const resolvedCorrectly = ref(true)
  const menuOpen = ref(false)
  const fixDnsOpen = ref(false)
  const previewSiteOpen = ref(false)
  const togglingDnsAlerts = ref(false)
  // The Fix DNS dialog locks the page scroll as the legacy `lockBodyScroll` dialogs do; without it the page behind shifts by 8px.
  useBodyScrollLock(fixDnsOpen)

  // A `*.panelalpha.online` site (WithoutDNS) has no preview box in the Fix DNS dialog.
  const showPreviewSiteCta = computed(() => !isPanelAlphaOnlineHost(props.instance.url || props.instance.domain))

  const ssl = computed(() => sslInfo(props.instance.domain_ssl_details))

  const state = computed(() => ({
    loading: loading.value,
    resolvedCorrectly: resolvedCorrectly.value,
    dnsAlertsEnabled: props.instance.details.dns_alerts_enabled,
    ssl: ssl.value,
    sslOrderStatus: props.instance.ssl_order_status,
  }))

  const view = computed(() => dnsSslView(state.value))
  const menu = computed(() => dnsSslMenu(state.value))
  const icon = computed(() => dnsSslIcon(state.value))

  // The untyped instance fields `DnsOptions` takes: the records of the main zone and the DNS settings of the domain.
  const dnsServerRecords = computed<DnsRecordInput[]>(() =>
    (props.instance.domain_zone_details as { configuration_records?: DnsRecordInput[] } | null | undefined)?.configuration_records ?? [])
  const dnsSettings = computed(() => props.instance.dns_settings as { display_options?: unknown } | null | undefined)

  // The menu closes before the dialog opens, so its overlay does not cover the dialog (legacy kept it open).
  function openFixDns (): void {
    menuOpen.value = false
    fixDnsOpen.value = true
  }

  // The preview is opened from the dialog: the dialog closes, the preview opens.
  function openPreviewSite (): void {
    fixDnsOpen.value = false
    previewSiteOpen.value = true
  }

  async function toggleDnsAlerts (enabled: boolean): Promise<void> {
    togglingDnsAlerts.value = true
    try {
      props.instance.setDnsAlertsEnabled(await setDnsAlerts(props.instance.id, enabled))
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      togglingDnsAlerts.value = false
    }
  }

  async function getDetectedSslCertificate (): Promise<void> {
    try {
      const cert = await getDetectedCertificate(props.instance.hostingId as number, props.instance.domain as string)
      props.instance.setDetectedSslCert(cert)
    } catch {
      // legacy `.catch(() => {})`
    }
  }

  async function refreshSsl (): Promise<void> {
    if (needsDetectedCertificate(props.instance.domain_ssl_details, props.instance.created_at)) {
      await getDetectedSslCertificate()
    }
  }

  async function checkDnsPropagation (): Promise<boolean | undefined> {
    if (props.instance.hasIpAddressInUrl()) {
      return true
    }
    const instance = props.instance
    // Lite: WithoutDNS hosts resolve to the proxy, not the origin IP, so there is no mismatch alert.
    if (isPanelAlphaOnlineHost(instance.url || instance.domain)) {
      resolvedCorrectly.value = true
      instance.setDnsResolveStatus(true)
      return true
    }
    resolvedCorrectly.value = await verifyDomainResolving({
      domain: instance.domain as string,
      onboardingSubdomain: instance.onboarding_subdomain,
      dnsSettings: instance.dns_settings as never,
      hasDnsServer: Boolean(instance.service_has_dns),
      ipv4Addresses: instance.getDnsIpv4Addresses() as string[],
      nameservers: instance.dns_nameservers as string[],
      hostCNames: instance.host_c_names ?? [],
      recordsFromDnsServer: ((instance.domain_zone_details as { configuration_records?: never[] } | undefined)?.configuration_records ?? []),
      eagerDnsVerification: false,
      skipARecordVerification: cdnDnsPending(instance),
    })
    instance.setDnsResolveStatus(resolvedCorrectly.value)
    if (!resolvedCorrectly.value) {
      emit('dns-propagation-in-progress')
    }
  }

  async function getInfo (): Promise<void> {
    if (!props.instance.isActive) {
      return
    }

    await refreshSsl()
    if (ssl.value.certificate_installed === false) {
      await checkDnsPropagation()
    }
    loading.value = false
  }

  onMounted(() => {
    if (!props.instance.host_ip_address) {
      loading.value = false
      resolvedCorrectly.value = false
      return
    }
    void getInfo()
  })
</script>

<style lang="scss" scoped>

// V2 vendor `.v-card__title { flex-wrap: wrap }`: on a narrow screen the X drops under the title instead of squeezing it.
.v-card-title {
  flex-wrap: wrap;
}
// V2 `color="…"` on the icon was a `!important` text class; V4 `text-*` is layered and loses to the global `.v-icon` colour,
// so each state colour is set here.
.v-icon.dns-ssl-icon {
  line-height: 0;

  &--gray {
    color: var(--v-gray-base);
  }

  &--warning {
    color: var(--v-warning-base);
  }

  &--error {
    color: var(--v-error-base);
  }

  &--success {
    color: var(--v-success-base);
  }
}

.domain-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 6px;
  border: 1px solid var(--v-gray-lighten2);
  padding: 16px;
  margin-bottom: 16px;
}

.v-btn.dns-fix-close {
  color: var(--v-white-base);
}
</style>

<style lang="scss">
// The menu is teleported out of this component, so its rules cannot be scoped. V2 menus inherited the app text colour
// (`--v-text-base`), V4 overlays take `rgba(0, 0, 0, .87)` from `_dropdowns.scss`.
.v-menu > .v-overlay__content.dns-ssl-menu.dns-ssl-menu {
  color: var(--v-text-base);
}
</style>
