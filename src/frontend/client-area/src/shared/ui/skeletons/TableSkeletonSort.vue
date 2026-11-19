<template>
  <thead
    class="item sort"
    :class="`table-skeleton-sort--${variant}`"
  >
    <tr>
      <th v-if="config.leadingEmpty" />

      <th
        v-for="item in config.bones"
        :key="item"
      >
        <v-skeleton-loader
          :class="config.boneClass"
          type="text"
        />
      </th>

      <th v-if="config.trailingEmpty" />
    </tr>
  </thead>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { SORT_VARIANTS, type TableSkeletonSortVariant } from './table-skeleton'

  // Header skeleton of a table (`thead.item.sort`). One block of styles per variant, prefixed with `:where(.table-skeleton-sort--<variant>)`:
  // the prefix adds no specificity, so every selector weighs what it weighed in the preset the block came from.
  const props = withDefaults(defineProps<{
    variant?: TableSkeletonSortVariant
  }>(), {
    variant: 'logs',
  })

  const config = computed(() => SORT_VARIANTS[props.variant])
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// Variant `logs`.
// The legacy `th`s sat directly in `thead` (the browser wraps them in an anonymous row); the `tr` is explicit here, as the Vue compiler requires.
thead:where(.table-skeleton-sort--logs) {
  th {
    border-bottom: 1px solid map.get(v.$gray, lighten2);

    height: 52px;
    &:first-child {
      .v-skeleton-loader {
        margin-left: 8px;
      }
    }

    &:nth-child(4),
    &:nth-child(5),
    &:nth-child(6) {
      width: 120px;
    }

    padding: 6px 16px;
    .v-skeleton-loader {
      max-width: 62px;
    }

    // V4 gives the `text` bone a 16px margin on every side; V2 only a 6px bottom margin (as the `logs` rows restate).
    :deep(.v-skeleton-loader__text) {
      margin: 0 0 6px;
    }
  }
}

// Variant `config`.
// The legacy `th`s sat directly in `thead` (the browser wraps them in an anonymous row); the `tr` is explicit here, as the Vue compiler requires.
thead:where(.table-skeleton-sort--config) {
  th {
    border-bottom: 1px solid map.get(v.$gray, lighten2);

    height: 52px;
    &:first-child {
      .v-skeleton-loader {
        margin-left: 8px;
      }
    }

    &:nth-child(4),
    &:nth-child(5),
    &:nth-child(6) {
      width: 120px;
    }

    padding: 6px 16px;
    .v-skeleton-loader {
      max-width: 62px;
      background: transparent;

      // V2 bone: `margin-bottom: 6px` only (V4 16px on every side).
      :deep(.v-skeleton-loader__bone) {
        margin: 0 0 6px;
      }
    }
  }
}

// V2 skeleton root (as the `config` rows): a block that inherits the text colour, bones without margin except the text bone
// (`margin-bottom: 6px`); the V4 root is a flex row and every bone has a 16px margin (sort row 44px instead of 18px).
:where(.table-skeleton-sort--config) {
  .v-skeleton-loader {
    // `flow-root`: the text bone's 6px bottom margin stays inside the root (legacy root 18px); the V2 root is transparent and sits in a 16px/24px line.
    display: flow-root;
    background: transparent;
    color: inherit;
    font-size: 16px;
    line-height: 24px;

    :deep(.v-skeleton-loader__bone) {
      margin: 0;
    }

    :deep(.v-skeleton-loader__text) {
      margin-bottom: 6px;
    }
  }
}

// Variant `theme`. The legacy `th`s sat directly in `thead`;
// the explicit `tr` is what the Vue compiler needs here.
thead:where(.table-skeleton-sort--theme) {
  padding: 0px 8px;
  th {
    border-bottom: 1px solid map.get(v.$gray, lighten2);
    padding: 0 16px; // V4 adds the legacy 6 px vertical padding to the 52 px height (57 px row)

    height: 52px;
    &:first-child {
      display: none;
    }
    &:nth-child(3) {
      width: 176px;
    }

    .v-skeleton-loader {
      max-width: 62px;
    }
  }
}

// Variant `plugin`. The legacy `th`s sat directly in `thead`;
// the explicit `tr` is what the Vue compiler needs here.
thead:where(.table-skeleton-sort--plugin) {
  padding: 0px 8px;
  th {
    border-bottom: 1px solid map.get(v.$gray, lighten2);

    height: 52px;
    &:first-child {
      display: none;
    }
    &:nth-child(3) {
      width: 176px;
    }

    &:nth-child(4) {
      width: 50%;
    }

    padding: 6px 16px;
    .v-skeleton-loader {
      max-width: 62px;

      // V2 `.v-skeleton-loader__text` was full width with a 6px bottom margin; the V4 bone has 16px on every side and a narrower width.
      :deep(.v-skeleton-loader__text) {
        margin: 0 0 6px;
        width: 100%;
      }
    }
  }
}

// Variant `backups`.
// `thead.sort tr th` outranks the global `.data-table thead tr th` (14px, bold, uppercase), which the legacy cells (no `tr`) never matched;
// `.sort` stays in front of `:where()`, so the selector weighs (0,2,3) as it did in the preset.
thead.sort:where(.table-skeleton-sort--backups) {
  padding: 0 8px;

  tr th {
    border-bottom: 1px solid map.get(v.$gray, lighten2);
    height: 52px;
    padding: 6px 16px;

    &:first-child {
      display: none;
    }

    &:nth-child(3),
    &:nth-child(7) {
      width: 176px;
    }

    &:nth-child(4),
    &:nth-child(5),
    &:nth-child(6) {
      width: 120px;
    }

    // The legacy `calculate-widths` colgroup gives the last (actions) column 180px; V4 sizes it to its content (162px).
    &:nth-child(8) {
      width: 180px;
    }

    font-size: 16px;
    line-height: 24px;
    text-transform: none;

    .v-skeleton-loader {
      display: flow-root;
      color: inherit;
      max-width: 62px;
    }

    .v-skeleton-loader :deep(.v-skeleton-loader__text) {
      margin: 0 0 6px;
      width: 100%;
    }
  }
}

// Variant `invoice`.
// The legacy `th`s sat directly in `thead` (the browser wraps them in an anonymous row); the `tr` is explicit here, as the Vue compiler requires.
thead:where(.table-skeleton-sort--invoice) {
  // V4 `th` is as tall as `--v-table-header-height` plus the 1px border (57px); the legacy header is 52px.
  --v-table-header-height: 51px;
  th {
    border-bottom: 1px solid map.get(v.$gray, lighten2);

    height: 52px;
    &:first-child {
      .v-skeleton-loader {
        margin-left: 8px;
      }
    }

    width: 210px;
    &:nth-child(6) {
      width: 280px;
    }

    padding: 6px 16px;
    .v-skeleton-loader {
      max-width: 62px;

      // V2 `.v-skeleton-loader__text` was full width with a 6px bottom margin; the V4 bone has 16px on every side and a narrower width.
      :deep(.v-skeleton-loader__text) {
        margin: 0 0 6px;
        width: 100%;
      }
    }
  }
}

// Variant `devices`.
// The legacy `th`s sat directly in `thead` (the browser wraps them in an anonymous row); the `tr` is explicit here, as the Vue compiler requires.
thead:where(.table-skeleton-sort--devices) {
  padding: 0px 8px;
  // V4 `th` is as tall as `--v-table-header-height` plus the 1px border (57px); the legacy header is 52px.
  --v-table-header-height: 51px;
  th {
    border-bottom: 1px solid map.get(v.$gray, lighten2);

    height: 52px;
    &:first-child {
      display: none;
    }

    &:nth-child(3),
    &:nth-child(7) {
      width: 176px;
    }

    &:nth-child(4),
    &:nth-child(5),
    &:nth-child(6) {
      width: 120px;
    }

    padding: 6px 16px;
    .v-skeleton-loader {
      max-width: 62px;

      // V2 `.v-skeleton-loader__text` was full width with a 6px bottom margin; the V4 bone has 16px on every side and a narrower width.
      :deep(.v-skeleton-loader__text) {
        margin: 0 0 6px;
        width: 100%;
      }
    }
  }
}

// Variant `services`.
// The legacy `th`s sat directly in `thead` (the browser wraps them in an anonymous row); the `tr` is explicit here, as the Vue compiler requires.
thead:where(.table-skeleton-sort--services) {
  max-width: 100%;
  // V4 `th` is as tall as `--v-table-header-height` plus the 1px border (57px); the legacy header is 52px.
  --v-table-header-height: 51px;
  th {
    border-bottom: 1px solid map.get(v.$gray, lighten2);

    height: 52px;
    &:first-child {
      .v-skeleton-loader {
        margin-left: 8px;
      }
    }

    &:nth-child(1) {
      width: 566px;
    }
    &:nth-child(2) {
      width: 177px;
    }
    &:nth-child(3) {
      width: 436px;
    }
    &:nth-child(4) {
      width: 147px;
    }
    &:last-child {
      > div {
        margin-left: auto;
      }
    }
    padding: 6px 16px;
    .v-skeleton-loader {
      max-width: 62px;
      // V2 skeleton root inherits the body text size and colour (16px / 24px, theme text); V4 sets 14px / 20px and the surface colour.
      color: var(--v-text-default);
      font-size: map.get(v.$paragraphs, base, font-size);
      line-height: map.get(v.$paragraphs, base, line-height);

      // V2 `.v-skeleton-loader__text` was full width with a 6px bottom margin; the V4 bone has 16px on every side and a narrower width.
      :deep(.v-skeleton-loader__text) {
        margin: 0 0 6px;
        width: 100%;
      }
    }
  }
}
</style>
