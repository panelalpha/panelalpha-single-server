<template>
  <div class="skeleton px-4 py-4 d-flex">
    <v-skeleton-loader type="avatar" />

    <v-skeleton-loader
      class="ml-3"
      type="text@2"
      width="100px"
    />
  </div>
</template>

<style lang="scss" scoped>
// The width of the search list (`.instance-search-menu__list`), within the menu's
// `100vw - 48px` cap on a narrow window.
.skeleton {
  width: 473px;
  max-width: 100%;
}
</style>
