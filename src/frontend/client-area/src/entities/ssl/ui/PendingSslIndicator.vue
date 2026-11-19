<template>
  <span>
    <span
      v-if="isLegacy"
      class="d-flex align-center"
      :class="isFailed ? 'text-error' : 'text-warning'"
    >
      {{ statusText }}
      <v-menu
        :close-on-content-click="false"
        content-class="v-tooltip"
        location="top start"
        :max-width="785"
        :min-width="785"
        :offset="legacyOffset"
        :open-delay="150"
        open-on-hover
        origin="top start"
        transition="custom-tooltip"
        :z-index="99"
      >
        <template #activator="{ props: activatorProps }">
          <AppButton
            v-if="isFailed"
            v-bind="activatorProps"
            :aria-label="statusText"
            color="error"
            kind="icon"
          >
            <v-icon
              color="error"
              icon="$alertwarning"
              size="20"
            />
          </AppButton>

          <AppButton
            v-else
            v-bind="activatorProps"
            :aria-label="statusText"
            color="warning"
            kind="icon"
          >
            <v-progress-circular
              color="warning"
              indeterminate
              size="20"
            />
          </AppButton>
        </template>

        <pending-ssl-tooltip :domain="domain" />
      </v-menu>
    </span>

    <span
      v-else
      class="d-flex align-center"
      :class="isFailed ? 'text-error font-weight-bold' : 'p-5 font-weight-600 line-16'"
    >
      <span :class="isFailed ? 'p-3 ml-0 line-16' : 'heading--text p-3 ml-0 line-16'">
        {{ statusText }}
      </span>

      <v-tooltip
        location="bottom"
        :max-width="370"
        :offset="12"
        :open-delay="150"
        transition="custom-tooltip"
        :z-index="99"
      >
        <template #activator="{ props: activatorProps }">
          <v-icon
            v-if="isFailed"
            v-bind="activatorProps"
            class="pending-ssl-failed-icon ml-2"
            color="error"
            icon="$alertwarning"
            size="16"
          />

          <v-progress-circular
            v-else
            v-bind="activatorProps"
            class="ml-2"
            color="primary"
            indeterminate
            size="16"
          />
        </template>

        <span>{{ tooltipText }}</span>
      </v-tooltip>
    </span>
  </span>
</template>

<script lang="ts" setup>
  // App-lite adds `appearance`
  // (default `compact`); `legacy` is the app markup.
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useRtl } from 'vuetify'
  import { isSslOrderFailed } from '@/entities/ssl/ssl-order-status'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import PendingSslTooltip from './PendingSslTooltip.vue'
  import {
    type PendingSslAppearance,
    type PendingSslDomain,
    sslCompactTooltipKey,
    sslOrderStatusTextKey,
  } from './ssl-status'

  const props = withDefaults(defineProps<{
    domain: PendingSslDomain
    appearance?: PendingSslAppearance
  }>(), {
    appearance: 'compact',
  })

  const { t } = useTranslation()
  const { isRtl } = useRtl()

  const isLegacy = computed(() => props.appearance === 'legacy')
  const isFailed = computed(() => isSslOrderFailed(props.domain.ssl_order_status))
  const statusText = computed(() => t(sslOrderStatusTextKey(props.domain.ssl_order_status, props.appearance)))
  const tooltipText = computed(() => t(sslCompactTooltipKey(props.domain.ssl_order_status))
    .replace('{domain}', props.domain.domain ?? ''))

  // Legacy :nudge-bottom="24px" and :nudge-left="$vuetify.rtl ? '-350px' : '350px'";
  // Vuetify isRtl is the `rtl` flag of the current locale, set from i18next by app/i18n.ts `setDirection`.
  const legacyOffset = computed<[number, number]>(() => [-24, isRtl.value ? -350 : 350])
</script>

<style lang="scss" scoped>
.v-icon.pending-ssl-failed-icon {
  line-height: 0;
  color: var(--v-error-base);
}

.line-16 {
  line-height: 16px;
  max-height: 16px;
}
</style>
