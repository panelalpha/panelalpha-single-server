<template>
  <div
    v-if="variant"
    class="alert-header"
    :class="'variant-' + variant"
    data-testid="shell-trial-info"
  >
    <v-container class="d-flex align-center justify-space-between px-1">
      <div class="alert-header-content d-flex align-center">
        <v-icon
          class="alert-header-content-icon mr-3"
          :color="variantColor"
          icon="$alertwarning"
          size="24"
        />

        <div
          v-if="variant == 'warning'"
          class="alert-header-content-text"
        >
          {{ t('general.trialExpires') }}
          <span class="font-weight-bold"> {{ trialExpiryAt }}. </span>
          {{ t('general.trialUpgradePlan') }}
        </div>

        <div
          v-else-if="variant == 'danger'"
          class="alert-header-content-text"
        >
          <span class="font-weight-bold">
            {{ t('general.trialExpired') }}
          </span>
          {{ t('general.trialExpiredUpgradePlan') }}
        </div>
      </div>

      <div class="alert-header-actions">
        <AppButton
          v-if="upgradeUrl"
          class="ml-4"
          :color="variantColor"
          :href="upgradeUrl"
          kind="primary"
          size="small"
          target="_blank"
        >
          <span class="text-white">{{ t('general.upgradeNow') }}</span>
        </AppButton>
      </div>
    </v-container>
  </div>
</template>

<script lang="ts" setup>
  // `moment(...).fromNow()` is `fromNow` (English only).
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useSessionStore } from '@/shared/session/session.store'
  import { getTrialService, trialUpgradeUrl, trialVariant } from '@/shared/session/trial-rules'
  import { fromNow } from '@/shared/time/from-now'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  const { t } = useTranslation()
  const session = useSessionStore()

  const variant = computed(() => trialVariant(session.services))
  // V2 palette `orange` / `red` base: the V4 theme has no such colours, so a name would resolve to the CSS keyword; the tokens `--v-orange-base` / `--v-red-base` hold the V2 values.
  const variantColor = computed(() => variant.value === 'warning' ? 'var(--v-orange-base)' : (variant.value === 'danger' ? 'var(--v-red-base)' : ''))
  const trialExpiryAt = computed(() => {
    const service = getTrialService(session.services)
    return service?.is_trial ? fromNow(String(service.trial_expiry_at)) : ''
  })
  const upgradeUrl = computed(() => trialUpgradeUrl(session.services))
</script>

<style lang="scss" scoped>
// V2 `.container` padding is 12px (the sides come from `px-1`); V4 `.v-container` is 16px.
.v-container {
  padding-block: 12px;
}

// V2 `small` buttons are 14px text (V4 small is 12px); it decides where "Upgrade Now" wraps on mobile.
.alert-header-actions .v-btn {
  font-size: 14px;
}
</style>
