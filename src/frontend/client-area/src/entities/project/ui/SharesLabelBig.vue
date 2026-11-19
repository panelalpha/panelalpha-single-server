<template>
  <v-tooltip
    v-if="items.length > 0"
    :disabled="!allInvitesArePending"
    location="bottom"
    :open-delay="150"
    transition="custom-tooltip"
  >
    <template #activator="{ props: activatorProps }">
      <div
        v-ripple
        v-bind="activatorProps"
        class="share-indicator"
        :class="allInvitesArePending ? 'share-indicator--pending' : ''"
        data-testid="shares-label-big"
      >
        <div
          class="share-indicator__avatars-container"
          :class="{ 'mr-0': items.length === 3 }"
        >
          <v-avatar
            v-for="(item, index) in displayedItems"
            :key="(item.name ?? '') + index"
            class="share-indicator__avatar"
            color="white"
            size="36px"
          >
            <v-img :src="avatarUrl(item.email, 48)" />
          </v-avatar>
        </div>

        <template v-if="hiddenItems">
          +{{ hiddenItems }}
        </template>

        <template v-else-if="items.length < 3">
          {{ items.length }}
        </template>
      </div>
    </template>

    {{ t('message.status.invitation.pending') }}
  </v-tooltip>
</template>

<script lang="ts" setup>
  // The avatar stack of the people the instance is shared
  // with. Shared by the instance top bar; the click (share modal) stays with the host screen.
  import type { InstanceResource, SharedAccessEntry } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { avatarUrl } from '@/shared/ui/user-avatar/avatar-url'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()

  const items = computed<SharedAccessEntry[]>(() => props.instance.sharedAccess ?? [])
  const displayedItems = computed(() => items.value.slice(0, 3))
  const hiddenItems = computed(() => items.value.length - displayedItems.value.length)
  const allInvitesArePending = computed(() => !items.value.some(item => Boolean(item.accepted_at)))
</script>

<style lang="scss" scoped>
.share-indicator {
  align-self: center;
  cursor: pointer;
  position: relative;
  display: flex;
  flex-direction: row;
  background: var(--v-info-lighten5);
  border-radius: 70px;
  color: var(--v-info-base);
  align-items: center;
  padding: 4px 8px;
  font-weight: 700;
  font-size: 16px;
  line-height: 24px;

  &__avatars-container {
    margin-right: 8px;
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;

    .share-indicator__avatar {
      border-color: var(--v-gray-lighten2);
      border-style: solid;
      border-width: 1px;
      position: relative;
    }

    .share-indicator__avatar:not(:first-child) {
      margin-left: -16px;
    }
  }

  &--pending {
    background: var(--v-gray-lighten5);
    color: var(--v-gray-darken1);
    border: 1px dashed var(--v-gray-darken1);
    transition: background-color 0.24s ease, color 0.24s ease, border 0.24s ease;

    &:hover {
      background: var(--v-info-lighten5);
      color: var(--v-info-base);
      border-color: var(--v-info-base);
    }
  }
}
</style>
