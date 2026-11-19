<template>
  <v-chip
    class="text-white p-4 label-chip"
    :class="[
      small ? 'label-chip--small' : '',
      xsmall ? 'label-chip--xsmall' : '',
      removable ? 'label-chip--removable' : '',
    ]"
    :color="item.color || item.colorScheme"
    :style="item.color ? { borderColor: item.color } : undefined"
    variant="flat"
    v-on="clickable ? { click: filterClick } : {}"
  >
    {{ item.title }}
    <AppButton
      v-if="removable"
      :aria-label="t('button.remove')"
      class="ml-1"
      kind="icon"
      @click.stop="emit('unassign-label', item)"
    >
      <v-icon
        class="text-white"
        icon="$close"
        size="12"
      />
    </AppButton>
  </v-chip>
</template>

<script lang="ts" setup>
  import type { LabelChipItem } from './labels.types'
  import { useTranslation } from 'i18next-vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  const { t } = useTranslation()

  const props = defineProps<{
    item: LabelChipItem
    small?: boolean
    xsmall?: boolean
    removable?: boolean
    clickable?: boolean
  }>()

  const emit = defineEmits<{
    'toggle-filter': [payload: { title: string, color?: string }]
    'unassign-label': [item: LabelChipItem]
  }>()

  function filterClick (): void {
    emit('toggle-filter', {
      title: props.item.title,
      color: props.item.color,
    })
  }
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// V2 template `mb-0` (Vuetify utility, `!important`) kept the chip flush outside `.labels-list`; the Assign panel list restores the 8px.
.labels-list .label-chip {
  margin-bottom: 8px;
}

.label-chip {
  margin-bottom: 0;
  height: 28px;
  font-size: v.$font-size-sm;
  line-height: v.$line-height-sm;
  font-weight: v.$font-weight-bold;
  transition: opacity ease 0.3s;
  // V2 chip: no border style (the colour repeats the background, see the template), 16px radius, no shadow; V4 sets `solid`
  // (width 0), a pill radius and a zero-size elevation shadow, so only the computed style differs.
  border-style: none;
  border-radius: 16px;
  box-shadow: none;

  &:hover {
    opacity: 0.8;
  }

  :deep(.v-btn--icon.v-btn--size-x-small) {
    width: 24px;
    height: 24px;
    margin-right: 2px;
    padding: 0px !important; // beats the global `.v-btn { padding-x: 16px !important }`
    position: relative;
    // V2 icon button keeps its own colour inside the chip (the white is only the icon's `text-white`); V4 inherits the chip's white.
    color: var(--v-icon-btn-color);

    &:hover {
      &::before {
        opacity: 0.32;
      }
    }
  }

  &--small {
    height: 24px;
    font-size: v.$font-size-xs;
    line-height: v.$line-height-xs;
    font-weight: v.$font-weight-semibold;

    :deep(.v-btn--icon.v-btn--size-x-small) {
      width: 20px;
      height: 20px;
      padding: 0px !important; // beats the global `.v-btn { padding-x: 16px !important }`
      margin-right: 2px;
      position: relative;

      &:hover {
        &::before {
          opacity: 0.32;
        }
      }
    }
  }

  &--xsmall {
    height: 20px;
    font-size: v.$font-size-xxs;
    line-height: v.$line-height-xxs;
    font-weight: v.$font-weight-semibold;
    padding: 0px 8px;

    :deep(.v-btn--icon.v-btn--size-x-small) {
      width: 18px;
      height: 18px;
      padding: 0px !important; // beats the global `.v-btn { padding-x: 16px !important }`
      margin-right: 1px;
      position: relative;

      &:hover {
        &::before {
          opacity: 0.32;
        }
      }
    }
  }

  // Dot mode (project list, topbar search): a circle the size of the add-tag button's visible ring. The `$circlePlus` icon is a 24px
  // box whose ring is 12/20 of it (r=6 in a 20 viewBox, plus stroke), so ~16px; a 24px dot looked 1.5x larger.
  // Without it the global `.v-chip--dot` 8px width loses the height to `--small`/`--xsmall`, so the dot was a 8x20 oval.
  &.v-chip--dot {
    width: 16px;
    height: 16px;
    min-width: 16px;
    padding: 0;
    border-radius: 50%;
  }

  // V2 template `pr-0` (utility, `!important`).
  &--removable {
    padding-right: 0;
  }

  + .label-chip,
  &:first-child {
    margin-right: 8px;
  }
}

[dir=rtl] {
  .label-chip.label-chip {
    padding-right: 8px;

    + .label-chip,
    &:first-child {
      margin-right: 0px;
      margin-left: 8px;
    }
  }
}
</style>
