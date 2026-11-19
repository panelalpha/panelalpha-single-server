<template>
  <div class="notifications-manager">
    <div class="notifications-manager__content">
      <div
        v-for="(item, index) of notifications"
        :key="item.id + '' + index"
        class="notification"
        :data-testid="index === 0 ? 'shell-notification-first' : undefined"
      >
        <div class="notification__content p-3">
          <template v-if="item.data.html_text">
            <div v-safe-html:rich="item.data.html_text" />
          </template>

          <template v-else>
            <span> {{ item.type }} </span>
          </template>
        </div>

        <div class="notification__info">
          <div
            class="notification__status"
            :class="item.status"
          />

          <div class="notification__time p-3">
            {{ item.created_at_text }}
          </div>

          <v-tooltip
            content-class="notification-dismiss-tooltip"
            location="bottom"
            :offset="4"
            open-delay="150"
            transition="custom-tooltip"
            :z-index="99"
          >
            <template #activator="{ props: tooltipProps }">
              <AppButton
                v-bind="tooltipProps"
                :aria-label="t('button.dismiss')"
                kind="icon"
                @click="emit('remove-notification', item)"
              >
                <v-icon size="16">
                  $close
                </v-icon>
              </AppButton>
            </template>

            {{ t('button.dismiss') }}
          </v-tooltip>
        </div>
      </div>

      <div
        v-if="!store.allNotificationsLoaded && notifications.length >= 10"
        ref="infinite-loader"
        class="infinite-loader"
      >
        <Loader size="24" />
      </div>
    </div>

    <div class="notifications-manager__clear">
      <AppButton
        block
        color="info"
        kind="link"
        @click="emit('clear-all')"
      >
        {{ t('button.notification.clear') }}
      </AppButton>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import { type NotificationItem, useNotificationsStore } from './notifications.store'

  defineProps<{ notifications: NotificationItem[] }>()

  const emit = defineEmits<{
    'remove-notification': [item: NotificationItem]
    'load-next-page': []
    'clear-all': []
  }>()

  const { t } = useTranslation()
  const store = useNotificationsStore()
  const loader = useTemplateRef<HTMLElement>('infinite-loader')

  // The loader is observed only if it exists at mount time.
  let observer: IntersectionObserver | null = null

  onMounted(() => {
    observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) {
        emit('load-next-page')
      }
    }, { root: null, rootMargin: '0px', threshold: 0.1 })

    if (loader.value) {
      observer.observe(loader.value)
    }
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
  })
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.notifications-manager {
  overflow: overlay;

  &__content {
    padding: 5px 0;
    max-height: 274px;
    scrollbar-gutter: stable;
    overflow-y: overlay;
    overflow-x: hidden;

    &::-webkit-scrollbar {
      width: 14px;
    }

    &::-webkit-scrollbar-track {
      box-shadow: none;
      background-color: transparent;
      max-width: 8px;
      border: 3px solid transparent;
    }

    &::-webkit-scrollbar-thumb {
      background-color: var(--v-gray-lighten2);
      border-radius: 8px;
      border: 4px solid transparent;
      background-clip: padding-box;
    }
  }

  &__clear {
    padding: 5px 0;
    border-top: 1px solid map.get(v.$gray, lighten2);
  }
}

.notification {
  padding: 8px 12px 8px 24px;
  position: relative;

  &__content {
    margin-bottom: 6px;
  }

  &__info {
    display: flex;
    align-items: center;
    justify-content: flex-start;

    .v-btn {
      margin-left: auto;
    }
  }

  &__time {
    color: map.get(v.$gray, darken1);
  }

  &__status {
    width: 8px;
    height: 8px;
    border-radius: 100%;
    margin-right: 12px;
    background-color: map.get(v.$primary, base);

    &.error {
      background-color: map.get(v.$error, base);
    }
  }

  &:not(:last-child) {
    &::before {
      content: "";
      position: absolute;
      bottom: 0;
      left: 0px;
      width: calc(100% + 8px);
      height: 1px;
      background-color: map.get(v.$gray, lighten2);
      z-index: 999;
    }
  }
}

.infinite-loader {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8px 0;
}

[dir='rtl'] {
  .notification {
    padding: 8px 24px 8px 12px;

    &__status {
      margin-right: 0px;
      margin-left: 12px;
    }

    &__info {
      .v-btn {
        margin-left: unset;
        margin-right: auto;
      }
    }
  }
}
</style>
