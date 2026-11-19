<template>
  <div v-if="header.value === 'last_used_at'">
    <span
      v-if="item.last_used_at === null"
      class="text-disabled font-italic"
    >{{ t('general.never') }}</span>

    <v-tooltip
      v-else
      close-delay="150"
      location="bottom"
      open-delay="150"
    >
      <template #activator="{ props: activatorProps }">
        <span
          v-bind="activatorProps"
          class="mb-0 text--gray-darken1"
        >
          {{ fromNow(item.last_used_at) }}
        </span>
      </template>

      <span>{{ formatDateTime(item.last_used_at) }}</span>
    </v-tooltip>
  </div>

  <div v-else-if="header.value === 'created_at'">
    <v-tooltip
      close-delay="150"
      location="bottom"
      open-delay="150"
    >
      <template #activator="{ props: activatorProps }">
        <span
          v-bind="activatorProps"
          class="mb-0 text--gray-darken1"
        >
          {{ fromNow(item.created_at) }}
        </span>
      </template>

      <span>{{ formatDateTime(item.created_at) }}</span>
    </v-tooltip>
  </div>

  <div
    v-else-if="header.value === 'actions'"
    :class="isMobile ? '' : 'actions-row'"
  >
    <!-- Legacy has no accessible name on the trash icon; aria-label from the tooltip key, pixels unchanged. -->
    <AppButton
      :aria-label="t('reseller.apiTokens.delete')"
      class="reseller-api-token-delete"
      data-testid="reseller-api-token-delete"
      kind="row-action"
      :tooltip="t('reseller.apiTokens.delete')"
      :tooltip-offset="14"
      @click="emit('action-button-delete', item)"
    >
      <v-icon icon="$thrash" />
    </AppButton>
  </div>

  <div v-else>
    {{ (item as unknown as Record<string, unknown>)[header.value] }}
  </div>
</template>

<script lang="ts" setup>
  // `last_used_at` is "never" only for `=== null` (as in legacy), not for any falsy value.
  import type { ResellerApiToken } from '@/views/reseller/reseller.api'
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import { useTranslation } from 'i18next-vue'
  import { formatDateTime } from '@/shared/time/format-date'
  import { fromNow } from '@/shared/time/from-now'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  defineProps<{
    item: ResellerApiToken
    header: LegacySortHeader
    isMobile?: boolean
  }>()
  const emit = defineEmits<{
    'action-button-delete': [token: ResellerApiToken]
  }>()

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
// V2 `::before` focus layer on the icon button is .08 in light; the V4 overlay is .24.
.v-theme--light .v-btn.reseller-api-token-delete:focus-visible > :deep(.v-btn__overlay) {
  opacity: 0.08;
}
</style>
