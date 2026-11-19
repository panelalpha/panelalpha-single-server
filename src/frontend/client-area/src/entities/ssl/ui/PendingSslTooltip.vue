<template>
  <div class="px-6 py-6">
    <AppMessage
      v-if="alert"
      :variant="alert.type"
    >
      <span>
        <i18next :translation="t(alert.key)">
          <template #domain>
            <b class="text--heading">{{ domain.domain }}</b>
          </template>
        </i18next>
      </span>
    </AppMessage>

    <ul
      v-if="list"
      class="mt-4"
    >
      <li
        v-for="item in list"
        :key="item.key"
        class="p-3"
      >
        <b v-if="item.bold">{{ t(item.key) }}</b>

        <template v-else>
          {{ t(item.key) }}
        </template>
      </li>
    </ul>
  </div>
</template>

<script lang="ts" setup>
  // App-lite bolds `list.second` in both lists
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import { type PendingSslDomain, sslTooltipAlert, sslTooltipList } from './ssl-status'

  const props = defineProps<{
    domain: PendingSslDomain
  }>()

  const { t } = useTranslation()

  const alert = computed(() => sslTooltipAlert(props.domain.ssl_order_status))
  const list = computed(() => sslTooltipList(props.domain.ssl_order_status))
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

ul {
  li {
    padding-left: 18px;
    position: relative;

    &::before {
      position: absolute;
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 100%;
      top: calc(50% - 3px);
      left: 0;
      background-color: map.get(v.$primary, base);
    }
  }
}
</style>
