<template>
  <div
    class="hub-diagram"
    :class="{ 'hub-diagram--ok': ok }"
    :data-testid="testid ?? 'hub-diagram'"
  >
    <img
      :alt="alt"
      class="hub-diagram__image"
      height="500"
      :src="ok ? hubDiagramOkUrl : hubDiagramUrl"
      width="960"
    >
  </div>
</template>

<script lang="ts" setup>
  import hubDiagramOkUrl from './assets/hub-diagram-ok.gif'
  import hubDiagramUrl from './assets/hub-diagram.gif'

  // The diagram of the PanelAlpha Hub card (960 x 500 animation). It carries its own texts, so the image has one `alt` for all of them.
  // The background stays light in both themes (`--v-feature-card-diagram-bg`): the animation has the light background burnt in.
  // `ok` (the connected card) shows the same frames with the gray background swapped for the green of `--v-feature-card-ok-bg` over
  // white (`hub-diagram-ok.gif`: only the palette differs), so the picture does not sit in a gray box on the green card.
  defineProps<{
    alt: string
    testid?: string
    ok?: boolean
  }>()
</script>

<style lang="scss" scoped>
  // The animation is drawn on gray-50 (the old `.diagram` background), so the frame keeps the radius and the colour around the image.
  .hub-diagram {
    overflow: hidden;
    border-radius: var(--v-feature-card-diagram-radius);
    background: var(--v-feature-card-diagram-bg);
  }

  .hub-diagram--ok {
    background: var(--v-feature-card-ok-diagram-bg);
  }

  .hub-diagram__image {
    display: block;
    width: 100%;
    height: auto;
  }
</style>
