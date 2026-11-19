<template>
  <EmptyState
    data-testid="hosting-suspended-card"
    :desc="t('general.instancesSuspendedDescription')"
    :title="t('general.instancesSuspended')"
    title-tag="h4"
    variant="intro"
  >
    <template #image>
      <HostingSuspendedIllustration />
    </template>

    <template #action>
      <AppButton
        v-if="suspendedService.plan_upgrade_link"
        class="hosting-suspended-upgrade"
        color="var(--v-orange-base)"
        data-testid="hosting-suspended-upgrade"
        :href="suspendedService.plan_upgrade_link"
        kind="primary"
        size="x-large"
        target="_blank"
      >
        <span class="white--text">{{ upgradeLabel }}</span>
      </AppButton>

      <AppButton
        v-if="supportUrl"
        data-testid="hosting-suspended-support"
        :href="supportUrl"
        kind="secondary"
        size="x-large"
        target="_blank"
      >
        <span class="text--gray-darken1">{{ supportLabel }}</span>
      </AppButton>
    </template>
  </EmptyState>
</template>

<script lang="ts" setup>
  // Styles are the global `_noData.scss`.
  import type { HostingService } from './hosting.types'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import HostingSuspendedIllustration from '@/shared/ui/illustrations/HostingSuspendedIllustration.vue'

  defineProps<{
    suspendedService: HostingService
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()

  const supportUrl = computed(() => session.home?.app?.support_link)

  // Vue 2 kept one space either side of the multi-line label span and the button content is `white-space: break-spaces`, so the
  // legacy label box is wider than the trimmed Vue 3 text.
  const upgradeLabel = computed(() => ` ${t('general.upgradePlan')} `)
  const supportLabel = computed(() => ` ${t('general.contactSupport')} `)
</script>

<style lang="scss" scoped>
  // V2 `.v-btn` text colour under the white label: the theme text token (light `rgba(0, 0, 0, 0.87)`, dark `#FFFFFF`), so one rule serves
  // both themes. `!important` stays because the global button layer (`_buttons.scss`) would otherwise win.
  // The V4 contrast colour for a `color` is solid black, which is why the text colour is set locally.
  .v-btn.hosting-suspended-upgrade {
    color: var(--v-text-default) !important;
    // V2 `.orange` also sets `border-color`; V4 leaves the theme border colour on a `color`. `!important` as above (`_buttons.scss`).
    border-color: var(--v-orange-base) !important;
  }
</style>
