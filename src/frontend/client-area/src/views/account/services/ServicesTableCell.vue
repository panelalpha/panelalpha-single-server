<template>
  <div
    v-if="column === 'plan_name'"
    class="additional-services"
  >
    <div class="additional-services-main d-flex align-center">
      <p class="p-lg text-darken2 font-weight-bold mb-0">
        {{ service.plan_name }}
      </p>

      <custom-label
        v-if="chipOf()"
        class="ml-4"
        data-testid="services-status-chip"
        :type="chipOf()!.type"
      >
        {{ chipOf()!.text }}
      </custom-label>
    </div>
  </div>

  <custom-label
    v-else-if="column === 'instances_count'"
    class="radius-sm"
    data-testid="services-count-chip"
    type="purple"
  >
    {{ limitText() }}
  </custom-label>

  <template v-else-if="column === 'instances'">
    <span v-if="!service.instances_count">-</span>

    <div
      v-else
      class="d-flex align-center"
    >
      {{ service.instances[0]!.domain }}

      <v-tooltip
        v-if="service.instances.length > 1"
        location="bottom"
        :location-strategy="legacyBottomTooltipLocation"
        open-delay="150"
        transition="custom-tooltip"
        :z-index="8"
      >
        <template #activator="{ props: activatorProps }">
          <div
            v-bind="activatorProps"
            class="ml-2 text-info cursor-pointer"
            data-testid="services-more-sites"
          >
            + {{ service.instances.length - 1 }} {{ t('more') }}
          </div>
        </template>

        <div data-testid="services-sites-tooltip">
          <p class="p-sm text--darken2 font-weight-bold">
            {{ t('general.sites') }} ({{ service.instances.length }})
          </p>

          <v-divider class="mt-2 mb-3" />

          <ul>
            <li
              v-for="instance in service.instances"
              :key="instance.id"
              class="d-flex space-between my-2"
            >
              <span class="mr-2">{{ instance.domain }}</span>

              <custom-label
                v-if="domainTypeChip(instance.domain_type, t)"
                class="justify-end ml-a"
                :data-testid="`services-domain-chip-${instance.domain_type}`"
                :type="domainTypeChip(instance.domain_type, t)!.key"
              >
                {{ domainTypeChip(instance.domain_type, t)!.text }}
              </custom-label>
            </li>
          </ul>
        </div>
      </v-tooltip>
    </div>
  </template>
</template>

<script lang="ts" setup>
  // The cells of one plan (desktop cell and mobile card field).
  import type { ServiceRow } from './services.types'
  import { useTranslation } from 'i18next-vue'
  import { instanceLimitText, isUnlimitedLimit } from '@/entities/service/service-display'
  import { fromNow } from '@/shared/time/from-now'
  import CustomLabel from './CustomLabel.vue'
  import { domainTypeChip, statusChip } from './services-cells'
  import { legacyBottomTooltipLocation } from './sites-tooltip-location'

  const props = withDefaults(defineProps<{
    column: string
    service: ServiceRow
    billingEnabled?: boolean
  }>(), {
    billingEnabled: true,
  })

  const { t } = useTranslation()

  function chipOf () {
    return statusChip(props.service, (key: string) => t(key), fromNow, { trial: props.billingEnabled })
  }

  // Limited "count/limit" as in legacy, unlimited "count / Unlimited".
  function limitText (): string {
    const { instance_limit: limit } = props.service.plan_settings
    const text = instanceLimitText(limit, (key: string) => t(key))
    return isUnlimitedLimit(limit) ? `${props.service.instances_count} / ${text}` : `${props.service.instances_count}/${text}`
  }
</script>
