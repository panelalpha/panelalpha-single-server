<template>
  <div class="share-person">
    <v-avatar
      class="share-person__avatar"
      size="32px"
    >
      <v-img :src="avatarUrl(email, 48)" />
    </v-avatar>

    <div class="share-person__details">
      <div class="share-person__name">
        <span
          class="share-person__name-text"
          :title="displayName"
        >{{ displayName }}</span>

        <template v-if="user?.invitationPending">
          <v-tooltip
            location="bottom"
            open-delay="150"
            transition="custom-tooltip"
          >
            <template #activator="{ props: activatorProps }">
              <div
                v-bind="activatorProps"
                class="d-inline-flex"
              >
                <StatusLabel
                  class="share-person__badge"
                  status="info"
                  :value="t('message.status.pending')"
                />
              </div>
            </template>

            <div class="d-flex align-center">
              <v-icon
                class="mr-2"
                icon="$hourglassIcon"
                size="16"
              />
              {{ t('tooltip.sharedAccess.invited', { time: user.invited_at_text }) }}
            </div>
          </v-tooltip>

          <AppButton
            :aria-label="resendTooltip"
            class="share-person__resend"
            :class="{ 'share-person__resend--pending': hasPendingChanges }"
            data-testid="share-resend"
            :disabled="!resendAvailable"
            kind="row-action"
            :loading="resending"
            :tooltip="resendTooltip"
            @click="emit('resend', user)"
          >
            <v-icon
              icon="$restore"
              size="16"
            />
          </AppButton>
        </template>
      </div>

      <p
        v-if="name !== email"
        class="share-person__email p-3 mb-0 text-truncate"
        :title="email"
      >
        {{ email }}
      </p>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The person cell of the access table: avatar, name ("(You)" for the signed-in user), the pending badge with the
  // invite date, the resend button and the address. The legacy share dialog drew it twice;
  // the owner row is the same cell without a user. The resend icon has an `aria-label` from its tooltip (legacy had none).
  import type { ShareUser } from './share-instance'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
  import { avatarUrl } from '@/shared/ui/user-avatar/avatar-url'
  import { momentFromNow } from './share-instance'

  const props = withDefaults(defineProps<{
    name: string
    email: string
    /** The user with access; absent on the owner row (no badge, no resend). */
    user?: ShareUser
    currentUserEmail?: string
    hasPendingChanges?: boolean
    resending?: boolean
  }>(), {
    user: undefined,
    currentUserEmail: undefined,
    hasPendingChanges: false,
    resending: false,
  })

  const emit = defineEmits<{
    resend: [user: ShareUser]
  }>()

  const { t } = useTranslation()

  const displayName = computed(() => props.currentUserEmail === props.email
    ? t('table.field.userOwner', { name: props.name })
    : props.name)

  // A missing date is "not available".
  const resendAvailable = computed(() => {
    const at = props.user?.resend_available_at
    return Boolean(at) && new Date(at as string).getTime() < Date.now()
  })

  const resendTooltip = computed(() => resendAvailable.value
    ? t('tooltip.sharedAccess.resend')
    : t('tooltip.sharedAccess.resendNotAvailable', { email: props.email, time: momentFromNow(props.user?.resend_available_at) }))
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

.share-person {
  display: flex;
  align-items: flex-start;
  min-width: 0;

  &__avatar {
    flex-shrink: 0;
    border: 1px solid var(--v-gray-lighten2);
  }

  &__details {
    flex: 1 1 auto;
    min-width: 0;
    margin-left: 12px;
  }

  &__name {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 4px;
    min-width: 0;
    font-weight: v.$font-weight-bold;
    font-size: v.$font-size-sm;
    line-height: v.$line-height-sm;
    color: var(--v-gray-darken2);
  }

  &__name-text {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__badge,
  &__resend {
    flex-shrink: 0;
  }

  &__resend--pending {
    color: var(--v-error-base);
  }

  &__email {
    margin-top: 2px;
    color: var(--v-gray-darken1);
  }
}
</style>
