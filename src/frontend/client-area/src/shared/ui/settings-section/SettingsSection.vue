<template>
  <div class="settings-section">
    <v-row class="my-0">
      <v-col
        class="pa-4"
        cols="12"
        md="3"
      >
        <p class="p-1 mb-0 font-weight-600 heading--text">
          {{ title }}
        </p>
      </v-col>

      <v-col
        class="pt-0 pt-md-6 pb-6"
        cols="12"
        md="9"
      >
        <slot />
      </v-col>
    </v-row>

    <v-divider
      v-if="divider"
      class="settings-section__divider mx-n6"
    />
  </div>
</template>

<script lang="ts" setup>
  // Put it directly in a `v-card-text.pa-6`: the divider bleeds by that padding (mx-n6).
  // (A template comment before the root would make it a fragment, so the note lives here.)
  withDefaults(defineProps<{
    title: string
    divider?: boolean
  }>(), {
    divider: true,
  })
</script>

<style lang="scss" scoped>
// Vuetify caps `.v-divider` at `max-width: 100%`, which would stop the -24px margins from widening it.
.settings-section__divider {
  max-width: none;
}
</style>
