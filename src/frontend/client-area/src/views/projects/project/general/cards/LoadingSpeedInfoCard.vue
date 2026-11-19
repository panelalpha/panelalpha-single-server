<template>
  <info-card :title="t('heading.instance.siteDetails.loadingSpeed.title')">
    <template
      v-if="speedEnabled"
      #title-append
    >
      <a
        class="full-report-link font-weight-600 p-2 d-flex align-center"
        :href="reportHref"
        target="_blank"
      >
        <v-icon
          icon="$externallink"
          size="16"
        />

        <span class="ml-1">{{ t('heading.instance.siteDetails.loadingSpeed.link') }}</span>
      </a>
    </template>

    <v-card-text>
      <v-row>
        <template v-if="defined || pageSpeedEnabled">
          <v-col
            class="mt-4 pt-2 pb-0"
            cols="6"
          >
            <div class="d-flex align-center flex-column">
              <ProgressSpeedChart
                :color="speedColor(desktop)"
                :value="speedValue(defined ? desktop : null)"
              />

              <p
                v-if="defined"
                class="p-2 text-center mt-3 mb-0"
              >
                {{ t('heading.instance.siteDetails.loadingSpeed.desktop') }}
              </p>
            </div>
          </v-col>

          <v-col
            class="mt-4 pt-2 pb-0"
            cols="6"
          >
            <div class="d-flex align-center flex-column">
              <ProgressSpeedChart
                :color="speedColor(mobile)"
                :value="speedValue(defined ? mobile : null)"
              />

              <p
                v-if="defined"
                class="p-2 text-center mt-3 mb-0"
              >
                {{ t('heading.instance.siteDetails.loadingSpeed.mobile') }}
              </p>
            </div>
          </v-col>

          <h6
            v-if="!defined"
            class="p-2 font-weight-light text--heading text-center mb-0 mt-4 w-100"
          >
            {{ t('heading.instance.siteDetails.loadingSpeed.disabled') }}

            <v-tooltip
              location="bottom"
              offset-overflow
              open-delay="150"
              transition="custom-tooltip"
              z-index="99"
            >
              <template #activator="{ props: activatorProps }">
                <a
                  class="text-primary"
                  href="#"
                  v-bind="activatorProps"
                >
                  {{ t('button.why') }}
                </a>
              </template>

              <span>{{ t('tooltip.instance.siteDetails.security.loadingSpeed.noData.first') }}</span>
            </v-tooltip>
          </h6>
        </template>

        <template v-else>
          <v-col class="d-flex align-center justify-center flex-column mt-3 py-3">
            <LoadingSpeedIllustration />

            <div class="p-4 base--text">
              {{ t('heading.instance.siteDetails.loadingSpeed.disabled') }}

              <v-tooltip
                location="bottom"
                offset-overflow
                open-delay="150"
                transition="custom-tooltip"
                z-index="99"
              >
                <template #activator="{ props: activatorProps }">
                  <a
                    class="text-primary"
                    href="#"
                    v-bind="activatorProps"
                  >{{ t('button.why') }}</a>
                </template>

                <span>{{ t('tooltip.instance.siteDetails.security.loadingSpeed.noData.first') }}</span>
              </v-tooltip>
            </div>
          </v-col>
        </template>
      </v-row>
    </v-card-text>
  </info-card>
</template>

<script lang="ts" setup>
  // A missing score renders as `-` (see
  // `loading-speed.ts`); the legacy TypeError on a missing `performance_score` is not reproduced.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { speedCardsEnabled } from '@/views/projects/project/general/general-cards'
  import { isSpeedDefined, speedColor, speedValue, toPercent } from '@/views/projects/project/general/loading-speed'
  import InfoCard from '@/views/projects/project/general/ui/InfoCard.vue'
  import { useSessionStore } from '@/shared/session/session.store'
  import ProgressSpeedChart from '@/shared/ui/charts/ProgressSpeedChart.vue'
  import LoadingSpeedIllustration from './LoadingSpeedIllustration.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()

  const speedEnabled = computed(() => speedCardsEnabled(session.home))
  // The rings need a score or the page speed flag. Single server alone shows
  // only the card and the Full Report link (`speedEnabled`), so a project without a score gets the illustration, not red rings.
  const pageSpeedEnabled = computed(() => session.home?.app?.page_speed_enabled === true)
  const defined = computed(() => isSpeedDefined(props.instance.performance_score))
  const desktop = computed(() => toPercent(props.instance.performance_score?.desktop))
  const mobile = computed(() => toPercent(props.instance.performance_score?.mobile))

  const reportHref = computed(() => `https://pagespeed.web.dev/report?url=${encodeURIComponent(props.instance.url)}`)
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// Legacy scoped `.row { margin: 0 -16px }` (V2 `.row` has no column gap; the V4 `.v-row` 24px gap pushed the wrapped message down).
.v-row {
  --v-col-gap-x: 0px;
  --v-col-gap-y: 0px;
  margin: 0 -16px;
}

.full-report-link {
  color: map.get(v.$primary, base);
  transition: color 0.24s ease;

  .v-icon {
    color: map.get(v.$primary, base);
  }

  &:hover {
    color: map.get(v.$primary, lighten1);

    .v-icon {
      color: map.get(v.$primary, lighten1);
    }
  }
}
</style>
