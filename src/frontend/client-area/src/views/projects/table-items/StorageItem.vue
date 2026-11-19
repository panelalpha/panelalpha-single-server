<template>
  <div
    class="table-item item--storage"
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
          v-else-if="isEmpty"
          class="item__value"
        >
          <span class="p-4 text--gray-lighten1">{{ t('general.nodata') }}</span>
        </p>

        <p
          v-else
          class="item__value item__value--usage p-2"
          :title="`${item.info.storage.current} / ${item.info.storage.max}`"
        >
          <span class="item__value-current">{{ item.info.storage.current }}</span>
          /
          <span class="item__value-max">{{ item.info.storage.max }}</span>
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
  import { computed } from 'vue'

  const props = defineProps<{
    item: InstanceResource
    main?: boolean
  }>()

  const { t } = useTranslation()

  const isEmpty = computed(() => ['-', '0 B', '0 kB', '0 GB'].includes(props.item.info.storage.current))
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// Current and max usage in one line and one size (legacy: max below in `p-3 d-block`). The cell has
// the header's width (`v.$instance-usage-column-width`) so the columns after it stay under their headers; without the right
// padding the value has 126px, and a longer one ends in an ellipsis with the full value in `title`.
.table-item {
  max-width: v.$instance-usage-column-width;
  min-width: v.$instance-usage-column-width;
  padding-right: 0;
}

.item__value--usage {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
