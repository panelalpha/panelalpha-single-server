<template>
  <v-col
    class="pt-4 pb-2"
    cols="12"
  >
    <SettingCard
      :description="t('heading.instance.advanced.security.certificate.subtitle')"
      :loading="loading"
      :title="t('heading.instance.advanced.security.certificate.title')"
    >
      <template #action>
        <span
          v-if="showSslOrder"
          class="p-3 d-flex align-center"
        >
          <PendingSslIndicator :domain="sslOrderDomain" />
        </span>

        <span
          v-else-if="clientSslInfo.certificate_installed"
          class="p-3 d-flex align-center"
          :class="isValidDetectedSslCert(clientSslInfo.certificate) || sslPointsElsewhere(clientSslInfo.certificate) ? '' : 'text-error'"
        >
          {{ t('heading.instance.advanced.security.certificate.label') }}

          <SslIndicator
            class="mx-4"
            :fetching="false"
            :is-icon="false"
            :ssl="clientSslInfo"
          />
        </span>

        <span class="d-inline-block">
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
                  class="security-ssl-manage mt-0 pt-0"
                  data-testid="security-ssl-manage"
                  :disabled="isBlocking"
                  kind="secondary"
                  :loading="isBlocking || sslButtonLoading"
                  size="small"
                  @click="openSslDialog"
                >
                  <span class="heading--text font-weight-bold">{{ t('button.manage') }}</span>
                </AppButton>
              </span>
            </template>

            <span>{{ sslOrderBlockingTooltip }}</span>
          </v-tooltip>
        </span>
      </template>
    </SettingCard>

    <SslEditModal
      ref="sslModal"
      :order-link="orderCustomSslLink"
      @ssl-certificate-installed="emit('ssl-certificate-installed')"
      @ssl-certificate-ordered="emit('ssl-certificate-ordered')"
    />
  </v-col>
</template>

<script lang="ts" setup>
  // The Manage button and the modal follow the General card
  // (`SecurityInfoCard.vue`). The app variant (select of the installed certificate, `EditSslMixin`) is a parity exception and is not ported here.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import type { SslEditPayload } from '@/entities/ssl/ui/ssl-edit-modal'
  import type { SslInfo } from '@/entities/ssl/ui/ssl-status'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, useTemplateRef } from 'vue'
  import { isSslOrderBlocking, isValidDetectedSslCert, shouldShowSslOrderStatus, sslPointsElsewhere } from '@/entities/ssl/ssl-order-status'
  import PendingSslIndicator from '@/entities/ssl/ui/PendingSslIndicator.vue'
  import SslEditModal from '@/entities/ssl/ui/SslEditModal.vue'
  import SslIndicator from '@/entities/ssl/ui/SslIndicator.vue'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import SettingCard from '@/shared/ui/setting-card/SettingCard.vue'

  const props = defineProps<{
    instance: InstanceResource
    loading: boolean
    clientSslInfo: SslInfo
  }>()

  const emit = defineEmits<{
    'ssl-certificate-installed': []
    'ssl-certificate-ordered': []
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()

  const sslModal = useTemplateRef<{ open: (payload: SslEditPayload<InstanceResource>) => Promise<void> }>('sslModal')
  const sslButtonLoading = ref(false)

  // The pending or failed order replaces the certificate label.
  const showSslOrder = computed(() => shouldShowSslOrderStatus(props.instance.ssl_order_status, {
    loading: false,
    sslInfo: props.clientSslInfo,
  }))
  // An order in flight: the Manage button waits for it.
  const isBlocking = computed(() => isSslOrderBlocking(props.instance.ssl_order_status))
  const sslOrderBlockingTooltip = computed(() => t('tooltip.hosting.dns.status.pending.alert').replace('{domain}', props.instance.domain ?? ''))
  const sslOrderDomain = computed(() => ({ domain: props.instance.domain, ssl_order_status: props.instance.ssl_order_status }))
  const orderCustomSslLink = computed(() => String(session.home?.app?.order_custom_ssl_certificate_link ?? ''))

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
</script>
