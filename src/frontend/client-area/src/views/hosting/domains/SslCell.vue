<template>
  <v-progress-circular
    v-if="view.kind === 'loading'"
    color="primary"
    indeterminate
    :size="20"
  />

  <pending-ssl-indicator
    v-else-if="view.kind === 'pending'"
    appearance="legacy"
    :domain="item"
  />

  <ssl-indicator
    v-else
    class="ssl-button d-flex align-center"
    :ssl="view.ssl"
    :text="text"
    :text-class="view.textClass"
    @click="onClick"
  />
</template>

<script lang="ts" setup>
  import type { HostingDomain } from './domains.types'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import PendingSslIndicator from '@/entities/ssl/ui/PendingSslIndicator.vue'
  import SslIndicator from '@/entities/ssl/ui/SslIndicator.vue'
  import { canOpenSslFromCell, sslCell } from './domains-actions'

  const props = defineProps<{
    item: HostingDomain
  }>()

  const emit = defineEmits<{
    open: []
  }>()

  const { t } = useTranslation()

  const view = computed(() => sslCell(props.item))
  const text = computed(() => {
    const value = view.value.text
    return value.kind === 'key' ? t(value.key) : (value.value ?? '')
  })

  /** A click opens the modal only with `can_manage_ssl` and without an order in flight. */
  function onClick (): void {
    if (canOpenSslFromCell(props.item)) {
      emit('open')
    }
  }
</script>

<style lang="scss" scoped>
// The pointer, and 8px between the icon and the text.
.ssl-button {
  cursor: pointer;

  :deep(.v-icon) {
    margin-right: 8px;
  }
}

[dir=rtl] .ssl-button :deep(.v-icon) {
  margin-right: 0;
  margin-left: 8px;
}
</style>
