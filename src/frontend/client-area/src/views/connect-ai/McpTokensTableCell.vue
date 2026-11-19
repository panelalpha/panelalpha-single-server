<template>
  <div v-if="header.value === 'name'">
    <span
      :class="item.revoked_at ? 'text-gray' : 'font-weight-600'"
      data-testid="connect-ai-token-name"
    >{{ item.name }}</span>
  </div>

  <div
    v-else-if="header.value === 'token_value'"
    class="d-flex align-center"
  >
    <span class="p-3 mcp-token-value">
      {{ TOKEN_MASK }}
    </span>
  </div>

  <div v-else-if="header.value === 'last_used_at'">
    <span
      v-if="!item.last_used_at"
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

  <div v-else-if="header.value === 'status'">
    <StatusLabel
      :status="item.revoked_at ? 'gray' : 'success'"
      :value="item.revoked_at ? t('heading.connectAi.statusRevoked') : t('heading.connectAi.statusActive')"
    />
  </div>

  <div
    v-else-if="header.value === 'actions'"
    :class="isMobile ? 'd-flex' : 'actions-row'"
  >
    <AppButton
      v-if="!item.revoked_at"
      :aria-label="t('button.connectAi.revoke')"
      data-testid="connect-ai-token-revoke"
      kind="row-action"
      :tooltip="t('button.connectAi.revoke')"
      :tooltip-offset="4"
      @click="emit('action-button-revoke', item)"
    >
      <v-icon icon="$restore" />
    </AppButton>

    <AppButton
      :aria-label="t('button.connectAi.delete')"
      data-testid="connect-ai-token-delete"
      kind="row-action"
      :tooltip="t('button.connectAi.delete')"
      :tooltip-offset="4"
      @click="emit('action-button-delete', item)"
    >
      <v-icon icon="$thrash" />
    </AppButton>
  </div>
</template>

<script lang="ts" setup>
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import type { McpToken } from '@/entities/mcp/mcp.api'
  import { useTranslation } from 'i18next-vue'
  import { formatDateTime } from '@/shared/time/format-date'
  import { fromNow } from '@/shared/time/from-now'
  // The reveal / copy branch of the token column (`_plainText`)
  // is not ported: the list API never returns a token value and `McpTokensSection.addToken` is never called, so legacy always
  // showed the static mask.
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
  import { TOKEN_MASK } from './mcp-tokens-table'

  defineProps<{
    item: McpToken
    header: LegacySortHeader
    isMobile?: boolean
  }>()
  const emit = defineEmits<{
    'action-button-revoke': [token: McpToken]
    'action-button-delete': [token: McpToken]
  }>()

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
.mcp-token-value {
  font-family: ui-monospace, Menlo, monospace;
  word-break: break-all;
}
</style>
