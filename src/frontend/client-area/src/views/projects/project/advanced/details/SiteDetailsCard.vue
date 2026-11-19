<template>
  <v-col
    cols="12"
    md="6"
    sm="12"
  >
    <v-card
      :class="cardClass"
      elevation="4"
    >
      <v-card-title class="h6 pb-6 font-weight-bold">
        {{ t('heading.instance.advanced.siteDetails.card.title') }}
      </v-card-title>

      <!-- Legacy `.v-card__text` keeps 24px at the bottom; the global `_card.scss` port zeroes it (`padding-bottom: 0`), so `pb-6` restores it. -->
      <v-card-text class="pt-2 pb-6">
        <template v-if="!loading">
          <div class="details-box">
            <div
              class="p-3 details"
              :class="trialClass"
            >
              <span class="details-label">{{ t('general.plan') }}</span>

              <div class="d-flex align-center justify-space-between">
                <div class="details-value font-weight-bold">
                  <span>{{ instance.plan_name }}</span>

                  <span
                    v-if="trial.text"
                    class="font-weight-400"
                  >
                    ({{ trial.text }})</span>

                  <br>
                </div>

                <div class="details-action">
                  <AppButton
                    v-if="upgradeHref"
                    :href="upgradeHref"
                    size="x-small"
                    target="_blank"
                    variant="flat"
                  >
                    <span class="text-white font-weight-bold">{{ t('button.upgrade') }}</span>

                    <v-icon
                      class="ml-2 mr-0"
                      icon="$upgradeIcon"
                      size="20"
                    />
                  </AppButton>
                </div>
              </div>
            </div>

            <div class="p-3 details">
              <span class="details-label">{{ t('heading.instance.advanced.siteDetails.card.site.domain') }}</span>

              <div>
                <span class="details-value heading--text font-weight-bold">
                  {{ instance.domain }}
                </span>
              </div>
            </div>

            <div class="p-3 details">
              <span class="details-label">{{ t('heading.instance.advanced.siteDetails.card.site.url') }}</span>

              <div>
                <a
                  class="details-value text-info font-weight-bold"
                  :href="siteHref || undefined"
                  target="_blank"
                >
                  {{ instance.url }}
                </a>
              </div>
            </div>

            <div
              v-if="showVersion"
              class="p-3 details"
            >
              <span class="details-label">{{ t('heading.instance.advanced.siteDetails.card.site.version') }}</span>

              <div>
                <span class="details-value heading--text font-weight-bold">{{ instance.status.wordpress }}</span>
              </div>
            </div>

            <div class="p-3 details">
              <span class="details-label">{{ t('heading.instance.advanced.siteDetails.card.site.siteName') }}</span>

              <div>
                <span class="details-value heading--text font-weight-bold">
                  <slot name="site-name">{{ instance.title }}</slot>
                </span>
              </div>
            </div>

            <div class="p-3 details">
              <span class="details-label">{{ t('heading.instance.advanced.siteDetails.card.site.created') }}</span>

              <div>
                <span class="details-value heading--text font-weight-bold">{{ instance.created_at_from_now }}</span>
              </div>
            </div>

            <!-- The parent fills the row and says when it shows: hidden for a staging project and with no resources. -->
            <div
              v-if="limitsRow"
              class="p-3 details"
              data-testid="site-details-limits-row"
            >
              <span class="details-label">{{ t('heading.instance.advanced.siteDetails.card.site.limits') }}</span>

              <div>
                <slot name="limits" />
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <v-skeleton-loader type="text@2" />
          <v-skeleton-loader type="text@2" />
          <v-skeleton-loader type="text@2" />
          <v-skeleton-loader type="text@2" />
          <v-skeleton-loader type="text@2" />
        </template>
      </v-card-text>
    </v-card>
  </v-col>
</template>

<script lang="ts" setup>
  // The Site name row shows `instance.title` by default; the Site name editor is passed in through the `site-name` slot (DetailsView fills it).
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { httpUrlOrEmpty } from '@/shared/url/http-url'
  import { showVersionRow, trialState } from './site-details'

  const props = withDefaults(defineProps<{
    instance: InstanceResource
    loading: boolean
    limitsRow?: boolean
  }>(), { limitsRow: false })

  const { t } = useTranslation()

  const trial = computed(() => trialState(props.instance, t))
  const showVersion = computed(() => showVersionRow(props.instance))

  const cardClass = computed(() => {
    if (trial.value.expired) {
      return 'card-plan-expired'
    }
    return trial.value.isTrial ? 'card-plan-expires' : ''
  })

  // The trial colours are the V2 palette values, kept once in the style block below; the V4 theme has no such
  // colours. Values and button share the modifier classes.
  const trialClass = computed(() => {
    if (trial.value.expired) {
      return 'details--expired'
    }
    return trial.value.isTrial ? 'details--expires' : ''
  })

  // API data reaches `:href` only as http(s); anything else is shown without a link.
  const upgradeHref = computed(() => httpUrlOrEmpty(trial.value.upgradeUrl))
  const siteHref = computed(() => httpUrlOrEmpty(props.instance.url))
</script>

<style lang="scss" scoped>
@use './details';

// V2 `warning` / `danger` palette of the trial box: the same values as the tokens.
$trial-expires: var(--v-orange-base);
$trial-expired: var(--v-red-base);

.v-card {
  height: 100%;
  min-height: 364px;

  &.card-plan-expires {
    background-color: var(--v-card-expires-bg);
  }

  &.card-plan-expired {
    background-color: var(--v-card-expired-bg);
  }
}

// V2 `x-small` upgrade button measures 32px (app button height), V4 `x-small` is 24px.
.details-action .v-btn {
  height: 32px;
}

// Trial colours (V2 palette): the only place the trial colours are applied.
.details--expires {
  .details-value {
    color: $trial-expires;
  }

  .details-action .v-btn {
    background-color: $trial-expires;
  }
}

.details--expired {
  .details-value {
    color: $trial-expired;
  }

  .details-action .v-btn {
    background-color: $trial-expired;
  }
}
</style>
