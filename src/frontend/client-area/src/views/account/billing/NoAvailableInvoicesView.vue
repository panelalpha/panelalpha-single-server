<template>
  <EmptyState
    data-testid="billing-empty"
    :desc="t('heading.billing.noData.text')"
    :title="t('heading.billing.noData.title')"
    variant="intro"
  >
    <template #image>
      <TrialPlanInvoicesIllustration />
    </template>

    <template #action>
      <AppButton
        data-testid="billing-empty-back"
        kind="primary"
        size="x-large"
        :to="preferredSpaBase(session.home)"
      >
        <span class="text-white">
          {{ ' ' + t('button.dashboard.back') + ' ' }}
        </span>
      </AppButton>
    </template>
  </EmptyState>
</template>

<script lang="ts" setup>
  // App links the button to `/instances`, app-lite to `preferredSpaBase`; the port takes app-lite (`preferredSpaBase` gives `/instances` off single-server); styles are the global `_noData.scss`.
  import { useTranslation } from 'i18next-vue'
  import { preferredSpaBase } from '@/shared/session/preferred-spa-base'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import TrialPlanInvoicesIllustration from '@/shared/ui/illustrations/TrialPlanInvoicesIllustration.vue'

  const { t } = useTranslation()
  const session = useSessionStore()
</script>
