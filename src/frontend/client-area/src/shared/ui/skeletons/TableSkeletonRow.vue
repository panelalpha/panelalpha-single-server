<template>
  <tbody
    class="item"
    :class="`table-skeleton-row--${variant}`"
  >
    <tr
      v-for="item in rowCount"
      :key="item"
    >
      <td v-if="config.leadingEmpty" />

      <td
        v-for="itemCell in colCount"
        :key="itemCell"
      >
        <v-skeleton-loader
          :class="config.boneClass"
          type="text"
        />
      </td>

      <td v-if="config.trailing">
        <v-skeleton-loader
          :class="config.trailing.class"
          :type="config.trailing.type"
        />
      </td>
    </tr>
  </tbody>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { ROW_VARIANTS, type TableSkeletonRowVariant } from './table-skeleton'

  // Rows skeleton of a table (`tbody.item`). `rows` and `cols` default to the counts of the variant. One block of styles per variant,
  // prefixed with `:where(.table-skeleton-row--<variant>)` (no added specificity).
  const props = withDefaults(defineProps<{
    variant?: TableSkeletonRowVariant
    rows?: number
    cols?: number
  }>(), {
    variant: 'logs',
    rows: undefined,
    cols: undefined,
  })

  const config = computed(() => ROW_VARIANTS[props.variant])
  const rowCount = computed(() => props.rows ?? config.value.rows)
  const colCount = computed(() => props.cols ?? config.value.bones)
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// Variant `logs`.
// The legacy `.v-skeleton-loader.avatar` rule is omitted: this skeleton renders no avatar bone.
:where(.table-skeleton-row--logs) {
  tr {
    padding: 0px 8px;
    position: relative;
    &:after {
      content: "";
      border-bottom: 1px solid var(--v-gray-lighten2);
      position: absolute;
      width: 100%;
      left: 0px;
      bottom: 0px;
    }
  }
}

// V4 gives the `text` bone a 16px margin on every side; V2 only a 6px bottom margin (18px bone in a 48px row).
// `tbody` is the only way to keep the attribute selector outside `:where()` (Vue puts it inside when the rule ends there), so the rule weighs
// (0,2,1) here against (0,2,0) in the preset; no rule between those two weights targets the text bone.
tbody:where(.table-skeleton-row--logs) :deep(.v-skeleton-loader__text) {
  margin: 0 0 6px;
}

:where(.table-skeleton-row--logs) {
  tr td {
    border-bottom: transparent;
    &:nth-child(1) {
      width: 175px;

      .v-skeleton-loader {
        max-width: 175px;
      }
    }
    &:nth-child(2) {
      width: 280px;
    }
    &:nth-child(3) {
      max-width: 280px;
    }
    &:nth-child(4) {
      width: 120px;
    }
  }
}

// Variant `config`.
:where(.table-skeleton-row--config) {
  tr {
    padding: 0px 8px;
    position: relative;
    &:after {
      content: "";
      border-bottom: 1px solid var(--v-gray-lighten2);
      position: absolute;
      width: 100%;
      left: 0px;
      bottom: 0px;
    }
  }
  tr td {
    border-bottom: transparent;
    &:nth-child(1) {
      width: 175px;

      .v-skeleton-loader {
        max-width: 175px;
      }
    }
    &:nth-child(2) {
      width: 280px;
    }
    &:nth-child(3) {
      max-width: 280px;
    }
    &:nth-child(4) {
      width: 120px;
    }
  }

  .v-skeleton-loader {
    // V2 skeleton: a transparent block whose text bone has a 6px bottom margin and no side margin; V4 puts a 16px margin on every bone
    // (8px top/bottom on the avatar) and paints the block white. Legacy `.v-skeleton-loader__bone` is `margin-bottom: 6px` only.
    background: transparent;

    :deep(.v-skeleton-loader__bone) {
      margin: 0 0 6px;
    }

    :deep(.v-skeleton-loader__avatar) {
      margin: 0;
    }

    &.avatar {
      display: flex;
      justify-content: flex-end;

      :deep(.v-skeleton-loader__avatar) {
        width: 42px;
        height: 42px;
        // V4 caps the avatar bone at 48px (`max-*`) and floors it with `min-*`; the legacy circle is 42px.
        min-width: 42px;
        max-width: 42px;
        min-height: 42px;
        max-height: 42px;
        border-radius: 100%;
      }
    }
  }

  // V2 skeleton bones have no margin except the text bone (`margin-bottom: 6px`); V4 gives every bone 16px.
  .v-skeleton-loader {
    // V2 root: a block that inherits the text colour (V4 root is a flex row with the surface text colour).
    display: block;
    color: inherit;

    :deep(.v-skeleton-loader__bone) {
      margin: 0;
    }

    :deep(.v-skeleton-loader__text) {
      margin-bottom: 6px;
    }
  }
}

// Variant `plugin`. V2 `::v-deep` becomes `:deep()`.
:where(.table-skeleton-row--plugin) {
  tr {
    padding: 0px 8px;
    position: relative;
    &:after {
      content: "";
      border-bottom: 1px solid var(--v-gray-lighten2);
      position: absolute;
      width: 100%;
      left: 0px;
      bottom: 0px;
    }
  }
  tr td {
    border-bottom: transparent;

    &:first-child {
      display: none;
    }
    &:nth-child(2), &:nth-child(4) {
      .v-skeleton-loader {
        width: 175px;
      }
    }
  }

  .v-skeleton-loader {
    // V4 bones carry a 16px margin on every side (V2: `0 0 6px` on text, none on the avatar) and the avatar bone has a 48px minimum height:
    // both are restated.
    :deep(.v-skeleton-loader__text) {
      margin: 0 0 6px;
    }

    &.avatar {
      display: flex;
      justify-content: flex-end;
      :deep(.v-skeleton-loader__avatar) {
        width: 42px;
        height: 42px;
        min-height: 42px;
        max-height: 42px;
        margin: 0;
        border-radius: 100%;
      }
    }
  }
}

// Variant `backups`.
:where(.table-skeleton-row--backups) {
  tr {
    padding: 0 8px;
    position: relative;

    &::after {
      content: '';
      border-bottom: 1px solid var(--v-gray-lighten2);
      position: absolute;
      width: 100%;
      left: 0;
      bottom: 0;
    }
  }

  tr td {
    border-bottom: transparent;

    &:first-child {
      display: none;
    }

    &:nth-child(2) .v-skeleton-loader {
      width: 175px;
    }
  }

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

  .v-skeleton-loader.avatar {
    display: flex;
    justify-content: flex-end;
  }

  .v-skeleton-loader.avatar :deep(.v-skeleton-loader__avatar) {
    flex: 0 0 auto;
    margin: 0;
    width: 42px;
    min-width: 42px;
    max-width: 42px;
    height: 42px;
    min-height: 42px;
    max-height: 42px;
    border-radius: 100%;
  }
}

// Variant `invoice`. The legacy `.avatar` rule styles nothing in this template and is not ported.
:where(.table-skeleton-row--invoice) {
  tr {
    padding: 0px 8px;
    position: relative;
    &:after {
      content: "";
      border-bottom: 1px solid var(--v-skeleton-row-border);
      position: absolute;
      width: 100%;
      left: 0px;
      bottom: 0px;
    }
  }

  tr td {
    border-bottom: transparent;
    width: 210px;

    .v-skeleton-loader {
      max-width: 175px;

      // V2 `.v-skeleton-loader__text` was full width with a 6px bottom margin; the V4 bone has 16px on every side and a narrower width.
      :deep(.v-skeleton-loader__text) {
        margin: 0 0 6px;
        width: 100%;
      }
    }

    // V2 button bone has no margin; V4 gives it 16px on every side (row 81px instead of 49px).
    :deep(.v-skeleton-loader__button) {
      margin: 0;
    }

    &:nth-child(6) {
      width: 280px;
    }
  }
}

// Variant `devices`. The legacy `.avatar` rule styles nothing in this template and is not ported.
:where(.table-skeleton-row--devices) {
  tr {
    padding: 0px 8px;
    height: 58px;
    position: relative;
    &:after {
      content: "";
      border-bottom: 1px solid var(--v-gray-lighten2);
      position: absolute;
      width: 100%;
      left: 0px;
      bottom: 0px;
    }
  }
  tr td {
    border-bottom: transparent;
    // V4 cells are as tall as the table's row height (60px here); the legacy row is 58px.
    height: 58px;

    &:first-child {
      display: none;
    }
    &:nth-child(2) {
      .v-skeleton-loader {
        width: 175px;
      }
    }
  }

  .v-skeleton-loader {
    // V2 `.v-skeleton-loader__text` was full width with a 6px bottom margin; the V4 bone has 16px on every side and a narrower width.
    :deep(.v-skeleton-loader__text) {
      margin: 0 0 6px;
      width: 100%;
    }
  }
}

// Variant `services`. The legacy `.avatar` rule styles nothing in this template and is not ported.
:where(.table-skeleton-row--services) {
  tr {
    padding: 0px 8px;
    position: relative;
    &:after {
      content: "";
      // Legacy literal `#E5E5F0`, not `--v-gray-lighten2` on its own:
      // the map gives the theme token, the same as the mobile skeleton line.
      border-bottom: 1px solid map.get(v.$gray, lighten2);
      position: absolute;
      width: 100%;
      left: 0px;
      bottom: 0px;
    }
  }
  tr td {
    border-bottom: transparent;
    width: 210px;

    .v-skeleton-loader {
      max-width: 175px;
    }

    &:last-child {
      > div {
        display: flex;
        justify-content: flex-end;
      }
    }
  }

  .v-skeleton-loader {
    // V2 `.v-skeleton-loader__text` was full width with a 6px bottom margin; the V4 bone has 16px on every side and a narrower width.
    :deep(.v-skeleton-loader__text) {
      margin: 0 0 6px;
      width: 100%;
    }

    // V2 button bone had no margin (36px high); V4 adds 16px on every side.
    :deep(.v-skeleton-loader__button) {
      margin: 0;
    }
  }
}
</style>
