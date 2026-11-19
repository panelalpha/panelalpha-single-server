<template>
  <AppButton
    :class="[
      small ? 'v-btn--vertical-sm' : '',
      loading ? 'v-btn--vertical-loading' : '',
    ]"
    :disabled="disabled"
    :filled="filled"
    kind="icon-labeled"
  >
    <div class="d-flex flex-column align-center justify-space-between">
      <v-icon
        v-if="!loading"
        :class="[color ? `${color}--text` : 'heading--text', colorDarken ? 'sand-darken1' : '']"
        :icon="icon"
        size="24"
        :style="stateColorStyle"
      />

      <div
        v-else
        class="d-flex justify-center align-center loading-container"
      >
        <Loader
          :color="color ? color : 'primary'"
          no-margins
          size="20"
        />
      </div>

      <span
        class="p-5 v-btn__text"
        :class="[color ? `${color}--text` : '', colorDarken ? 'sand-darken1' : '', loading ? 'loading' : '']"
        :style="stateColorStyle"
      >{{ text }}</span>
    </div>
  </AppButton>
</template>

<script lang="ts" setup>
  // The vertical icon-over-label button of the instance top bar.
  // Clicks, `data-testid` and the other fallthrough attributes reach the `v-btn`. Built on `AppButton` (`kind="icon-labeled"`);
  // `loading` and `color` stay here (own `.v-btn--vertical-loading`, colour on the icon and caption), so they are not passed to the button.
  import { computed } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'

  const props = withDefaults(defineProps<{
    small?: boolean
    icon?: string
    text?: string
    color?: string
    colorDarken?: boolean
    filled?: boolean
    disabled?: boolean
    loading?: boolean
  }>(), {
    small: false,
    icon: undefined,
    text: undefined,
    color: undefined,
    colorDarken: false,
    filled: false,
    disabled: false,
    loading: false,
  })

  // V2 had `info--text` / `error--text` rules; V4 has no such classes, so the state colour comes back as an inline style. The classes
  // stay in the DOM as before. Only these two states had a colour, so other `color` values stay uncoloured, as they were.
  const STATE_COLORS: Record<string, string> = {
    error: 'rgb(var(--v-theme-error))',
    info: 'rgb(var(--v-theme-info))',
  }
  const stateColorStyle = computed(() => {
    const color = props.color ? STATE_COLORS[props.color] : undefined
    return color ? { color } : undefined
  })
</script>

<style lang="scss" scoped>
// The legacy `.v-btn--vertical` block.
.v-btn {
  .loading-container {
    min-width: 34px;
    min-height: 34px;
  }

  &.v-btn--vertical {
    min-height: 64px;
    padding: 0 8px !important;
    min-width: 46px;
    // V4 `.v-btn` clips its content (`overflow: hidden`, fixed 64px at mobile); the V2 button did not, and a two-line label ("WP Admin")
    // showed its second line below the 14px `.v-btn__text` box.
    overflow: visible;

    &::before {
      display: none;
    }

    // V2 hid the hover/focus overlay (`::before`) here; V4 paints it as `.v-btn__overlay`.
    .v-btn__overlay {
      display: none;
    }

    // V4 fades a disabled button as a whole (opacity .26); V2 kept it at 1 and only greyed the parts.
    &.v-btn--disabled {
      opacity: 1;
    }

    .v-btn__text,
    .v-icon {
      transition: color 0.3s ease;
    }

    .v-btn__text {
      font-size: 12px;
      line-height: 16px;
      font-weight: 400;
      color: var(--v-gray-darken1);
      max-height: 14px;
      display: inline-block;
    }

    .v-icon {
      margin-right: 0;
      margin-bottom: 8px;
    }

    // V2 `.v-icon__component` stretched an svg component with 18px attributes (e.g. `$settings3`) to the 24px icon box; V4 keeps them.
    :deep(.v-icon > svg) {
      width: 100%;
      height: 100%;
    }

    &.v-btn--disabled .v-icon {
      color: #adadad !important;
    }

    &:hover,
    &.v-btn--vertical-loading {
      .v-btn__content {
        .v-btn__text,
        .v-icon {
          color: rgb(var(--v-theme-primary)) !important;

          // The legacy `&.info--text` hover branch.
          &.info--text {
            color: var(--v-link-hover) !important;
          }
        }
      }
    }

    &-sm {
      min-width: 46px !important;
      max-width: 46px !important;

      .v-btn__text {
        width: 46px;
        white-space: normal;
      }
    }
  }

  &.primary-btn {
    .v-btn__text,
    .v-icon {
      color: var(--v-primary-darken1) !important;
    }
  }
}
</style>
