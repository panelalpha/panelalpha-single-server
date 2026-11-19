<template>
  <tbody class="item">
    <tr
      v-for="item in rowsNumber"
      :key="item"
    >
      <td />

      <td>
        <div class="d-flex flex-column">
          <v-skeleton-loader
            class="skeleton-name"
            type="text"
          />

          <v-skeleton-loader type="text" />
        </div>
      </td>

      <td
        v-for="itemCell in 5"
        :key="itemCell"
        class="pl-0"
      >
        <v-skeleton-loader type="text" />
      </td>

      <td class="skeleton-action">
        <v-skeleton-loader type="button" />
      </td>
    </tr>
  </tbody>
</template>

<script lang="ts" setup>
  // The legacy `rowsNumber` prop is kept; the
  // page passes its per-page count. The first cell is hidden, as the legacy `tr td:first-child` rule does.
  withDefaults(defineProps<{
    rowsNumber?: number
  }>(), {
    rowsNumber: 8,
  })
</script>

<style lang="scss" scoped>
// V2 `::v-deep` becomes `:deep()`.
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
  &:nth-child(2),
  &:nth-child(4) {
    .v-skeleton-loader {
      width: 175px;
    }
  }
}

// Inline `width: 50%` on the first name skeleton as a class. Specificity
// is higher than the rule `tr td:nth-child(2) .v-skeleton-loader` (175px), so 50% still wins (the inline style won over it before).
tr td:nth-child(2) .v-skeleton-loader.skeleton-name {
  width: 50%;
}

// Inline `width: 40px` on the action cell as a class.
tr td.skeleton-action {
  width: 40px;
}

.v-skeleton-loader {
  :deep(.v-skeleton-loader__button) {
    width: 36px;
    height: 36px;
  }
}
</style>
