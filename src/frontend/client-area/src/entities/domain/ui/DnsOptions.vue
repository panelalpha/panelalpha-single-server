<template>
  <div
    v-if="view.visible"
    data-testid="dns-options"
  >
    <h6
      v-if="view.titleVisible"
      class="text--heading font-weight-bold mb-4"
    >
      {{ t('heading.instance.modal.setDomain.config.title') }}
    </h6>

    <div>
      <v-expansion-panels
        v-if="view.showPanels"
        v-model="panel"
        class="v-expansion-panels--dns p-sm"
        rounded
      >
        <v-expansion-panel
          v-if="view.showRecordsPanel"
          :value="0"
        >
          <v-expansion-panel-title
            class="p-d font-weight-600"
            collapse-icon="$plus"
            expand-icon="$plus"
          >
            {{ t('heading.instance.modal.setDomain.config.tab.dnsRecords.title') }}
          </v-expansion-panel-title>

          <v-expansion-panel-text>
            <ol>
              <li>
                {{ t('heading.instance.modal.setDomain.config.tab.dnsRecords.list.first') }}
              </li>

              <li>
                {{ t('heading.instance.modal.setDomain.config.tab.dnsRecords.list.second') }}

                <div
                  v-if="cdnPending"
                  class="well p-d pa-3 mt-1"
                >
                  {{ t('heading.instance.modal.setDomain.config.cdnPending') }}
                </div>

                <div v-if="view.showCdnDnsRecords">
                  <div
                    v-for="(record, index) in view.cdnRecords"
                    :key="`cdn-${index}`"
                    class="well p-d pa-3 mt-1"
                  >
                    <span>
                      {{ t('general.name') }}:
                      <strong>{{ record.name }}</strong>

                      <template v-if="isApexARecord(record, domain)">
                        ({{ t('general.or') }} <strong>@</strong>)
                      </template>

                      <br>{{ t('general.type') }}:
                      <strong>{{ record.type }}</strong>
                      <br>{{ t(`general.${recordTypeLabel(record.type)}`) }}:
                      <strong>{{ record.value }}</strong>
                    </span>
                  </div>
                </div>

                <div v-else-if="view.showARecord">
                  <div
                    v-for="(ipAddress, index) in ipv4Display"
                    :key="index"
                    class="well p-d pa-3 mt-1"
                  >
                    <span>
                      <template v-if="baseDomain">
                        {{ t('general.name') }}:
                        <strong>{{ baseDomain }}</strong>
                        ({{ t('general.or') }} <strong>@</strong>)
                        <br>
                      </template>
                      {{ t('general.type') }}:
                      <strong>A</strong>
                      <br>{{ t('general.address') }}:
                      <strong>{{ ipAddress }}</strong>
                    </span>
                  </div>

                  <div
                    v-if="baseDomain"
                    class="well p-d pa-3 mt-1"
                  >
                    {{ t('general.name') }}:
                    <strong>www.{{ baseDomain }}</strong>
                    <br>{{ t('general.type') }}:
                    <strong>CNAME</strong>
                    <br>{{ t('general.address') }}:
                    <strong>{{ baseDomain }}</strong>
                  </div>
                </div>

                <div v-if="view.showDnsServerRecords">
                  <div
                    v-for="(record, index) in zoneRecords"
                    :key="index"
                    class="well p-d pa-3 mt-1"
                  >
                    <span>
                      {{ t('general.name') }}:
                      <strong>{{ record.name }}</strong>
                      <br>{{ t('general.type') }}:
                      <strong>{{ record.type }}</strong>
                      <br>{{ t(`general.${recordTypeLabel(String(record.type))}`) }}:
                      <strong>{{ record.value }}</strong>
                    </span>
                  </div>
                </div>
              </li>

              <li>
                {{ t('heading.instance.modal.setDomain.config.tab.dnsRecords.list.third') }}
              </li>
            </ol>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel
          v-if="view.showCnameRecord"
          :value="1"
        >
          <v-expansion-panel-title
            class="p-d font-weight-600"
            collapse-icon="$plus"
            expand-icon="$plus"
          >
            {{ t('heading.instance.modal.setDomain.config.tab.cnameRecords.title') }}
          </v-expansion-panel-title>

          <v-expansion-panel-text>
            <ol>
              <li>
                {{ t('heading.instance.modal.setDomain.config.tab.dnsRecords.list.first') }}
              </li>

              <li>
                {{ t('heading.instance.modal.setDomain.config.tab.dnsRecords.list.second') }}

                <div class="well p-d pa-3 mt-1">
                  <span>
                    {{ t('general.name') }}:
                    <strong>{{ baseDomain }}</strong>
                    ({{ t('general.or') }} <strong>@</strong>) <br>{{ t('general.type') }}:
                    <strong>CNAME</strong>
                    <br>{{ t('general.address') }}:
                    <strong>{{ onboardingSubdomain }}</strong>
                    <br>---<br>
                  </span>
                </div>

                <div class="well p-d pa-3 mt-1">
                  {{ t('general.name') }}:
                  <strong>www.{{ baseDomain }}</strong>
                  <br>{{ t('general.type') }}:
                  <strong>CNAME</strong>
                  <br>{{ t('general.address') }}:
                  <strong>{{ baseDomain }}</strong>
                </div>
              </li>

              <li>
                {{ t('heading.instance.modal.setDomain.config.tab.dnsRecords.list.third') }}
              </li>
            </ol>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel
          v-if="view.showNameservers"
          :value="2"
        >
          <v-expansion-panel-title
            class="p-d font-weight-600"
            collapse-icon="$plus"
            expand-icon="$plus"
          >
            {{ t('heading.instance.modal.setDomain.config.tab.nameservers.title') }}
          </v-expansion-panel-title>

          <v-expansion-panel-text>
            <ol class="mb-4">
              <li>{{ t('heading.instance.modal.setDomain.config.tab.dnsRecords.list.first') }}</li>

              <li v-if="currentNameservers.length > 0">
                <span>{{ t('heading.instance.modal.setDomain.config.tab.nameservers.list.first') }}</span>

                <div
                  v-for="(ns, index) in currentNameservers"
                  :key="index"
                  class="well p-d pa-3 mt-1"
                >
                  <strong>{{ ns }}</strong>
                </div>
              </li>

              <li>
                <span>{{ t('heading.instance.modal.setDomain.config.tab.nameservers.list.second') }}</span>

                <div
                  v-for="(ns, index) in nameservers"
                  :key="index"
                  class="well p-d pa-3 mt-1"
                >
                  <strong>{{ ns }}</strong>
                </div>
              </li>

              <li>
                {{ t('heading.instance.modal.setDomain.config.tab.nameservers.list.third') }}
              </li>
            </ol>

            <div class="mt-4 mb-2">
              <strong class="mr-1">{{ t('heading.instance.modal.setDomain.config.tab.nameservers.list.note_label') }}</strong>
              <span>{{ t('heading.instance.modal.setDomain.config.tab.nameservers.list.note_text') }}</span>
            </div>

            <div
              v-if="documentationLink"
              class="mt-4 mb-2"
            >
              <span>{{ t('heading.instance.modal.setDomain.config.tab.nameservers.list.learn_more_text') }}</span>

              <a
                class="ml-1"
                :href="documentationLink"
                rel="noopener"
                target="_blank"
              >{{ t('heading.instance.modal.setDomain.config.tab.nameservers.list.learn_more_link') }}.</a>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // App variant with the CDN records and `cdnPending`; the styling follows app-lite, whose
  // template is the same minus the CDN parts. The shared home of the DNS records the user has to set, for
  // Domains, the Summary nameserver card and the instance DNS menus.
  import type { DnsRecordInput } from './dns-options'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import { resolveNsRecordsByRdap } from '@/entities/domain/dns-google'
  import {
    computedDomain,
    dnsOptionsView,
    dnsServerRecordsToDisplay,
    ipv4AddressesToDisplay,
    isApexARecord,
    recordTypeLabel,
  } from './dns-options'

  const props = withDefaults(defineProps<{
    domain?: string
    onboardingSubdomain?: string | null
    dnsSettings?: { display_options?: unknown } | null
    hasDnsServer?: boolean
    ipv4Addresses?: string[]
    nameservers?: string[]
    hostCNames?: string[]
    dnsServerRecords?: DnsRecordInput[]
    cdnDnsRecords?: DnsRecordInput[]
    cdnPending?: boolean
    hideTitle?: boolean
    /** `store.state.home.app.documentation_link`: the host passes it, the kit does not read the session. */
    documentationLink?: string
  }>(), {
    domain: '',
    onboardingSubdomain: null,
    dnsSettings: null,
    hasDnsServer: false,
    ipv4Addresses: () => [],
    nameservers: () => [],
    hostCNames: () => [],
    dnsServerRecords: () => [],
    cdnDnsRecords: () => [],
    cdnPending: false,
    hideTitle: false,
    documentationLink: '',
  })

  const { t } = useTranslation()

  // Legacy `panel: 0`: the first rendered panel is open. V4 matches the model against the panel `value`.
  const panel = ref<number | undefined>(0)
  const currentNameservers = ref<string[]>([])

  const view = computed(() => dnsOptionsView(props, props.hideTitle))
  const baseDomain = computed(() => computedDomain(props.domain))
  const ipv4Display = computed(() => ipv4AddressesToDisplay(props.ipv4Addresses))
  const zoneRecords = computed(() => dnsServerRecordsToDisplay(props))

  onMounted(async () => {
    if (view.value.showNameservers) {
      currentNameservers.value = await resolveNsRecordsByRdap(props.domain)
    }
  })
</script>

<style lang="scss" scoped>
// Panel level rules of the legacy component: a 1px border instead of the V2 panel shadow (`::before`), the panel content
// without bottom padding. The rules for the panel header (a 60px padding and a radio ring) do not render in V2 (the header is only the
// global `_collapse.scss` row), so they are not ported. V2 `.v-expansion-panels` rounds its panels by 4px; V4 leaves them square.
.v-expansion-panels--dns {
  border-radius: 4px;
}

.v-expansion-panel {
  border: 1px solid var(--v-gray-lighten2);

  &::before,
  &::after {
    display: none;
  }

  &.v-expansion-panel--active {
    border-color: var(--v-primary-base);
  }

  :deep(.v-expansion-panel__shadow) {
    display: none;
  }

  :deep(.v-expansion-panel-text__wrapper) {
    padding-bottom: 0;
  }

  // `_collapse.scss` hides the icon of a lone panel with `.v-icon > svg`, a selector the V4 icon markup does not match.
  &:only-child :deep(.v-expansion-panel-title__icon) {
    display: none;
  }

  // V2 header: 4px corners (the panel's own radius), no border colour of its own.
  :deep(.v-expansion-panel-title) {
    border-radius: 4px 4px 0 0;
    border-color: var(--v-black-base);
  }
}
</style>
