<template>
  <tbody class="item">
    <tr
      v-for="item in rowsNumber"
      :key="item"
    >
      <td />

      <td>
        <div class="d-flex align-center">
          <v-skeleton-loader
            class="mr-3"
            type="avatar"
          />

          <div
            class="d-flex flex-column name-skeleton"
          >
            <v-skeleton-loader
              class="name-skeleton__title"
              type="text"
            />

            <v-skeleton-loader type="text" />
          </div>
        </div>
      </td>

      <td
        v-for="itemCell in 2"
        :key="itemCell"
        class="pl-0"
      >
        <v-skeleton-loader type="text" />
      </td>

      <td class="action-skeleton">
        <div class="d-flex align-center">
          <v-skeleton-loader
            class="mr-3"
            type="button"
          />

          <v-skeleton-loader type="button" />
        </div>
      </td>
    </tr>
  </tbody>
</template>

<script lang="ts" setup>
  // The legacy `rowsNumber` prop is kept; the page passes its per-page count. The first cell is hidden, as the legacy `tr td:first-child` rule does.
  withDefaults(defineProps<{
    rowsNumber?: number
  }>(), {
    rowsNumber: 8,
  })
</script>

<style lang="scss" scoped>
// The inline `width` of the name column, the title and the action column, as classes.
.name-skeleton {
  width: 400px;
}

.name-skeleton__title {
  width: 50%;
}

.action-skeleton {
  width: 40px;
}

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
}

.v-skeleton-loader {
  :deep(.v-skeleton-loader__button) {
    width: 36px;
    height: 36px;
  }

  :deep(.v-skeleton-loader__avatar) {
    width: 64px;
    height: 64px;
    max-width: 64px;
  }
}
</style>
