<template>
  <v-col
    class="security-card align-stretch d-flex responsive-card"
    cols="12"
    md="6"
    sm="6"
    xl="3"
  >
    <v-card
      elevation="4"
      width="100%"
    >
      <v-card-title class="px-6 pb-0 mb-4 h6 font-weight-bold">
        {{ t('heading.instance.siteDetails.security.title') }}
      </v-card-title>

      <v-card-text>
        <div class="d-flex justify-space-between align-center">
          <div class="w-100">
            <BackupAutomaticSwitcher
              as-button
              :editable="instance.automatic_backups_editable === true"
              :free-panel="Boolean(session.home?.app?.community_panel)"
              :instance="instance"
              :loading="automaticBackupsLoading"
              :settings="autoBackupSettings"
              small
              @reload-settings="loadAutomaticBackups"
            />
          </div>
        </div>

        <div class="d-flex justify-space-between align-center mt-3">
          <div class="w-100">
            <p class="mb-0 p-2 gray-text">
              {{ t('general.ssl') }}:
            </p>

            <span class="p-5">
              <v-skeleton-loader
                v-if="sslState === 'loading'"
                class="text-skeleton"
                type="text"
              />

              <PendingSslIndicator
                v-else-if="sslState === 'pending'"
                appearance="compact"
                :domain="sslOrderDomain"
              />

              <span
                v-else-if="sslFetchFailed"
                class="gray-text"
                data-testid="security-ssl-unknown"
              >
                —
              </span>

              <SslIndicator
                v-else
                :fetching="false"
                :is-icon="false"
                :ssl="sslInfo"
              />
            </span>
          </div>

          <span
            v-if="instance.hasManageSslPrivilege()"
            class="d-inline-block"
          >
            <v-tooltip
              :disabled="!isBlocking"
              location="bottom"
              max-width="400"
              open-delay="150"
              transition="custom-tooltip"
            >
              <template #activator="{ props: activatorProps }">
                <span
                  class="d-inline-block"
                  v-bind="isBlocking ? activatorProps : {}"
                >
                  <AppButton
                    class="mt-0 pt-0 security-manage"
                    data-testid="security-ssl-manage"
                    :disabled="isBlocking"
                    kind="secondary"
                    :loading="isBlocking || sslButtonLoading"
                    size="x-small"
                    @click="openSslDialog"
                  >
                    <span class="heading--text font-weight-bold p-4">{{ t('button.manage') }}</span>
                  </AppButton>
                </span>
              </template>

              <span>{{ sslOrderBlockingTooltip }}</span>
            </v-tooltip>
          </span>
        </div>
      </v-card-text>

      <v-card-actions
        v-if="instance.hasManageBackupsPrivilege()"
        class="pt-4"
      >
        <v-tooltip
          :disabled="!storeMissing"
          location="bottom"
          max-width="400"
          open-delay="150"
          transition="custom-tooltip"
        >
          <template #activator="{ props: activatorProps }">
            <span
              class="d-block w-100"
              v-bind="storeMissing ? activatorProps : {}"
            >
              <AppButton
                block
                class="font-weight-bold"
                data-testid="security-create-backup"
                :disabled="storeMissing"
                kind="primary"
                @click="createBackupOpen = true"
              >
                <v-icon
                  icon="$update"
                  size="16"
                />

                {{ t('button.createBackup') }}
              </AppButton>
            </span>
          </template>

          <span
            v-for="line in storeMissingTooltip"
            :key="line.key"
            class="d-block"
            :class="{ 'font-weight-bold': line.strong }"
          >{{ t(line.key, { defaultValue: line.defaultValue }) }}</span>
        </v-tooltip>
      </v-card-actions>
    </v-card>

    <SslEditModal
      ref="sslModal"
      :order-link="orderCustomSslLink"
      @ssl-certificate-installed="onSslCertificateInstalled"
      @ssl-certificate-ordered="onSslCertificateOrdered"
    />

    <CreateBackupModal
      v-model="createBackupOpen"
      :instance="instance"
      :store-missing="storeMissing"
    />
  </v-col>
</template>

<script lang="ts" setup>
  // The lite variant (General of app-lite only). The SSL block is shown
  // for every instance; the Manage button needs `hosting.manage_ssl`. The app variant (certificate select, server
  // certificate row, app gating) is not ported here.
  import type { AutomaticBackupSettings } from '@/entities/project/instance-backups.api'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import type { SslEditPayload } from '@/entities/ssl/ui/ssl-edit-modal'
  import type { SslInfo, SslOrderStatus } from '@/entities/ssl/ui/ssl-status'
  import { useTranslation } from 'i18next-vue'
  import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue'
  import { useInstanceStore } from '@/views/projects/project/instance.store'
  import { getAutomaticBackupSettings } from '@/entities/project/instance-backups.api'
  import { isBackupStoreMissing } from '@/entities/project/ui/backups/automatic-backup'
  import { backupStoreMissingTooltip } from '@/entities/project/ui/backups/backup-store-missing'
  import BackupAutomaticSwitcher from '@/entities/project/ui/backups/BackupAutomaticSwitcher.vue'
  import CreateBackupModal from '@/entities/project/ui/backups/CreateBackupModal.vue'
  import {
    isSslInstalledEventFor,
    orderStatusAfterSslEvent,
    sslBlockState,
    sslInfoFromCertificate,
  } from '@/entities/ssl/security-ssl'
  import {
    getDetectedCertificate,
    getDetectedCertificateByUrl,
    resetCertificateCache,
  } from '@/entities/ssl/ssl-certificates.api'
  import { isSslOrderBlocking } from '@/entities/ssl/ssl-order-status'
  import PendingSslIndicator from '@/entities/ssl/ui/PendingSslIndicator.vue'
  import SslEditModal from '@/entities/ssl/ui/SslEditModal.vue'
  import SslIndicator from '@/entities/ssl/ui/SslIndicator.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { useAppEvent } from '@/shared/events/app-events'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()
  const session = useSessionStore()
  const instanceStore = useInstanceStore()

  const sslModal = useTemplateRef<{ open: (payload: SslEditPayload<InstanceResource>) => Promise<void> }>('sslModal')
  const createBackupOpen = ref(false)

  const automaticBackupsLoading = ref(true)
  const autoBackupSettings = ref<AutomaticBackupSettings>({})
  // No backup store: "Create backup" is blocked. Unknown (loading, failed GET) blocks nothing.
  const storeMissing = computed(() => isBackupStoreMissing(autoBackupSettings.value, props.instance.server_settings?.uses_own_backup_system))
  const storeMissingTooltip = computed(() => backupStoreMissingTooltip('create', Boolean(session.home?.app?.community_panel)))

  const fetchingSslInfo = ref(true)
  const sslInfo = ref<SslInfo>({ certificate_installed: false })
  const sslButtonLoading = ref(false)
  // The certificate request failed (e.g. 429): the state is unknown, so the block shows a dash instead of a false "Disabled".
  const sslFetchFailed = ref(false)

  const sslState = computed(() => sslBlockState({
    fetching: fetchingSslInfo.value,
    orderStatus: props.instance.ssl_order_status as SslOrderStatus,
    sslInfo: sslInfo.value,
  }))
  // An order in flight: the Manage button waits for it.
  const isBlocking = computed(() => isSslOrderBlocking(props.instance.ssl_order_status))
  const sslOrderBlockingTooltip = computed(() => t('tooltip.hosting.dns.status.pending.alert').replace('{domain}', props.instance.domain ?? ''))
  const sslOrderDomain = computed(() => ({ domain: props.instance.domain, ssl_order_status: props.instance.ssl_order_status }))
  const orderCustomSslLink = computed(() => String(session.home?.app?.order_custom_ssl_certificate_link ?? ''))

  /** The settings, then the instance's own backup flag. */
  async function loadAutomaticBackups (): Promise<void> {
    automaticBackupsLoading.value = true
    autoBackupSettings.value = await getAutomaticBackupSettings(props.instance.id)
    props.instance.setAutomaticBackup(autoBackupSettings.value.frequency !== 'never')
    await nextTick()
    automaticBackupsLoading.value = false
  }

  /** The URL decides the endpoint (an IP address has no domain detection). */
  // Only the newest request may write the result, the error flag and the loading state (as `latestInstanceLogsRequest` on Logs).
  let latestSslRequest = 0

  async function fetchSslInfo (): Promise<void> {
    const request = ++latestSslRequest
    fetchingSslInfo.value = true
    sslFetchFailed.value = false
    try {
      const certificate = props.instance.hasIpAddressInUrl()
        ? await getDetectedCertificateByUrl(props.instance.id)
        : await getDetectedCertificate(props.instance.hostingId as number, props.instance.domain ?? '')
      if (request !== latestSslRequest) {
        return
      }
      const info = sslInfoFromCertificate(certificate)
      if (info) {
        sslInfo.value = info
      }
    } catch (error) {
      if (request === latestSslRequest) {
        sslFetchFailed.value = true
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      }
    } finally {
      if (request === latestSslRequest) {
        fetchingSslInfo.value = false
      }
    }
  }

  /** The Manage button spins until the modal is ready. */
  async function openSslDialog (): Promise<void> {
    sslButtonLoading.value = true
    try {
      await sslModal.value?.open({
        domain: props.instance.domain ?? '',
        serverAccountId: props.instance.hostingId as number,
        sslOrderStatus: props.instance.ssl_order_status || 'none',
        isWpCloud: props.instance.hostingServerType === 'wp-cloud',
        sourceItem: props.instance,
      })
    } finally {
      sslButtonLoading.value = false
    }
  }

  /** The order is cleared and the certificate asked again. */
  function refreshAfterInstall (): void {
    instanceStore.patchSslOrderStatus(orderStatusAfterSslEvent('installed'))
    resetCertificateCache(props.instance.hostingId as number)
    void fetchSslInfo()
  }

  function onSslCertificateInstalled (): void {
    refreshAfterInstall()
  }

  function onSslCertificateOrdered (): void {
    instanceStore.patchSslOrderStatus(orderStatusAfterSslEvent('ordered'))
  }

  // On `ssl-certificate-installed` the application of the page refreshes the block.
  useAppEvent('ssl-certificate-installed', payload => {
    if (isSslInstalledEventFor(payload, props.instance.id)) {
      refreshAfterInstall()
    }
  })

  onMounted(() => {
    void loadAutomaticBackups()
    void fetchSslInfo()
  })
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.security-card {
  :deep(.v-input) {
    margin: 0;
    padding: 0;
  }
}

.v-card-title {
  font-size: map.get(v.$headings, h6, font-size);
  line-height: 24px;
}

// V2 `x-small` is 32px (`$btn-sizes`); V4 `x-small` is 24px.
.security-manage.v-btn {
  --v-btn-height: #{map.get(v.$btn-sizes, x-small) * 1px};
}

.text-skeleton.v-skeleton-loader :deep(.v-skeleton-loader__text) {
  max-width: 160px;
  height: 13px;
  padding: 2.5px 0;
}

// Legacy `.security-card::v-deep .v-card__text .gray-text`: the label of `BackupAutomaticSwitcher` is in a child component, so the
// scoped rule has to be deep to reach it.
.security-card :deep(.gray-text) {
  color: var(--v-text-darken2);
}
</style>
