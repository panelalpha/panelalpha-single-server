<template>
  <div class="advanced-page">
    <PageTitle
      :title="title"
      :title-testid="titleTestid"
      variant="advanced"
    />

    <v-container class="advanced-page__cards">
      <v-row class="advanced-page__row">
        <slot />
      </v-row>
    </v-container>
  </div>
</template>

<script lang="ts" setup>
  // Page of the Advanced frame with setting cards: the page title and the grid of the cards, one look for
  // CDN, Edge cache, Cloudflare, WordPress MCP, Developer settings, Site details, Copy instance, Git, Security and Auto-updates. The default
  // slot is the card columns (`v-col`); modals stay in the screen, next to this component. One root, so the screen's scoped rules reach it.
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'

  withDefaults(defineProps<{
    title: string
    titleTestid?: string
  }>(), {
    titleTestid: undefined,
  })
</script>

<style lang="scss" scoped>
// V4 `.v-row` spaces columns with `gap` and has no negative margin; legacy `.row` is `margin: -16px` with 16px `.col` padding, and the
// `pb-2` of the card columns leaves 8px below each card (24px between cards). The container sits flush under the title (the global
// `.page-title + .v-container` rule drops its top and side padding) and keeps 12px below. Was repeated in eight screens.
.advanced-page__cards {
  padding-top: 0;
  padding-bottom: 12px;
}

.advanced-page__row {
  --v-col-gap-x: 0px;
  --v-col-gap-y: 0px;
  margin: -16px;

  // The columns are slot content: they carry the screen's scope id, so they are reached with `:deep`.
  > :deep(.v-col) {
    padding: 16px;
  }
}
</style>
