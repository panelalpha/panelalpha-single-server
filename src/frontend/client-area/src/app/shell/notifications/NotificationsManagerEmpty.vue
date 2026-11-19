<template>
  <div
    class="notifications-empty"
    data-testid="shell-notifications-empty"
  >
    <NotificationsManagerEmptyIllustration />

    <div class="notifications-empty__text">
      <p class="p-3 font-weight-bold">
        {{ t('message.emptyTable.notification.title') }}
      </p>

      <p class="p-3 text-center mt-1">
        {{ t('message.emptyTable.notification.description') }}
      </p>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import NotificationsManagerEmptyIllustration from '@/shared/ui/illustrations/NotificationsManagerEmptyIllustration.vue'

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.notifications-empty {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  width: 306px;
  height: 217px;
  padding: 16px;

  &__text {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    p {
      margin-bottom: 0px;
      color: map.get(v.$text, heading);
    }
  }

  &__img {
    margin-bottom: 16px;
  }
}
</style>
