<template>
  <DataTable
    :actions-sort="false"
    actions-testid="domains-row-actions"
    :custom-filter="matchesValue"
    data-testid="domains-table"
    footer-pages="page"
    :headers="headers"
    :item-class="itemClass ? rowClass : undefined"
    :item-slots="['domain', 'ssl_status', 'type', 'document_root']"
    :items="items"
    :items-loading="itemsLoading"
    :items-per-page="itemsPerPage"
    :list-style="listStyle"
    no-results-testid="domains-no-results"
    :page="page"
    :possible-items-per-page="possibleItemsPerPage"
    :row-attrs="rowAttrs"
    :search-term="searchTerm"
    :sort-by="sortBy"
    :sort-desc="sortDesc"
    @clear-filters="emit('clear-filters')"
    @update:items-per-page="emit('update:items-per-page', $event)"
    @update:page="emit('update:page', $event)"
    @update:sort-by="emit('update:sort-by', $event)"
    @update:sort-desc="emit('update:sort-desc', $event)"
  >
    <template #no-data>
      <slot name="no-data" />
    </template>

    <template #item.domain="{ item }">
      <div>
        <div class="d-flex align-center">
          <a
            class="font-weight-bold"
            data-testid="domains-row-link"
            :href="`https://${asDomain(item).domain}`"
            rel="noopener noreferrer"
            target="_blank"
          >
            {{ asDomain(item).domain }}
          </a>

          <domains-nameserver-checker
            v-if="asDomain(item).nsStatus !== 'ok' && serverAccount"
            :cdn-dns-records="asDomain(item).cdn_dns_records ?? []"
            :dns-server-records="zoneConfigurationRecords(asDomain(item))"
            :dns-settings="service.dns_settings"
            :documentation-link="documentationLink"
            :domain="asDomain(item).domain"
            :has-dns-server="service.dns_server_enabled"
            :ipv4-addresses="serverAccount.ipv4_addresses"
            :nameservers="serverAccount.nameservers"
            :onboarding-subdomain="null"
          />
        </div>

        <span
          v-if="asDomain(item).redirect_enabled"
          class="p-4 text-gray-darken-1"
          data-testid="domains-row-redirect"
        >
          <i18next :translation="t('heading.hosting.domains.redirectedTo')">
            <template #domain>
              <a
                class="domain-link font-weight-bold"
                :href="safeHttpUrl(asDomain(item).redirect_url)"
                rel="noopener noreferrer"
                target="_blank"
              >
                {{ asDomain(item).redirect_url }}
              </a>
            </template>
          </i18next>
        </span>
      </div>
    </template>

    <template #item.ssl_status="{ item }">
      <ssl-cell
        data-testid="domains-row-ssl"
        :item="asDomain(item)"
        @open="emit('action-button-ssl-edit', asDomain(item))"
      />
    </template>

    <template #item.type="{ item }">
      <div class="d-flex">
        <span>{{ asDomain(item).type_text }}</span>
      </div>
    </template>

    <template #item.document_root="{ item }">
      <span class="text-gray-darken-1">{{ asDomain(item).points_to || asDomain(item).document_root }}</span>
    </template>

    <!-- Desktop and the mobile card share this slot. It gets a copy of the row's fields, so the actions take the row of `items`, which the
         table renders and whose loading flags (`editSslButtonLoading`) the buttons read. -->
    <template #actions="row">
      <domain-row-actions
        :item="listRow(asDomain(row))"
        :mobile="mobile"
        :service="service"
        @delete="emit('action-button-delete', $event)"
        @edit="emit('action-button-edit', $event)"
        @set-primary="emit('action-button-set-primary-domain', $event)"
        @ssl-edit="emit('action-button-ssl-edit', $event)"
      />
    </template>

    <template #mobile="{ item }">
      <MobileTableField
        :label="t('table.header.domain')"
        @sort="emit('update:sort-by', headers[0]!)"
      >
        <div>
          <div class="d-flex align-center">
            <a
              class="font-weight-bold"
              data-testid="domains-row-link"
              :href="`https://${asDomain(item).domain}`"
              rel="noopener noreferrer"
              target="_blank"
            >
              {{ asDomain(item).domain }}
            </a>

            <domains-nameserver-checker
              v-if="asDomain(item).nsStatus !== 'ok' && serverAccount"
              :cdn-dns-records="asDomain(item).cdn_dns_records ?? []"
              :dns-settings="service.dns_settings"
              :documentation-link="documentationLink"
              :domain="asDomain(item).domain"
              :has-dns-server="service.dns_server_enabled"
              :host-c-names="serverAccount.host_c_names ?? []"
              :ipv4-addresses="serverAccount.ipv4_addresses"
              is-mobile
              :nameservers="serverAccount.nameservers"
              :onboarding-subdomain="null"
            />
          </div>

          <span
            v-if="asDomain(item).redirect_enabled"
            class="p-4 text-gray-darken-1"
            data-testid="domains-row-redirect"
          >
            <i18next :translation="t('heading.hosting.domains.redirectedTo')">
              <template #domain>
                <a
                  class="domain-link font-weight-bold"
                  :href="safeHttpUrl(asDomain(item).redirect_url)"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {{ asDomain(item).redirect_url }}
                </a>
              </template>
            </i18next>
          </span>
        </div>
      </MobileTableField>

      <MobileTableField
        :label="t('table.header.ssl')"
        @sort="emit('update:sort-by', headers[1]!)"
      >
        <ssl-cell
          data-testid="domains-row-ssl"
          :item="asDomain(item)"
          @open="emit('action-button-ssl-edit', asDomain(item))"
        />
      </MobileTableField>

      <MobileTableField
        :label="t('table.header.type')"
        @sort="emit('update:sort-by', headers[2]!)"
      >
        <span>{{ asDomain(item).type_text }}</span>
      </MobileTableField>

      <MobileTableField
        v-if="!wpCloud"
        :label="t(`table.header.${documentRootHeaderKey}`)"
        @sort="emit('update:sort-by', headers[3]!)"
      >
        <span class="text-gray-darken-1">
          {{ asDomain(item).points_to || asDomain(item).document_root }}
        </span>
      </MobileTableField>
    </template>
  </DataTable>
</template>

<script lang="ts" setup>
  import type { HostingServerAccount, HostingService } from '@/views/hosting/hosting.types'
  import type { HostingDomain } from './domains.types'
  import type { LegacySortBy, LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import DomainsNameserverChecker from '@/entities/domain/ui/DomainsNameserverChecker.vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import DomainRowActions from './DomainRowActions.vue'
  import { matchesValue } from './domains-filter'
  import { isWpCloud, safeHttpUrl, zoneConfigurationRecords } from './domains-list'
  import SslCell from './SslCell.vue'

  const props = withDefaults(defineProps<{
    headers?: LegacySortHeader[]
    items?: HostingDomain[]
    itemsLoading?: boolean
    itemClass?: (item: HostingDomain) => string | undefined
    service: HostingService
    serverAccount?: HostingServerAccount | null
    documentationLink?: string
    searchTerm?: string
    sortBy?: LegacySortBy
    sortDesc?: boolean
    page?: number
    itemsPerPage?: number | string
    listStyle?: number
    possibleItemsPerPage?: Array<Array<number | string>>
  }>(), {
    headers: () => [],
    items: () => [],
    itemsLoading: false,
    itemClass: undefined,
    serverAccount: null,
    documentationLink: '',
    searchTerm: '',
    sortBy: false,
    sortDesc: true,
    page: 1,
    itemsPerPage: 8,
    listStyle: 0,
    possibleItemsPerPage: () => [[8, 16, 24]],
  })

  const emit = defineEmits<{
    'update:sort-by': [value: LegacySortHeader]
    'update:sort-desc': [value: boolean]
    'update:page': [value: number]
    'update:items-per-page': [value: number | string]
    'clear-filters': []
    'action-button-ssl-edit': [item: HostingDomain]
    'action-button-edit': [item: HostingDomain]
    'action-button-delete': [item: HostingDomain]
    'action-button-set-primary-domain': [item: HostingDomain]
  }>()

  const { t } = useTranslation()
  const { mobile } = useDisplay()

  // The mobile label follows the text of the `document_root` header (`pointsTo` in app-lite).
  const documentRootHeaderKey = computed(() => props.headers.find(header => header.value === 'document_root')?.text || 'documentRoot')

  const wpCloud = computed(() => isWpCloud(props.service))

  // V2 `item-class` returned a class string for the row; the table takes it as a function of the row.
  function rowClass (item: Record<string, unknown>): string | undefined {
    return props.itemClass?.(asDomain(item))
  }

  // Every row, desktop and mobile card, is a `domains-row` (a hook of the tests).
  function rowAttrs (): Record<string, string> {
    return { 'data-testid': 'domains-row' }
  }

  // The `#actions` slot gets a copy of the row's fields, so the actions work on the row of `items`, which the table renders.
  function listRow (row: HostingDomain): HostingDomain {
    return props.items.find(item => item.domain === row.domain && item.type === row.type) ?? row
  }

  function asDomain (item: unknown): HostingDomain {
    return item as HostingDomain
  }
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// The look of the table is the one of `DataTable`; only the content of the cells stays here.
// Legacy `.domain-link` reads `map-get($text, heading)` and `map-get($info, primary)`, keys the token maps do not have (a null
// colour, no declaration), so only the plain `a` rule below styles the links.
a {
  color: map.get(v.$text, headings);
  transition: color 0.24s ease;

  &:hover {
    color: map.get(v.$primary, base);
  }
}
</style>
