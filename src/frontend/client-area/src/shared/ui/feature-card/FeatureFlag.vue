<template>
  <component
    :is="as ?? 'span'"
    class="feature-flag"
    :class="{ 'feature-flag--loading': loading }"
  >
    <v-skeleton-loader
      v-if="loading"
      class="feature-flag__bone"
      type="image"
    />

    <template v-else>
      <slot name="icon" />
      <slot />
    </template>
  </component>
</template>

<script lang="ts" setup>
  // The flag over the top edge of a feature card (mock-up B2 `.card .flag`): "Recommended" on the Hub card of the wizard, "Free" and
  // "Connected" on the PanelAlpha Hub card of Settings, "Included with PanelAlpha Hub" on Summary. The card holding it is
  // `position: relative`; `as` gives it the tag of a heading where the flag names the card (Summary). `loading` keeps the place and the
  // ring of the flag with a bone in it (the loading state of `FeatureCard`), so the flag does not move when the card arrives.
  defineProps<{
    as?: 'span' | 'h3'
    loading?: boolean
  }>()
</script>

<style lang="scss" scoped>
  @use 'sass:map';
  @use '@/app/styles/legacy/tokens/variables' as v;

  $below-sm: map.get(v.$grid-breakpoints, sm) - 0.02px;

  // The flag hangs over the top edge; the 4px ring cuts the frame behind it. 12/700 as the chips of admin area.
  .feature-flag {
    position: absolute;
    z-index: 1;
    top: -13px;
    left: 22px;
    display: inline-flex;
    gap: 6px;
    align-items: center;
    height: 26px;
    margin: 0;
    padding: 0 12px 0 10px;
    border-radius: 999px;
    color: var(--v-white-base);
    font-size: v.$font-size-xxs;
    font-weight: v.$font-weight-bold;
    line-height: 1.5;

    @media (max-width: $below-sm) {
      left: 14px;
    }

    // The ring (`::before`) and the fill (`::after`) are layers under the text, inside the flag's own stacking context. The half of
    // the ring over the edge is in the page colour and hides the frame; the half inside the card is transparent and shows the card's
    // own fill. A one-colour ring drew a white outline around the flag on a tinted card (the green of a connected card).
    &::before,
    &::after {
      content: "";
      position: absolute;
      z-index: -1;
      border-radius: inherit;
    }

    &::before {
      inset: -4px;
      background: linear-gradient(to bottom, var(--v-feature-card-ring) 50%, transparent 50%);
    }

    &::after {
      inset: 0;
      background: var(--v-feature-card-flag-bg);
    }
  }

  // The bone of a loading card: the place, the size and the ring of a short flag, the V4 `image` bone as the fill. The flag is filled
  // in the card colour, so the translucent bone does not show the two halves of the ring through it.
  .feature-flag--loading {
    width: 96px;
    padding: 0;

    &::after {
      background: var(--v-feature-card-bg);
    }
  }

  .feature-flag__bone {
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: inherit;
    background: transparent;

    :deep(.v-skeleton-loader__image) {
      height: 100%;
      min-height: 0;
    }
  }
</style>
