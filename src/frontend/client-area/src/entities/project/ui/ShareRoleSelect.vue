<template>
  <span
    v-if="owner"
    class="share-role__owner p-2"
  >{{ t('general.owner') }}</span>

  <div
    v-else-if="user"
    class="share-role"
  >
    <!-- A `mixed` role (the selected projects disagree) matches no item: the select shows its placeholder, as legacy V2 did. -->
    <select-dropdown
      :aria-label="t('table.header.role')"
      block
      class="share-role__select"
      data-testid="share-row-role"
      :item-text="'text'"
      :item-value="'key'"
      :items="roles"
      :model-value="user.role === 'mixed' ? null : user.role"
      :placeholder="t('heading.instance.modal.sharedAccess.selectRole')"
      @update:model-value="onRole"
    />

    <div
      v-if="user.role === 'mixed'"
      class="share-role__mixed p-xxs mt-1"
    >
      {{ t('heading.instance.modal.sharedAccess.mixedTole.title') }}
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The role cell of the access table: "Owner" on the owner row, else the role picker of the user. The picker has an `aria-label` (legacy had none).
  import type { ShareRole, ShareUser } from './share-instance'
  import { useTranslation } from 'i18next-vue'
  import SelectDropdown from '@/shared/ui/form/SelectDropdown.vue'

  const props = withDefaults(defineProps<{
    roles: ShareRole[]
    user?: ShareUser
    owner?: boolean
  }>(), {
    user: undefined,
    owner: false,
  })

  const emit = defineEmits<{
    change: [user: ShareUser, role: string]
  }>()

  const { t } = useTranslation()

  function onRole (value: unknown): void {
    emit('change', props.user!, (value as { key: string }).key)
  }
</script>

<style lang="scss" scoped>
.share-role {
  min-width: 0;
}

.share-role__owner {
  color: var(--v-gray-darken1);
}

.share-role__mixed {
  color: var(--v-gray-lighten1);
}
</style>
