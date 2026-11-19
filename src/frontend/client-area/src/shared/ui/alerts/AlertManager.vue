<template>
  <div
    class="alert-manager pt-4 pr-4"
    data-testid="shell-alert-manager"
  >
    <transition-group name="list">
      <div
        v-for="item in store.activeAlerts"
        :key="item.id"
        class="item"
      >
        <SuccessAlert
          v-if="item.success"
          :item="item"
          @remove-alert="store.removeAlert"
        />

        <ErrorAlert
          v-else
          :item="item"
          @remove-alert="store.removeAlert"
        />
      </div>
    </transition-group>
  </div>
</template>

<script lang="ts" setup>
  // V2 transition classes `list-enter` / `list-leave-to` are `list-enter-from` / `list-leave-to`.
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import ErrorAlert from './ErrorAlert.vue'
  import SuccessAlert from './SuccessAlert.vue'

  const store = useAlertsStore()
</script>

<style lang="scss" scoped>
.alert-manager {
  position: fixed;
  z-index: 99999;
  top: 0px;
  right: 0px;
}

.item {
  transition: all 1s;
}

.list-enter-active,
.list-leave-active {
  transition: opacity 0.5s ease, transform 0.5s ease;
}
.list-leave-active:not(:first-child:last-child) {
  position: absolute;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(200px);
}
.list-move {
  transition: transform 0.2s ease;
}

[dir='rtl'] {
  .alert-manager {
    right: unset;
    left: 0px;
  }

  .list-leave-to,
  .list-enter-from {
    transform: translateX(-200px);
  }
}
</style>
