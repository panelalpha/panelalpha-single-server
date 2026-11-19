<template>
  <ul
    class="feature-checks"
    :class="{ 'feature-checks--row': row, 'feature-checks--wide': layout === 'wide' }"
  >
    <li
      v-for="(item, index) in items"
      :key="index"
      :data-testid="itemTestid"
    >
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2.4"
        viewBox="0 0 24 24"
        width="18"
      >
        <path d="M5 12l5 5L20 7" />
      </svg>

      <span v-if="typeof item === 'string'">{{ item }}</span>
      <span v-else><b>{{ item.title }}</b> · {{ item.text }}</span>
    </li>
  </ul>
</template>

<script lang="ts" setup>
  // The lines with a check of the feature cards: the benefits of the Hub card (wizard step 1, Settings), the Connect AI card (step 3,
  // both through `FeatureCard.vue`) and "Included with PanelAlpha Hub" on Summary. `row` puts the lines side by side from the rail width
  // up (`wide`: from `xl`, the card of Settings has a picture beside the lines).
  defineProps<{
    /** The lines, translated: a text, or a bold title and a text (`<b>title</b> · text`). */
    items: Array<string | { title: string, text: string }>
    row?: boolean
    layout?: 'wizard' | 'wide'
    itemTestid?: string
  }>()
</script>

<style lang="scss" scoped>
  @use 'sass:map';
  @use '@/app/styles/legacy/tokens/variables' as v;

  $lg: map.get(v.$grid-breakpoints, lg);
  $xl: map.get(v.$grid-breakpoints, xl);

  // The lines of the benefits (`.benefit span`, 13.5px in `gray-darken1`) with a `primary` check.
  .feature-checks {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    color: var(--v-feature-card-checks-text);
    font-size: 14.5px;
    line-height: 1.5;
    list-style: none;

    li {
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }

    svg {
      flex: none;
      margin-top: 2px;
      color: var(--v-feature-card-accent);
    }

    b {
      color: var(--v-feature-card-title);
      font-weight: v.$font-weight-bold;
    }
  }

  // Side by side in equal columns, one under the other below the rail width.
  .feature-checks--row {
    @media (min-width: $lg) {
      grid-auto-columns: minmax(0, 1fr);
      grid-auto-flow: column;
      gap: 24px;
    }
  }

  // The card of Settings: the lines of the mock-up (`.fc__checks`), 14px with an 8px gap.
  .feature-checks--wide {
    gap: 8px;
    font-size: 14px;

    li {
      gap: 8px;
    }

    svg {
      margin-top: 3px;
    }
  }

  // The card of Settings keeps a column for the picture, so the lines wait for `xl`.
  .feature-checks--wide.feature-checks--row {
    @media (max-width: $xl - 0.02px) {
      grid-auto-flow: row;
      gap: 8px;
    }
  }
</style>
