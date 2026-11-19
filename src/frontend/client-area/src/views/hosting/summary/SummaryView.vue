<template>
  <div>
    <PageTitle
      :title="t('heading.hosting.summary.title')"
      title-testid="summary-title"
    >
      <template #title-append>
        <AppButton
          v-if="!loading && hasPrivilege(service, HOSTING_PRIVILEGES.CONTROL_PANEL_SSO)"
          class="p-2 font-weight-bold ml-auto"
          data-testid="summary-sso"
          href="#"
          kind="primary"
          :loading="sso.loading.value"
          size="large"
          target="_blank"
          @click.prevent="sso.open(selectedAccount!.id)"
        >
          <v-icon
            class="text-white"
            icon="$externallink"
            size="22"
          />
          {{ ` ${t('button.login.controlPanel')}` }}
        </AppButton>
      </template>

      <template
        v-if="service.server_accounts.length > 1"
        #filters
      >
        <ActiveServerAccountSelector
          v-model="selectedAccount"
          data-testid="summary-account-selector"
          :items="service.server_accounts"
        />
      </template>
    </PageTitle>

    <v-container class="mt-3 px-0">
      <v-row>
        <v-col
          cols="12"
          md="6"
        >
          <HostingNameserversCard
            :account="selectedAccount"
            :instances="instances"
            :instances-loading="renderFrozen || instancesLoading"
            :service="service"
          />

          <HostingInstancesCard
            :service="service"
            @instances-loaded="instances = $event"
            @instances-loading="instancesLoading = $event"
          />
        </v-col>

        <v-col
          v-if="!selectedAccount?.diagnostic_mode"
          cols="12"
          data-testid="summary-right-column"
          md="6"
        >
          <HostingSummaryCardSkeleton v-if="loading" />

          <HostingSummaryCard
            v-else
            :available-space="planUsageHeader"
            :service="service"
            :usage-data="planUsage"
          >
            <template #action>
              <AppButton
                v-if="service.plan_upgrade_link"
                class="summary-upgrade"
                color="info"
                data-testid="summary-plan-upgrade"
                :href="`${service.plan_upgrade_link}?paupgradeserviceid=${service.id}`"
                kind="link"
                size="x-small"
                target="_blank"
              >
                <span class="font-weight-600">
                  <v-icon
                    class="mr-1"
                    icon="$restorebackup"
                    size="16"
                  />
                  {{ t('button.upgrade') }}
                </span>
              </AppButton>
            </template>
          </HostingSummaryCard>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script lang="ts" setup>
  import type { HostingServerAccount, HostingService } from '@/views/hosting/hosting.types'
  import type { DomainInstance } from './nameserver-records'
  import type { SupportedMetrics, UsageData } from './plan-usage'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { hasPrivilege, HOSTING_PRIVILEGES } from '@/views/hosting/hosting-privileges'
  import { getServerAccountUsage } from '@/views/hosting/hosting.api'
  import ActiveServerAccountSelector from '@/views/hosting/ui/ActiveServerAccountSelector.vue'
  import { useControlPanelSso } from '@/entities/sso/use-control-panel-sso'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { isSingleServer } from '@/shared/session/home-access'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import HostingInstancesCard from './HostingInstancesCard.vue'
  import HostingNameserversCard from './HostingNameserversCard.vue'
  import HostingSummaryCard from './HostingSummaryCard.vue'
  import HostingSummaryCardSkeleton from './HostingSummaryCardSkeleton.vue'
  import { buildPlanUsage, buildPlanUsageHeader } from './plan-usage'

  const props = defineProps<{
    service: HostingService
  }>()

  const { t } = useTranslation()
  const router = useRouter()
  const session = useSessionStore()
  const alerts = useAlertsStore()
  const sso = useControlPanelSso()

  const loading = ref(true)
  const instancesLoading = ref(true)
  const usage = ref<UsageData>({})
  const usageSupported = ref<SupportedMetrics>({})
  const selectedAccount = ref<HostingServerAccount | null>(null)
  const instances = ref<DomainInstance[]>([])
  // Legacy's frozen render after a failed first load: the children keep the props of the last good render (see `reloadData`).
  const renderFrozen = ref(false)

  const planUsageHeader = computed(() => buildPlanUsageHeader(usage.value, usageSupported.value))
  const planUsage = computed(() => buildPlanUsage(usage.value, usageSupported.value))

  /**
   * Legacy sets `loading = false` in `finally`, but with nothing loaded yet the card header throws while rendering
   * (`usage.disk_usage` of `{}`) and Vue 2 keeps the last good render: the skeleton, a spinner in the nameserver card and no SSO
   * button, forever (measured on the legacy deploy). The frozen render also stops the nameserver
   * card from ever seeing that the instances finished, so its spinner never ends. That is modelled directly: after a failure with
   * nothing to show, `loading` stays true and `renderFrozen` keeps the card's `instancesLoading` true. A diagnostic account never
   * loads, so `loading` stays true there too. The next request renders again and clears both.
   */
  async function reloadData (): Promise<void> {
    const account = selectedAccount.value
    if (!account) {
      return
    }
    if (account.diagnostic_mode) {
      alerts.addAlert({ success: false, errorMessage: t('message.hostingAccountInDiagnosticMode') })
      return
    }
    loading.value = true
    renderFrozen.value = false
    try {
      const response = await getServerAccountUsage(account.id)
      usage.value = response.data
      usageSupported.value = response.supported_metrics
      loading.value = false
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      renderFrozen.value = Object.keys(usage.value).length === 0
      loading.value = renderFrozen.value
    }
  }

  // The watchers exist before `created` sets the account, so the first account triggers a second request (legacy fetches usage twice).
  watch(() => props.service, service => {
    selectedAccount.value = service.server_accounts[0] ?? null
  })
  watch(selectedAccount, (value, oldValue) => {
    if (value !== oldValue) {
      void reloadData()
    }
  })

  if (isSingleServer(session.home)) {
    // Single-server installs have no Summary: the frame's first item is Usage.
    void router.push('/hosting/usage')
  } else {
    selectedAccount.value = props.service.server_accounts[0] ?? null
    void reloadData()
  }
</script>

<style lang="scss" scoped src="@/views/hosting/hosting-screen.scss"></style>

<style lang="scss" scoped>
// V2 `x-small` is a 32px, 14px button (the card's own scoped rule shrinks only the Manage links; this one sits in the card's slot).
.v-btn.summary-upgrade {
  height: 32px;
  font-size: 14px;
}
</style>
