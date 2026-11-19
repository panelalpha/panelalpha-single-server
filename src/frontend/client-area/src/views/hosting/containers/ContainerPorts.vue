<template>
  <div class="port-list">
    <!-- A list of ports in one neutral (gray) chip each; the tooltip of a port lists the domains (public URLs) attached to it, or says what the port is. -->
    <v-tooltip
      v-for="group in groups"
      :key="group.key"
      location="bottom"
      max-width="360"
      :offset="4"
      open-delay="150"
      transition="custom-tooltip"
    >
      <template #activator="{ props: activatorProps }">
        <StatusLabel
          v-bind="activatorProps"
          class="port-chip"
          data-testid="containers-port-chip"
          status="gray"
          tabindex="0"
          :value="group.label"
        />
      </template>

      <div
        v-if="group.links.length + group.streams.length > 0"
        class="port-tooltip"
      >
        <span
          v-for="target in [...group.links, ...group.streams]"
          :key="target"
        >{{ target }}</span>
      </div>

      <span v-else>{{ group.hint }}</span>
    </v-tooltip>

    <span
      v-if="groups.length === 0"
      class="port-empty"
    >{{ copy.noPorts }}</span>
  </div>
</template>

<script lang="ts" setup>
  import type { Container, ProxyRule } from './containers.api'
  import { computed } from 'vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
  import { CONTAINERS_COPY, getPortEntries, groupPortRows } from './containers'

  const props = defineProps<{
    container: Container
    proxyRules: ProxyRule[]
    serverIp: string | null
  }>()

  const copy = CONTAINERS_COPY

  const groups = computed(() => groupPortRows(getPortEntries(props.container, props.proxyRules, props.serverIp), props.serverIp))
</script>

<style lang="scss" scoped>
// The ports of one container in a row, wrapped when the column is narrow.
.port-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0;
}

.v-chip.port-chip {
  cursor: default;
}

.port-empty {
  color: var(--v-gray-lighten1);
}

// One URL per line in the tooltip.
.port-tooltip {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
