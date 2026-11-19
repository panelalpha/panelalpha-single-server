<template>
  <div
    class="label-list"
    :class="[
      containerClass,
      !chips ? 'label-list--simple' : '',
      maxWidth ? 'flex-nowrap w-100' : '',
      filtersActive ? 'label-list--filters' : '',
      dots ? 'label-list--dots' : '',
    ]"
  >
    <template v-if="chips">
      <template v-if="!filtersActive">
        <label-chip
          v-for="(item, index) in displayLabels"
          :key="index"
          :class="dots ? 'v-chip--dot' : ''"
          :clickable="filtersActive || removable"
          :item="item"
          :removable="removable"
          :small="small"
          :xsmall="xsmall"
          @toggle-filter="emit('toggle-filter', $event)"
          @unassign-label="emit('unassign-label', $event)"
        />
      </template>

      <template v-else>
        <v-tooltip
          v-for="(item, index) in displayLabels"
          :key="index"
          location="bottom"
          open-delay="150"
          transition="custom-tooltip"
        >
          <template #activator="{ props: activatorProps }">
            <div v-bind="activatorProps">
              <label-chip
                :class="dots ? 'v-chip--dot' : ''"
                :clickable="filtersActive || removable"
                :item="item"
                :removable="removable"
                :small="small"
                :xsmall="xsmall"
                @toggle-filter="emit('toggle-filter', $event)"
                @unassign-label="emit('unassign-label', $event)"
              />
            </div>
          </template>

          <div>
            <div
              class="tooltip-label"
              :style="`color:${item.color};`"
            ><span
              class="tooltip-label-dot"
              :style="`background-color:${item.color};`"
            />{{ item.title }}</div>
            {{ t('tooltip.label.filter') }}
          </div>
        </v-tooltip>
      </template>

      <span v-if="loading">
        <loader
          no-margins
          size="16"
        />
      </span>
    </template>

    <template v-else>
      <label-simple
        v-for="(item, index) in displayLabels"
        :key="index"
        :dot="dots"
        :item="item"
        :small="small"
      />

      <span v-if="loading">
        <loader
          no-margins
          size="16"
        />
      </span>
    </template>

    <template v-if="remainingAsButton">
      <div
        v-if="remainingLabels > 0"
        v-ripple
        class="label-list__items-remaining link-text p-5 font-weight-regular"
        @click="showRemaining"
      >
        {{ remainingLabels ? `+${remainingLabels}` : "" }}
      </div>

      <div
        v-else-if="remainingLabels <= 0 && instance?.hasManageLabelsPrivilege()"
        v-ripple
        class="label-list__items-remaining label-list__items-remaining--add link-text p-5 font-weight-regular"
        @click="showRemaining"
      >
        <v-icon
          color="info"
          icon="$circlePlus"
          size="24"
        />
      </div>
    </template>

    <template v-else>
      <div
        v-if="remainingLabels > 0"
        class="label-list__items-remaining link-text p-5"
      >
        +{{ remainingLabels }}
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
  import type { LabelChipItem } from '@/shared/ui/labels/labels.types'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, nextTick, onMounted, ref, watch } from 'vue'
  import LabelChip from '@/shared/ui/labels/LabelChip.vue'
  import LabelSimple from '@/shared/ui/labels/LabelSimple.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'

  const props = withDefaults(defineProps<{
    loading?: boolean
    maxWidth?: number
    active?: boolean
    chips?: boolean
    dots?: boolean
    small?: boolean
    xsmall?: boolean
    removable?: boolean
    remainingAsButton?: boolean
    maxLabelsDisplayed?: number
    containerClass?: string
    instanceItem?: boolean
    filtersActive?: boolean
    labels: LabelChipItem[]
    instance?: InstanceResource
  }>(), {
    loading: false,
    maxWidth: 0,
    active: false,
    chips: false,
    dots: false,
    small: false,
    xsmall: false,
    removable: true,
    remainingAsButton: false,
    maxLabelsDisplayed: 2,
    containerClass: '',
    instanceItem: false,
    filtersActive: false,
    instance: undefined,
  })

  const emit = defineEmits<{
    'show-remaining': []
    'toggle-filter': [item: { title: string, color?: string }]
    'unassign-label': [item: LabelChipItem]
  }>()

  const { t } = useTranslation()

  const maxItems = ref(0)

  function calcLabelsWidth (label: LabelChipItem): number {
    return label.title.length * 7 + 24
  }

  const maxItemsInRow = computed(() => {
    if (!props.maxWidth) {
      return false
    }

    let maxLabels = 0
    let remainingWidth = props.maxWidth - 65

    for (const item of props.labels) {
      const labelWidth = calcLabelsWidth(item)
      if (remainingWidth > labelWidth) {
        maxLabels = maxLabels + 1
        remainingWidth = remainingWidth - labelWidth
      }
    }

    return maxLabels
  })

  const displayLabels = computed(() => {
    if (maxItemsInRow.value) {
      const newLabels = props.labels.slice(0, maxItems.value)
      return newLabels.slice(0, maxItemsInRow.value)
    }

    if (maxItems.value === 0) {
      return props.labels
    }
    const newLabels = props.labels.slice(0, maxItems.value)
    return newLabels.slice(0, props.maxLabelsDisplayed)
  })

  const remainingLabels = computed(() => props.labels.length - displayLabels.value.length)

  function showRemaining (): void {
    emit('show-remaining')
  }

  onMounted(() => {
    maxItems.value = props.maxLabelsDisplayed
    void nextTick(() => {
      void maxItemsInRow.value
    })
  })

  watch(() => props.labels, () => {
    if (props.maxLabelsDisplayed > 0) {
      maxItems.value = props.maxLabelsDisplayed
    }
  })

  watch(() => props.maxWidth, () => {
    maxItems.value = props.maxLabelsDisplayed
  })
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.tooltip-label {
  display: inline-flex;
  align-items: center;
  margin-right: 8px;

  .tooltip-label-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
  }
}

.label-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  min-height: 24px;

  &--dots {
    margin-left: 8px;
  }

  &__item {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
  }

  &__items-remaining {
    color: map.get(v.$text, base);
    font-weight: v.$font-weight-light;
    border-radius: 10px;
    min-width: 20px;
    padding: 2px 4px;

    &--add {
      padding: 0px;

      svg {
        path {
          stroke: var(--v-link-base);
          transition: 0.3s;
        }
      }

      &:hover {
        svg {
          path {
            stroke: var(--v-link-hover);
          }
        }
      }
    }

    &--btn {
      border-radius: 50%;
      font-size: v.$font-size-xs;
      line-height: v.$line-height-xs;
      font-weight: v.$font-weight-normal;
      height: 24px;
      width: 24px;
      padding: 0 !important; // beats the global `.v-btn { padding-x: 16px !important }`
    }
  }

  &--filters {
    .label-chip {
      cursor: pointer;
    }
  }

  &--simple {
    min-width: 60px;
  }
}

[dir=rtl] {
  .label-list {
    &--filters {
      .label-chip {
        margin-right: 0px;
        margin-left: 8px;
      }
    }
  }
}
</style>
