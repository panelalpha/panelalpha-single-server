<template>
  <div data-testid="instance-general">
    <v-container
      class="general-container px-0"
      :class="mobile ? 'mt-3' : 'mt-9'"
    >
      <v-row
        align="stretch"
        class="general-row mb-4"
        justify="space-between"
      >
        <template v-if="!fetching">
          <template
            v-for="card in cards"
            :key="card"
          >
            <SiteDetailsInfoCard
              v-if="card === 'siteDetails'"
              :instance="instance"
            />

            <InstallationInfoCard
              v-else-if="card === 'installation'"
              :instance="instance"
              @action-button-install-woocommerce="emit('action-button-install-woocommerce', $event)"
              @action-button-retry="emit('action-button-retry', $event)"
              @action-button-update="emit('action-button-update', $event)"
              @action-update-woocommerce="emit('action-update-woocommerce')"
            />

            <GitSourceInfoCard
              v-else-if="card === 'gitSource'"
              :ref="setSourceCard"
              :instance="instance"
              @action-redeploy="openRedeploy"
            />

            <FilesSourceInfoCard
              v-else-if="card === 'filesSource'"
              :ref="setFilesSourceCard"
              :instance="instance"
              @action-upload-version="openUploadVersion"
            />

            <SecurityInfoCard
              v-else-if="card === 'security'"
              :instance="instance"
            />

            <LoadingSpeedInfoCard
              v-else
              :instance="instance"
            />
          </template>
        </template>

        <template v-else>
          <GeneralCardSkeleton
            v-for="variant in GENERAL_SKELETON_VARIANTS"
            :key="variant"
            :variant="variant"
          />
        </template>
      </v-row>

      <template v-if="analyticsEnabled">
        <div class="d-flex justify-space-between align-center mb-8">
          <h4 class="font-weight-light analytics-title">
            {{ t('heading.instance.siteDetails.analytics.title') }}
          </h4>

          <div class="analytics-select">
            <SelectDropdown
              item-text="text"
              item-value="value"
              :items="ANALYTICS_PERIOD_OPTIONS"
              :model-value="period"
              :return-object="false"
              size="xlg"
              @update:model-value="changePeriod"
            />
          </div>
        </div>

        <v-row class="analytics-row">
          <InstanceAnalyticsCardVisitors
            v-if="reportProviderEnabled"
            :loading="visitorsLoading"
            :session="sessionMetric"
            :unique="uniqueMetric"
          />

          <InstanceAnalyticsCardSystem
            :loading="bandwidthLoading"
            :metric="bandwidthMetric"
            :report-provider-enabled="reportProviderEnabled"
          />
        </v-row>
      </template>
    </v-container>

    <git-redeploy-modal
      v-if="hasSourceCard"
      ref="redeployModal"
      :instance="instance"
      @reload-instance="onReloadInstance"
    />

    <files-upload-version-modal
      v-if="hasFilesCard"
      ref="uploadModal"
      :instance="instance"
      @reload-instance="emit('reload-instance')"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { BandwidthReport, VisitorsReport } from '@/entities/project/instance-reporting.api'
  // The grid and the analytics (period select, fetches, normalized series). The
  // update and WooCommerce actions are emitted to the frame, which owns their modals.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, defineAsyncComponent, onMounted, ref, useTemplateRef } from 'vue'
  import { useDisplay } from 'vuetify'
  import {
    ANALYTICS_PERIOD_OPTIONS,
    type AnalyticsPeriod,
    DEFAULT_ANALYTICS_PERIOD,
    nextPeriod,
  } from '@/entities/project/instance-analytics'
  import { getBandwidthReport, getVisitorsReport } from '@/entities/project/instance-reporting.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { useSessionStore } from '@/shared/session/session.store'
  import SelectDropdown from '@/shared/ui/form/SelectDropdown.vue'
  import {
    secondsToHms,
    sizeUnitList,
    bandwidthMetric as toBandwidthMetric,
    visitsMetric,
  } from './analytics'
  import FilesSourceInfoCard from './cards/FilesSourceInfoCard.vue'
  import GeneralCardSkeleton from './cards/GeneralCardSkeleton.vue'
  import GitSourceInfoCard from './cards/GitSourceInfoCard.vue'
  import InstallationInfoCard from './cards/InstallationInfoCard.vue'
  import LoadingSpeedInfoCard from './cards/LoadingSpeedInfoCard.vue'
  import SecurityInfoCard from './cards/SecurityInfoCard.vue'
  import SiteDetailsInfoCard from './cards/SiteDetailsInfoCard.vue'
  import { GENERAL_SKELETON_VARIANTS, visibleGeneralCards, withSecurityCard } from './general-cards'
  import FilesUploadVersionModal from './modals/FilesUploadVersionModal.vue'
  import GitRedeployModal from './modals/GitRedeployModal.vue'

  // The analytics cards draw ApexCharts (~546 kB): a separate chunk, fetched only when the plan has analytics.
  const InstanceAnalyticsCardSystem = defineAsyncComponent(() => import('./cards/InstanceAnalyticsCardSystem.vue'))
  const InstanceAnalyticsCardVisitors = defineAsyncComponent(() => import('./cards/InstanceAnalyticsCardVisitors.vue'))

  const props = withDefaults(defineProps<{
    instance: InstanceResource
    fetching?: boolean
  }>(), {
    fetching: false,
  })

  const emit = defineEmits<{
    'action-button-update': [instance: InstanceResource]
    'action-button-retry': [instance: InstanceResource]
    'action-update-woocommerce': []
    'action-button-install-woocommerce': [instance: InstanceResource]
    'reload-instance': []
  }>()

  const { mobile } = useDisplay()

  // Legacy source card owns the redeploy modal (`await $refs.redeployModal.open()`); here the page owns it and drives the card.
  const redeployModal = useTemplateRef<InstanceType<typeof GitRedeployModal>>('redeployModal')
  const sourceCard = ref<InstanceType<typeof GitSourceInfoCard> | null>(null)

  function setSourceCard (card: unknown): void {
    sourceCard.value = card as InstanceType<typeof GitSourceInfoCard> | null
  }

  const filesSourceCard = ref<InstanceType<typeof FilesSourceInfoCard> | null>(null)

  function setFilesSourceCard (card: unknown): void {
    filesSourceCard.value = card as InstanceType<typeof FilesSourceInfoCard> | null
  }

  async function openRedeploy (): Promise<void> {
    try {
      await redeployModal.value?.open()
    } finally {
      sourceCard.value?.finishRedeploy()
    }
  }

  // Legacy files card owns the upload modal (`$refs.uploadModal.open()`); here the page owns it.
  const uploadModal = useTemplateRef<InstanceType<typeof FilesUploadVersionModal>>('uploadModal')

  function openUploadVersion (): void {
    uploadModal.value?.open()
  }

  // Both source cards read `/source` again (fresh), the Git card also its live status; the frame fetches the instance.
  function onReloadInstance (): void {
    void sourceCard.value?.reloadStatus()
    void filesSourceCard.value?.reloadSource()
    emit('reload-instance')
  }
  const session = useSessionStore()
  const alerts = useAlertsStore()
  const { t } = useTranslation()

  const cards = computed(() => withSecurityCard(visibleGeneralCards(props.instance, session.home)))
  const hasSourceCard = computed(() => cards.value.includes('gitSource'))
  const hasFilesCard = computed(() => cards.value.includes('filesSource'))

  const reportProviderEnabled = computed(() => session.home?.app?.integrations?.report_provider_enabled === true)
  const analyticsEnabled = computed(() => props.instance.hasViewReportsPrivilege())

  const period = ref<AnalyticsPeriod>(DEFAULT_ANALYTICS_PERIOD)
  const visitorsReport = ref<VisitorsReport>({})
  const bandwidthReport = ref<BandwidthReport>({})
  const visitorsLoading = ref(true)
  const bandwidthLoading = ref(true)

  // The unit labels (`general.time.*`, `general.size.*`).
  const timeUnits = computed(() => ({
    h: t('general.time.h'),
    min: t('general.time.min'),
    sec: t('general.time.sec'),
  }))
  const sizeUnits = computed(() => sizeUnitList({
    b: t('general.size.b'),
    kb: t('general.size.kb'),
    mb: t('general.size.mb'),
    gb: t('general.size.gb'),
    tb: t('general.size.tb'),
    pb: t('general.size.pb'),
    eb: t('general.size.eb'),
    zb: t('general.size.zb'),
    yb: t('general.size.yb'),
  }))

  const uniqueMetric = computed(() => visitsMetric(visitorsReport.value.visits, period.value))
  const sessionMetric = computed(() => visitsMetric(
    visitorsReport.value.visits_length,
    period.value,
    total => secondsToHms(total, timeUnits.value),
  ))
  const bandwidthMetric = computed(() => toBandwidthMetric(bandwidthReport.value, period.value, sizeUnits.value))

  async function fetchVisitors (id: number, requested: AnalyticsPeriod): Promise<void> {
    visitorsLoading.value = true
    try {
      const report = await getVisitorsReport(id, requested)
      if (requested === period.value) {
        visitorsReport.value = report
      }
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      if (requested === period.value) {
        visitorsLoading.value = false
      }
    }
  }

  async function fetchBandwidth (id: number, requested: AnalyticsPeriod): Promise<void> {
    bandwidthLoading.value = true
    try {
      const report = await getBandwidthReport(id, requested)
      if (requested === period.value) {
        bandwidthReport.value = report
      }
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      if (requested === period.value) {
        bandwidthLoading.value = false
      }
    }
  }

  // Visitors and bandwidth are fetched, both only under the privilege.
  async function loadAnalytics (): Promise<void> {
    if (!analyticsEnabled.value) {
      return
    }
    const id = props.instance.id
    await Promise.all([fetchVisitors(id, period.value), fetchBandwidth(id, period.value)])
  }

  // The select emits twice, `nextPeriod` ignores the repeat.
  function changePeriod (selected: unknown): void {
    if (!analyticsEnabled.value) {
      return
    }
    const next = nextPeriod(period.value, selected)
    if (next === null) {
      return
    }
    period.value = next
    visitorsLoading.value = true
    bandwidthLoading.value = true
    void loadAnalytics()
  }

  onMounted(() => {
    void loadAnalytics()
  })
</script>

<style lang="scss" scoped>
// Legacy `General.vue` rows are plain `.row`s: V2 `margin: -16px` on every side (`_general.scss`) and no column gap, against the
// `responsive-card` column padding (16px, 12px below `lg`). V4 `.v-row` has a 24px gap and no negative margin, so the cards sat
// 16px to the right (visitors x 48 -> 64, mobile 20 -> 36) and 24px apart vertically. The gap is zeroed and the margin restored on
// both rows. The first row has `mb-4` in legacy (16px bottom margin) and keeps it in the template; the analytics row keeps the -16px
// bottom margin as legacy.
.general-row,
.analytics-row {
  --v-col-gap-x: 0px;
  --v-col-gap-y: 0px;
  margin: -16px;
}

// Legacy: the select is a flex item of its own intrinsic width (316px; 204px next to the wrapped h4 on mobile). V4 collapses the intrinsic
// width of the field, so the basis is stated (it shrinks like the legacy item) and the kit's `max-width` is lifted for this use.
.analytics-select {
  flex: 0 1 316px;
  min-width: 0;

  :deep(.v-input) {
    max-width: none;
    width: 100%;
  }
}

// V2 `.container` padding is 12px; V4 `.v-container` pads 16px (the horizontal padding is `px-0`).
.general-container {
  padding-block: 12px;
}
</style>
