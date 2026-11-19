<template>
  <div
    class="mobile-item"
    :class="`table-skeleton-mobile--${variant}`"
  >
    <div
      v-for="(value, index) in config.values"
      :key="index"
      class="pb-3"
    >
      <v-skeleton-loader
        :class="config.boneClass"
        type="text"
        :width="MOBILE_LABEL_WIDTH"
      />

      <v-skeleton-loader
        :class="config.boneClass"
        :type="value.type ?? 'text'"
        :width="value.width"
      />
    </div>

    <div
      v-if="config.actions"
      class="actions-container d-flex justify-start align-center"
    >
      <v-skeleton-loader
        class="actions"
        :class="config.boneClass"
        type="avatar@2"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { MOBILE_LABEL_WIDTH, MOBILE_VARIANTS, type TableSkeletonMobileVariant } from './table-skeleton'

  // Card skeleton of a table row on mobile (`div.mobile-item`). One block of styles per variant, prefixed with
  // `.mobile-item:where(.table-skeleton-mobile--<variant>)` (no added specificity).
  const props = withDefaults(defineProps<{
    variant?: TableSkeletonMobileVariant
  }>(), {
    variant: 'logs',
  })

  const config = computed(() => MOBILE_VARIANTS[props.variant])
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// Variant `logs`.
// The legacy `.v-skeleton-loader.actions` block (`::v-deep` + `&.actions`) is omitted: no bone of this variant carries `actions`, so it never applied.
// V4 gives the `text` bone a 16px margin on every side; V2 only a 6px bottom margin.
.mobile-item:where(.table-skeleton-mobile--logs) :deep(.v-skeleton-loader__text) {
  margin: 0 0 6px;
}

.mobile-item:where(.table-skeleton-mobile--logs) {
  border-bottom: 1px solid map.get(v.$gray, lighten2);
  padding: 24px 24px 16px 24px;
}

// Variant `config`.
// `.mobile-item` stays in front of `:where()` so the rules weigh what they did in the preset: `.mobile-item .v-skeleton-loader` (0,3,0).
.mobile-item:where(.table-skeleton-mobile--config) {
  border-bottom: 1px solid map.get(v.$gray, lighten2);
  padding: 24px 24px 16px 24px;

  // V2 skeleton: transparent block, text bone with `margin-bottom: 6px` only; V4 paints the block white and puts 16px on every bone
  // (8px 16px on the avatar), which made the card twice as tall.
  .v-skeleton-loader {
    background: transparent;

    :deep(.v-skeleton-loader__bone) {
      margin: 0 0 6px;
    }
  }

  .v-skeleton-loader.actions {
    display: flex;
    flex-direction: row;

    :deep(.v-skeleton-loader__avatar) {
      height: 24px;
      width: 24px;
      // V4 floors and caps the avatar bone at 48px (`min-*` / `max-*`).
      min-height: 24px;
      max-height: 24px;
      min-width: 24px;
      max-width: 24px;
      margin: 0 0 0 16px;

      &:first-child {
        margin-left: 0px !important;
      }
    }
  }
}

// V2 skeleton bones have no margin except the text bone (`margin-bottom: 6px`); V4 gives every bone 16px.
:where(.table-skeleton-mobile--config) {
  .v-skeleton-loader {
    // V2 skeletons here sit on the card colour: the V4 root paints its own surface (`users-skeleton` background).
    background-color: transparent;
    // `flow-root`: the text bone's 6px bottom margin stays inside the root (legacy root 18px, V4 block root 12px).
    display: flow-root;
    color: inherit;

    :deep(.v-skeleton-loader__bone) {
      margin: 0;
    }

    :deep(.v-skeleton-loader__text) {
      margin-bottom: 6px;
    }
  }
}

// Variant `backups`.
.mobile-item:where(.table-skeleton-mobile--backups) {
  border-bottom: 1px solid map.get(v.$gray, lighten2);
  padding: 12px 36px;
  margin-left: -24px;
  // The legacy table sizes its first column to 147px (`calculate-widths`, from the header labels), and the card is 100% + 36px of that column.
  width: 183px;
}

:where(.table-skeleton-mobile--backups) {
  // V2 skeleton root is `display: block` and transparent (the legacy `text` class reset the theme background); the text bone is 12px tall with a 6px
  // bottom margin and fills the root (V4: flex wrap, 16px margins on every side, surface background).
  .v-skeleton-loader {
    display: flow-root;
    color: inherit;
  }

  .v-skeleton-loader :deep(.v-skeleton-loader__text) {
    margin: 0 0 6px;
    width: 100%;
  }

  .v-skeleton-loader.actions {
    display: flex;
    flex-direction: row;
    width: 72px;
  }

  .v-skeleton-loader.actions :deep(.v-skeleton-loader__avatar) {
    flex: 0 0 auto;
    height: 24px;
    width: 24px;
    min-width: 24px;
    min-height: 24px;
    max-width: 24px;
    max-height: 24px;
    margin: 0 0 0 16px;

    &:first-child {
      margin-left: 0;
    }
  }
}

// Variant `invoice` (the five identical legacy rows are a loop here).
.mobile-item:where(.table-skeleton-mobile--invoice) {
  border-bottom: 1px solid map.get(v.$gray, lighten2);
  padding: 24px 24px 16px 24px;

  .v-skeleton-loader {
    // V2 `.v-skeleton-loader__text` was full width with a 6px bottom margin; the V4 bone has 16px on every side and a narrower width.
    :deep(.v-skeleton-loader__text) {
      margin: 0 0 6px;
      width: 100%;
    }

    &.actions {
      display: flex;
      flex-direction: row;
      // V4 wraps the bones; V2 kept them on one line.
      flex-wrap: nowrap;

      :deep(.v-skeleton-loader__avatar) {
        height: 24px;
        width: 24px;
        // V4 avatar bone has min/max height 48px and an 8px vertical margin.
        min-height: 24px;
        max-height: 24px;
        min-width: 24px;
        margin-top: 0;
        margin-bottom: 0;
        margin-left: 16px;
        margin-right: 0;

        // Without `!important`: this selector is more specific than the `margin-left: 16px` above (one extra class and `:first-child`).
        // The pixel check is in `billing-loading` light-mobile; if the first bone shifts there, restore the flag with this cause in a comment.
        &:first-child {
          margin-left: 0px;
        }
      }
    }
  }
}

// Variant `devices`. The unused `.checkbox-container` / `.text-container`
// rules and the `.checkbox` / `.names` / `.text` / `.tags` / `.avatar` bones that no template uses are omitted; `.actions` is kept.
:where(.table-skeleton-mobile--devices) {
  .v-skeleton-loader {
    // V2 `.v-skeleton-loader__text` was full width with a 6px bottom margin; the V4 bone has 16px on every side and a narrower width.
    :deep(.v-skeleton-loader__text) {
      margin: 0 0 6px;
      width: 100%;
    }

    &.actions {
      width: 72px;

      :deep(.v-skeleton-loader__avatar) {
        height: 38px;
        width: 38px;
        margin-left: 34px;
      }
    }
  }
}

.mobile-item:where(.table-skeleton-mobile--devices) {
  border-bottom: 1px solid map.get(v.$gray, lighten2);
  padding: 12px 36px;
  margin-left: -24px;
  width: calc(100% + 36px);

  .v-skeleton-loader {
    &.actions {
      display: flex;
      flex-direction: row;
      // V4 wraps the bones; V2 kept them on one line.
      flex-wrap: nowrap;

      :deep(.v-skeleton-loader__avatar) {
        height: 24px;
        width: 24px;
        // V4 avatar bone has min/max height 48px and an 8px vertical margin.
        min-height: 24px;
        max-height: 24px;
        min-width: 24px;
        margin-top: 0;
        margin-bottom: 0;
        margin-left: 16px;

        // `!important` 1:1 with legacy.
        &:first-child {
          margin-left: 0px !important;
        }
      }
    }
  }
}

// Variant `services`.
:where(.table-skeleton-mobile--services) {
  .v-skeleton-loader {
    // V2 skeleton root keeps the theme text colour; V4 sets the surface colour.
    color: var(--v-text-default);

    // V2 `.v-skeleton-loader__text` was full width with a 6px bottom margin; the V4 bone has 16px on every side and a narrower width.
    :deep(.v-skeleton-loader__text) {
      margin: 0 0 6px;
      width: 100%;
    }
  }
}

.mobile-item:where(.table-skeleton-mobile--services) {
  border-bottom: 1px solid map.get(v.$gray, lighten2);
  padding: 24px 24px 16px 24px;

  .v-skeleton-loader {
    &.actions {
      display: flex;
      flex-direction: row;
      // V4 wraps the bones; V2 kept them on one line.
      flex-wrap: nowrap;

      :deep(.v-skeleton-loader__avatar) {
        height: 24px;
        width: 24px;
        // V4 avatar bone has min/max height 48px and an 8px vertical margin.
        min-height: 24px;
        max-height: 24px;
        min-width: 24px;
        margin-top: 0;
        margin-bottom: 0;
        margin-left: 16px;

        // Legacy `!important` kept 1:1: the first bone of the row has no left gap.
        &:first-child {
          margin-left: 0px !important;
        }
      }
    }
  }
}
</style>
