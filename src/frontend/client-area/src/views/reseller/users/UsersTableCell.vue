<template>
  <div v-if="header.value === 'name'">
    <div class="d-flex align-center">
      <user-avatar
        class="mr-2"
        :email="item.email"
        :size="28"
      />

      <span
        v-if="isNameNotSet(item)"
        class="not-set font-italic"
      >{{ t('general.notSet') }}</span>

      <span v-else>{{ item.name }}</span>
    </div>
  </div>

  <div v-else-if="header.value === 'instances_count'">
    <UserInstancesTooltip
      :instances-count="item.instances_count"
      left
      :user="item"
    >
      <v-chip
        class="label-purple"
        label
        variant="flat"
      >
        {{ item.instances_count }}
      </v-chip>
    </UserInstancesTooltip>
  </div>

  <div
    v-else-if="header.value === 'actions'"
    :class="isMobile ? '' : 'actions-row'"
  >
    <!-- Legacy has no accessible name on the trash icon; aria-label from the tooltip key, pixels unchanged. -->
    <AppButton
      :aria-label="t('button.deleteUser')"
      class="reseller-user-delete"
      data-testid="reseller-user-delete"
      kind="row-action"
      :tooltip="t('button.deleteUser')"
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
  // Avatar and name, the instances chip, the delete action.
  import type { ResellerUser } from '@/views/reseller/reseller.api'
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import { useTranslation } from 'i18next-vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import UserAvatar from '@/shared/ui/user-avatar/UserAvatar.vue'
  import UserInstancesTooltip from './UserInstancesTooltip.vue'
  import { isNameNotSet } from './users-table'

  const emit = defineEmits<{ 'action-button-delete': [item: ResellerUser] }>()

  withDefaults(defineProps<{
    item: ResellerUser
    header: LegacySortHeader
    isMobile?: boolean
  }>(), {
    isMobile: false,
  })

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
// Legacy `.text--disabled` (V2 theme text, 0.38 light / 0.5 dark); V4 has no such class.
.not-set {
  color: var(--v-text-disabled);
}

// Legacy V2 keyboard focus layer of this icon button is the hover one in light (`::before` .08), not the .24 of `_buttons.scss` (dark keeps .24).
.v-theme--light .v-btn.reseller-user-delete:focus-visible > :deep(.v-btn__overlay) {
  opacity: 0.08;
}

// Legacy `.theme--light, .theme--dark { .label-purple … }`: V4 has no `theme--*` classes on the chip, dark goes through `.v-theme--dark`
.label-purple {
  background: var(--v-label-purple-bg);
  color: var(--v-label-purple-text);
  height: 24px;
  padding: 0 4px;
  font-weight: 700;
}
</style>
