<template>
  <div>
    <AdvancedPageLayout :title="t('heading.instance.advanced.security.title')">
      <SslCertificateCard
        v-if="instance.hasManageSslPrivilege()"
        :client-ssl-info="clientSslInfo"
        :instance="instance"
        :loading="fetchingSslInfo"
        @ssl-certificate-installed="refreshAfterInstall"
        @ssl-certificate-ordered="onSslCertificateOrdered"
      />

      <ForceHttpsCard
        v-if="instance.hasManageSslPrivilege()"
        :loading="fetchingSslInfo"
        :saving="httpsLoading"
        :settings="sslInfo"
        @toggle="onHttpsToggle"
      />

      <SearchEngineIndexingCard
        v-if="instance.hasManageSearchEngineIndexingPrivilege()"
        :loading="searchEngineIndexingLoading"
        :status="searchEngineIndexingStatus"
        :submitting="searchEngineIndexingSubmitting"
        @toggle="onSearchEngineIndexingToggle"
      />
    </AdvancedPageLayout>

    <AppDialog
      v-model="modalOpen"
      overlay
      persistent
      scroll-lock="mobile"
      transition="custom-dialog-transition"
    >
      <BasicModal
        :buttons="forceRedirectButtons"
        class="card-width-560"
        color="warning"
        icon="$alertwarning"
        :message="forceRedirectMessage"
        :submitting="httpsLoading"
        :title="t('heading.instance.advanced.security.modal.forceRedirect.title')"
        @button-click="onModalButton"
        @modal-close="modalOpen = false"
      />
    </AppDialog>
  </div>
</template>

<script lang="ts" setup>
  import type { SslSettings } from './security.api'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import type { SslInfo } from '@/entities/ssl/ui/ssl-status'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import AdvancedPageLayout from '@/views/projects/project/advanced/ui/AdvancedPageLayout.vue'
  import { useInstanceStore } from '@/views/projects/project/instance.store'
  import { isSslInstalledEventFor, orderStatusAfterSslEvent } from '@/entities/ssl/security-ssl'
  import { getDetectedCertificate, resetCertificateCache } from '@/entities/ssl/ssl-certificates.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { useAppEvent } from '@/shared/events/app-events'
  import { escapeHtml } from '@/shared/format/escape-html'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import ForceHttpsCard from './ForceHttpsCard.vue'
  import SearchEngineIndexingCard from './SearchEngineIndexingCard.vue'
  import { clientSslInfoFromCertificate, otherSharedInstances, sharedDomainMessage } from './security-settings'
  import { getSearchEngineIndexing, getSslSettings, updateSearchEngineIndexing, updateSslSettings } from './security.api'
  import SslCertificateCard from './SslCertificateCard.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()
  const instanceStore = useInstanceStore()

  const fetchingSslInfo = ref(true)
  const sslInfo = ref<SslSettings>({})
  const sslInfoOrg = ref<SslSettings>({})
  const clientSslInfo = ref<SslInfo>({ certificate_installed: false })

  const httpsLoading = ref(false)
  const searchEngineIndexingLoading = ref(false)
  const searchEngineIndexingSubmitting = ref(false)
  const searchEngineIndexingStatus = ref<boolean | null>(null)
  const modalOpen = ref(false)
  const forceRedirectMessage = ref('')
  const forceRedirectButtons = computed(() => [
    { id: 'confirm', label: t('button.confirm'), color: 'warning' },
    cancelButton(t),
  ])

  useBodyScrollLock(modalOpen)

  /** The SSL settings of the domain. A failure alerts and keeps the settings the screen has. */
  async function fetchSslSettings (): Promise<void> {
    try {
      sslInfo.value = await getSslSettings(props.instance.hostingId as number, props.instance.domain ?? '')
      sslInfoOrg.value = { ...sslInfo.value }
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    }
  }

  /** The certificate from the cache. Legacy has no catch here, so a failure keeps the status silently. */
  async function fetchClientCertificate (): Promise<void> {
    try {
      clientSslInfo.value = clientSslInfoFromCertificate(await getDetectedCertificate(props.instance.hostingId as number, props.instance.domain ?? ''))
    } catch {
      // Legacy has no catch either: the certificate status stays as it was.
    }
  }

  /**
   * The settings and the certificate. The loader stays until both requests are done (in
   * lite neither request returns its promise, so the loader went out at once). Both depend only on the
   * hosting id and the domain, so they run side by side (legacy fired them together too).
   */
  async function fetchSsl (): Promise<void> {
    fetchingSslInfo.value = true
    await Promise.all([fetchSslSettings(), fetchClientCertificate()])
    fetchingSslInfo.value = false
  }

  /** The order is cleared, the cache reset and the certificate asked again. */
  function refreshAfterInstall (): void {
    instanceStore.patchSslOrderStatus(orderStatusAfterSslEvent('installed'))
    resetCertificateCache(props.instance.hostingId as number)
    void fetchSsl()
  }

  function onSslCertificateOrdered (): void {
    instanceStore.patchSslOrderStatus(orderStatusAfterSslEvent('ordered'))
  }

  // The root event `ssl-certificate-installed` refreshes only the page's own instance. The SSL
  // privilege check is stricter than that handler; lite checks it only in the self event.
  useAppEvent('ssl-certificate-installed', payload => {
    if (props.instance.hasManageSslPrivilege() && isSslInstalledEventFor(payload, props.instance.id)) {
      refreshAfterInstall()
    }
  })

  /** The PUT, then the settings the server answers with. A failure puts back the last saved settings. */
  async function saveHttpsRedirect (value: boolean): Promise<void> {
    httpsLoading.value = true
    try {
      sslInfo.value = await updateSslSettings(props.instance.hostingId as number, props.instance.domain ?? '', value)
      // A failure puts back the last saved settings, not the ones from before the first change.
      sslInfoOrg.value = { ...sslInfo.value }
      alerts.addAlert({ success: true, successMessage: t('notification.instance.settings.update') })
    } catch (error) {
      sslInfo.value = { ...sslInfoOrg.value }
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      httpsLoading.value = false
    }
  }

  /** Nothing while the domain cannot redirect; the shared-domain modal first when other instances use the domain. */
  function onHttpsToggle (): void {
    if (httpsLoading.value || !sslInfo.value.can_https_redirect) {
      return
    }
    const otherInstances = otherSharedInstances(sslInfo.value, props.instance.id)
    if (otherInstances.length === 0) {
      void saveHttpsRedirect(!sslInfo.value.force_https_redirect)
      return
    }
    forceRedirectMessage.value = sharedDomainMessage(
      t('heading.instance.advanced.security.modal.forceRedirect.info', { domain: escapeHtml(props.instance.domain ?? '') }),
      otherInstances,
    )
    modalOpen.value = true
  }

  function onModalButton (id: string): void {
    modalOpen.value = false
    // Confirm saves the change; lite only flipped the switch locally.
    if (id === 'confirm') {
      void saveHttpsRedirect(!sslInfo.value.force_https_redirect)
    }
  }

  /** The flag of the instance, shown as the switch position. */
  async function fetchSearchEngineIndexingStatus (): Promise<void> {
    searchEngineIndexingLoading.value = true
    try {
      searchEngineIndexingStatus.value = await getSearchEngineIndexing(props.instance.id)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      searchEngineIndexingLoading.value = false
    }
  }

  /**
   * The PUT carries the current flag, and the switch flips only after the server accepts it.
   * A click while a save is in flight is ignored (lite let it through).
   */
  async function onSearchEngineIndexingToggle (): Promise<void> {
    if (searchEngineIndexingSubmitting.value) {
      return
    }
    searchEngineIndexingSubmitting.value = true
    try {
      await updateSearchEngineIndexing(props.instance.id, searchEngineIndexingStatus.value ?? false)
      searchEngineIndexingStatus.value = !searchEngineIndexingStatus.value
      alerts.addAlert({ success: true, successMessage: t('notification.instance.disableSearchEngineIndexing.success') })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      searchEngineIndexingSubmitting.value = false
    }
  }

  onMounted(() => {
    // The SSL requests only with the privilege (lite always asked).
    if (props.instance.hasManageSslPrivilege()) {
      void fetchSsl()
    }
    if (props.instance.hasManageSearchEngineIndexingPrivilege()) {
      void fetchSearchEngineIndexingStatus()
    }
  })
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// The width of 560px on the force-HTTPS `BasicModal`: the global `card-width-560` class
// (`_dialog.scss`); the scoped doubled class tied with the global dialog rule at (0,4,0) and lost on order.

// The list of the other instances. `BasicModal` is written
// directly in this template, so its root carries this view's scope id and the `:deep` rule reaches the `v-html` list.
.basic-modal :deep(ul) {
  margin-top: 16px;
}

.basic-modal :deep(ul) li {
  font-weight: v.$font-weight-semibold;
  position: relative;
  padding-left: 16px;
  color: var(--v-security-modal-list-text);

  &::before {
    content: '';
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--v-security-modal-list-bullet);
    top: calc(50% - 3px);
    left: 0;
  }

  &:not(:last-child) {
    margin-bottom: 6px;
  }
}
</style>
