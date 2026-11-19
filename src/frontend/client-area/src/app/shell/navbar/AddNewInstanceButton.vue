<template>
  <AppButton
    class="p-2 font-weight-bold"
    data-testid="shell-add-new"
    kind="primary"
    :loading="loadingServices"
    size="large"
    @click="loadServices"
  >
    <v-icon
      class="add-new-icon text-white"
      size="24"
    >
      $plus
    </v-icon>
    {{ t('button.addNew') + ' ' }}
  </AppButton>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { ref } from 'vue'
  import { emit } from '@/shared/events/app-events'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  const { t } = useTranslation()
  const session = useSessionStore()
  const loadingServices = ref(false)

  /**
   * Reads the cached `/home` (services refreshed from it) with `refreshServices()`, then `start-installation-process`. The legacy `.then` has
   * no `.catch`, so a failure leaves the button loading; next releases it.
   */
  async function loadServices () {
    loadingServices.value = true
    try {
      await session.refreshServices()
      emit('start-installation-process')
    } catch {
      // A failed `/home` only releases the button (no unhandled rejection from the click handler).
    } finally {
      loadingServices.value = false
    }
  }
</script>

<style lang="scss" scoped>
// The `$plus` icon wraps its inline svg in a `div`; the baseline gap under the svg makes that div taller than the 24px box and the
// V4 `inline-flex` `.v-icon` centres it, lifting the plus 2px. V2 top-aligned the wrapper.
.add-new-icon :deep(svg) {
  display: block;
}
</style>
