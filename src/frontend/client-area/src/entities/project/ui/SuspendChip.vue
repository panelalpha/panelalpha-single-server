<template>
  <v-tooltip
    v-if="withTooltip"
    location="bottom"
    :offset="12"
    open-delay="150"
    transition="custom-tooltip"
    :z-index="99"
  >
    <template #activator="{ props: activatorProps }">
      <StatusLabel
        v-bind="{ ...$attrs, ...activatorProps }"
        class="suspend-chip"
        icon="$suspended"
        status="sand"
        :value="t('message.status.suspended')"
      />
    </template>

    <div class="d-flex align-center">
      <v-icon
        color="sand-darken-2"
        icon="$suspended"
        size="16"
      />

      <span class="text-sand-darken-2 ml-1">
        {{ t('tooltip.hosting.service.suspended') }}
      </span>
    </div>
  </v-tooltip>

  <StatusLabel
    v-else
    v-bind="$attrs"
    class="suspend-chip"
    icon="$suspended"
    status="sand"
    :value="t('message.status.suspended')"
  />
</template>

<script lang="ts" setup>
  // Suspended or cancelled service chip: the kit `StatusLabel` in `sand` with `$suspended`.
  // `withTooltip` adds the legacy tooltip (Hosting Summary, reseller users); the project list row has none. The host keeps the
  // `service_status` condition. `class` and `data-testid` land on the chip (`inheritAttrs: false`), also inside the tooltip.
  import { useTranslation } from 'i18next-vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'

  defineOptions({ inheritAttrs: false })

  withDefaults(defineProps<{
    withTooltip?: boolean
  }>(), {
    withTooltip: false,
  })

  const { t } = useTranslation()
</script>
