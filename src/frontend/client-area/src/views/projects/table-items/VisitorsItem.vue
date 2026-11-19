<template>
  <div
    class="table-item item--visitors"
    :class="main ? 'group-start' : ''"
  >
    <template v-if="main">
      <div class="item item--main">
        <p
          v-if="item.hasActionInProgress()"
          class="item__value"
        >
          <v-icon
            class="text--gray-lighten1"
            icon="$loader"
            :size="20"
          />
        </p>

        <p
          v-else-if="item.info.visitors.current === '-' || item.info.visitors.current === '0'"
          class="item__value"
        >
          <span class="p-4 text--gray-lighten1">{{ t('general.nodata') }}</span>
        </p>

        <p
          v-else
          class="item__value"
        >
          <span class="item__value-current p-2">
            {{ item.info.visitors.current }}
          </span>

          <delta-indicator :value="item.info.visitors.delta" />
        </p>
      </div>
    </template>

    <template v-else>
      <div class="item">
        <span class="p-4 text--gray-lighten1">{{ t('general.nodata') }}</span>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import DeltaIndicator from '@/shared/ui/delta-indicator/DeltaIndicator.vue'

  defineProps<{
    item: InstanceResource
    main?: boolean
  }>()

  const { t } = useTranslation()
</script>
