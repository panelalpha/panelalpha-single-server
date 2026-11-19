<template>
  <!-- V4 has no `v-list-item-group`: the items sit in a plain flex box. -->
  <v-col
    class="sticky-sidebar pt-8"
    cols="12"
    lg="2"
  >
    <v-list class="pt-0 sticky-sidebar__item">
      <div class="d-flex flex-row flex-lg-column justify-start">
        <v-list-item
          :ripple="false"
          value=""
        >
          <v-list-item-title>
            <v-skeleton-loader type="heading" />
          </v-list-item-title>
        </v-list-item>

        <v-list-item
          v-for="item in 10"
          :key="item"
          :ripple="false"
        >
          <v-list-item-title>
            <v-skeleton-loader type="text" />
          </v-list-item-title>
        </v-list-item>
      </div>
    </v-list>
  </v-col>
</template>

<script lang="ts" setup>
</script>

<style lang="scss" scoped>
.sticky-sidebar {
  position: relative;
}

.sticky-sidebar__item {
  position: sticky;
  padding-left: 0;
  top: 24px;
  left: 0;
  background: unset;
}
</style>
