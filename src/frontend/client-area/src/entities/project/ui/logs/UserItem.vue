<template>
  <div class="d-flex align-center user-item">
    <user-avatar class="mr-2" :email="user.email" :size="28" />

    <span class="font-weight-bold user-item__name">
      {{ logUsername(user) }}
    </span>

    <v-chip
      v-if="role"
      class="ml-1 font-weight-bold user-item__role"
      size="small"
      variant="flat"
    >
      {{ role }}
    </v-chip>

    <v-chip
      v-else
      class="ml-2 font-weight-bold user-item__role"
      size="small"
      variant="flat"
    >
      {{ t('general.owner') }}
    </v-chip>
  </div>
</template>

<script lang="ts" setup>
  import type { InstanceLogUser } from '@/entities/project/instance-logs.api'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import UserAvatar from '@/shared/ui/user-avatar/UserAvatar.vue'
  import { logUsername, logUserRole } from './instance-log'

  const props = defineProps<{
    user: InstanceLogUser
  }>()

  const { t } = useTranslation()

  const role = computed(() => logUserRole(props.user.role))
</script>

<style lang="scss" scoped>
// Legacy `grey lighten-4` on the role chip (`--v-grey-lighten4`); its text is the project `gray` (`--v-gray-darken1`, #797997 measured on the
// deployed legacy). `variant="flat"` drops the V4 tonal underlay, which would darken the background. The chip is 24px
// high with 12px side padding as in legacy (V4 small: 26px, 10px).
.user-item__role {
  background-color: var(--v-grey-lighten4);
  border: none;
  box-shadow: none;
  color: var(--v-gray-darken1);
  height: 24px;
  padding: 0 12px;
  border-radius: 100px;
}
</style>
