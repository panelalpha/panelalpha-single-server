<template>
  <div :class="isProject ? 'advanced-hosting-page' : undefined">
    <!-- `project` uses the global `.page-title--advanced` frame. -->
    <PageTitle
      filters-testid="domains-controls"
      :filters-visible="items.length > 0"
      :title="t('heading.hosting.domains.title')"
      title-testid="domains-title"
      :variant="isProject ? 'advanced' : 'section'"
    >
      <template
        v-if="selectedAccount && !selectedAccount.diagnostic_mode"
        #filters
      >
        <active-server-account-selector
          v-if="!isProject && service.server_accounts.length > 1"
          v-model="selectedAccount"
          class="mr-4"
          data-testid="domains-account-selector"
          :items="service.server_accounts"
        />

        <data-iterator-filter-controls
          class="my-hostings-search"
          :full-width-lg="false"
          full-width-md
          :full-width-search="false"
          :keys="false"
          :search-term="searchTerm"
          show-search-term
          @update:search-term="handleSearchTermChange"
        />

        <PageAddButton
          data-testid="domains-add"
          :label="t('button.domain.add')"
          @click="actions.openAdd()"
        />
      </template>
    </PageTitle>

    <v-container class="mt-3 px-0">
      <v-row>
        <v-col cols="12">
          <div>
            <hosting-domains-table
              v-if="selectedAccount && !selectedAccount.diagnostic_mode"
              :documentation-link="documentationLink"
              :headers="headers"
              :item-class="itemClass"
              :items="items"
              :items-loading="loading"
              :items-per-page="itemsPerPage"
              :page="page"
              :possible-items-per-page="possibleItemsPerPage"
              :search-term="searchTerm"
              :server-account="selectedAccount"
              :service="service"
              :sort-by="sortBy"
              :sort-desc="sortDesc"
              @action-button-delete="actions.openDelete($event)"
              @action-button-edit="actions.openEdit($event)"
              @action-button-set-primary-domain="actions.openSetPrimary($event)"
              @action-button-ssl-edit="openSslModal"
              @clear-filters="searchTerm = ''"
              @update:items-per-page="changePerPage"
              @update:page="changePage"
              @update:sort-by="changeSortBy"
              @update:sort-desc="changeSortDesc"
            >
              <template #no-data>
                <error-card
                  v-if="loadError !== null"
                  data-testid="domains-load-error"
                  :message="loadError"
                  retryable
                  @retry="reload()"
                />

                <empty-state
                  v-else
                  data-testid="domains-empty"
                  :desc="t('message.emptyTable.domain.description')"
                  :title="t('message.emptyTable.domain.title')"
                >
                  <template #image>
                    <hosting-domains-illustration />
                  </template>

                  <template #action>
                    <page-add-button
                      data-testid="domains-empty-add"
                      :label="t('button.domain.add')"
                      @click="actions.openAdd()"
                    />
                  </template>
                </empty-state>
              </template>
            </hosting-domains-table>
          </div>
        </v-col>
      </v-row>
    </v-container>

    <domains-action-modal
      v-if="selectedAccount"
      :actions="actions"
      :documentation-link="documentationLink"
      :server-account="selectedAccount"
      :service="service"
    />

    <ssl-edit-modal
      ref="sslModal"
      :order-link="orderCustomSslLink"
      @ssl-certificate-installed="onSslCertificateInstalled($event as HostingDomain)"
      @ssl-certificate-ordered="onSslCertificateOrdered($event as HostingDomain)"
    />

    <transfer-domain-modal
      :dns-record="actions.transfer.record"
      :domain="actions.transfer.domain"
      :is-open="actions.transfer.open"
      :service="service"
      @remove-modal="actions.closeTransfer()"
      @transfer-domain="actions.transferDomain()"
    />
  </div>
</template>

<script lang="ts" setup>
  // The SSL parts follow app-lite, and so do the proxy rules behind "Points to": a panelalpha service or single-server.
  import type { HostingServerAccount, HostingService } from '@/views/hosting/hosting.types'
  import type { HostingDomain } from './domains.types'
  import type { SslEditPayload } from '@/entities/ssl/ui/ssl-edit-modal'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, useTemplateRef, watch } from 'vue'
  import { addDomain, deleteDomain, setPrimaryDomain, updateDomain, verifyDomain } from '@/views/hosting/hosting.api'
  import ActiveServerAccountSelector from '@/views/hosting/ui/ActiveServerAccountSelector.vue'
  import { resetCertificateCache } from '@/entities/ssl/ssl-certificates.api'
  import SslEditModal from '@/entities/ssl/ui/SslEditModal.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { useSessionStore } from '@/shared/session/session.store'
  import { useSingleServer } from '@/shared/session/use-single-server'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import ErrorCard from '@/shared/ui/error-card/ErrorCard.vue'
  import HostingDomainsIllustration from '@/shared/ui/illustrations/HostingDomainsIllustration.vue'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { domainHeaders, usesProxyPointsTo } from './domains-list'
  import DomainsActionModal from './DomainsActionModal.vue'
  import HostingDomainsTable from './HostingDomainsTable.vue'
  import TransferDomainModal from './TransferDomainModal.vue'
  import { useDomainActions } from './use-domain-actions'
  import { useDomainsList } from './use-domains-list'

  // `project` is the frame of the project Advanced tab: a different header, no account
  // selector, a reload only for a new, truthy account id and an SSL event filtered by the instance.
  const props = withDefaults(defineProps<{
    service: HostingService
    variant?: 'hosting' | 'project'
    instanceId?: number
  }>(), {
    variant: 'hosting',
    instanceId: undefined,
  })

  const isProject = computed(() => props.variant === 'project')

  // The project frame owns the page's resource (the top bar's address, Set Your Domain, the details cards): a new main
  // domain is its, so the screen just says the switch happened.
  const emit = defineEmits<{ 'primary-domain-set': [] }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const session = useSessionStore()

  const selectedAccount = ref<HostingServerAccount | null>(null)

  // `store.state.home.app.documentation_link`, shown by the DNS dialog of a domain that does not resolve.
  const documentationLink = computed(() => String(session.home?.app?.documentation_link ?? ''))

  const orderCustomSslLink = computed(() => String(session.home?.app?.order_custom_ssl_certificate_link ?? ''))

  const singleServer = useSingleServer()
  const { items, loading, loadError, itemClass, supportedDomainTypes, reload, highlight, onSslCertificateInstalled, onSslCertificateOrdered } = useDomainsList(() => props.service, selectedAccount, {
    singleServer,
    reloadOnIdOnly: isProject.value,
    instanceId: () => (isProject.value ? props.instanceId : undefined),
  })

  const sslModal = useTemplateRef<{ open: (payload: SslEditPayload<HostingDomain>) => Promise<void> }>('sslModal')

  /** The button spins until the dialog is ready. */
  async function openSslModal (row: HostingDomain): Promise<void> {
    row.editSslButtonLoading = true
    try {
      await sslModal.value?.open({
        domain: row.domain,
        serverAccountId: row.serverAccountId || (selectedAccount.value?.id ?? 0),
        sslOrderStatus: row.ssl_order_status || 'none',
        isWpCloud: selectedAccount.value?.server_type === 'wp-cloud',
        sslInstalledCert: row.sslInstalledCert,
        sslDetectedCert: row.sslDetectedCert,
        sourceItem: row,
      })
    } finally {
      row.editSslButtonLoading = false
    }
  }

  const actions = useDomainActions({
    service: () => props.service,
    account: () => selectedAccount.value,
    rows: () => items.value,
    supportedDomainTypes: () => supportedDomainTypes.value,
    reload,
    highlight,
    addDomain,
    updateDomain,
    deleteDomain,
    setPrimaryDomain,
    verifyDomain,
    resetCertificateCache,
    addSuccessAlert: message => alerts.addAlert({ success: true, successMessage: message }),
    addErrorAlert: message => alerts.addAlert({ success: false, errorMessage: message }),
    getErrorMessage,
    t: (key, options) => String(t(key, options as never)),
    refreshInstance: isProject.value ? () => emit('primary-domain-set') : undefined,
  })

  // Legacy `isServerProvided: false`: sort, search and paging stay in the table. There is no start sort (`sortBy: "domain"` is a string
  // and the table reads `sortBy.value`), so the rows keep the order of the server until a header is clicked (the first click sorts desc).
  const {
    page,
    itemsPerPage,
    possibleItemsPerPage,
    sortBy,
    sortDesc,
    searchTerm,
    changePage,
    changePerPage,
    changeSortBy,
    changeSortDesc,
    handleSearchTermChange,
  } = useDataIteratorPageState({ load: () => undefined, serverProvided: false, itemsPerPage: 8, possibleItemsPerPage: [[8, 16, 24]] })

  const headers = computed(() => domainHeaders(props.service, usesProxyPointsTo(props.service, singleServer.value)))

  // Another service, another first account (and a reload through the account watcher).
  watch(() => props.service, service => {
    selectedAccount.value = service.server_accounts[0] ?? null
  })

  selectedAccount.value = props.service.server_accounts[0] ?? null
</script>

<style lang="scss" scoped src="@/views/hosting/hosting-screen.scss" />

<style lang="scss" scoped src="./DomainsView.scss" />
