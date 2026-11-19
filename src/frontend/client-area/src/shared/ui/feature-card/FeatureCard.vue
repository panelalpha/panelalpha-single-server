<template>
  <div
    :aria-busy="busy || loading ? 'true' : undefined"
    class="feature-card"
    :class="{
      'feature-card--ok': ok,
      'feature-card--busy': busy || loading,
      'feature-card--wide': layout === 'wide',
    }"
  >
    <template v-if="loading">
      <FeatureFlag loading />

      <div class="feature-card__main">
        <v-skeleton-loader
          class="feature-card__bone feature-card__bone--title"
          type="image"
        />

        <v-skeleton-loader
          class="feature-card__bone feature-card__bone--lead"
          type="image"
        />

        <v-skeleton-loader
          v-for="n in 3"
          :key="n"
          class="feature-card__bone feature-card__bone--check"
          type="image"
        />

        <v-skeleton-loader
          class="feature-card__bone feature-card__bone--button"
          type="image"
        />
      </div>

      <v-skeleton-loader
        class="feature-card__bone feature-card__bone--aside"
        type="image"
      />
    </template>

    <template v-else>
      <FeatureFlag>
        <template #icon>
          <slot name="flag-icon" />
        </template>
        {{ flag }}
      </FeatureFlag>

      <div class="feature-card__main">
        <component
          :is="titleTag"
          class="feature-card__title"
          :data-testid="titleTestid"
        >
          {{ title }}
        </component>

        <p
          v-if="$slots.lead"
          class="feature-card__lead"
        >
          <slot name="lead" />
        </p>

        <FeatureCheckList
          class="feature-card__checks"
          :items="checks"
          :layout="layout"
          :row="checksRow"
        />

        <slot name="action" />

        <div
          v-if="$slots.note"
          class="feature-card__note"
        >
          <slot name="note" />
        </div>
      </div>

      <slot name="aside" />
    </template>
  </div>
</template>

<script lang="ts" setup>
  import FeatureCheckList from './FeatureCheckList.vue'
  import FeatureFlag from './FeatureFlag.vue'

  // The card of a choice with a flag over the top edge (variant B2, mock-up `.card`, `:43-48`, `:187-219`): the title, the lead, the
  // checks and the button (slot `action`) on the left, a picture (slot `aside`) on the right, under the checks on a window narrower than
  // the rail. The wizard (step 1 "Connect with PanelAlpha Hub", step 3 Connect AI) and the PanelAlpha Hub card of Settings use it, so
  // all of them look the same. `ok` paints it in the green of a connected state, `busy` greys the frame while an action runs.
  // Colours come from `--v-feature-card-*` only (`themes-variables.scss`; the wizard sets them to its palette in `WizardLayout.vue`).
  // `layout`: `wizard` is the card of the steps, `wide` the card of Settings (a wider text column, the lines in a row from `xl`).
  // `loading` is the skeleton of the card in the same frame and grid (bones for the flag, the title, the lead, three lines, the button
  // and the picture; grey frame, `aria-busy`), so the card does not jump when the content arrives; the texts are not needed then.
  // `titleTag` keeps the heading level of the page (Settings: `h2` under the `h1` of the page); the look is the same for every tag.
  // The root takes `class` and `data-testid` of the consumer.
  withDefaults(defineProps<{
    flag?: string
    title?: string
    /** The lines with a check, translated: a text, or a bold title and a text. */
    checks?: Array<string | { title: string, text: string }>
    loading?: boolean
    titleTag?: 'h2' | 'h3'
    ok?: boolean
    /** Grey frame while an action of the card runs (`aria-busy`). */
    busy?: boolean
    layout?: 'wizard' | 'wide'
    titleTestid?: string
    /** The lines side by side from the rail width up. */
    checksRow?: boolean
  }>(), { flag: '', title: '', checks: () => [], layout: 'wizard', titleTag: 'h3' })
</script>

<style lang="scss" scoped>
  @use 'sass:map';
  @use '@/app/styles/legacy/tokens/variables' as v;

  $below-lg: map.get(v.$grid-breakpoints, lg) - 0.02px;
  $below-sm: map.get(v.$grid-breakpoints, sm) - 0.02px;

  // The frame of `.hub-status` (`PanelAlphaConnect.vue:456-508`: 1px, 12px radius) in `primary`, as the recommended path; two columns
  // (`.connect-content`, 40px gap), one on a window narrower than the rail.
  .feature-card {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
    gap: 40px;
    align-items: center;
    margin-top: 16px;
    padding: 32px 24px 24px;
    border: 1px solid var(--v-feature-card-border);
    border-radius: var(--v-feature-card-radius);
    background: var(--v-feature-card-bg);
    font-size: v.$font-size-sm;
    line-height: 1.5;

    @media (max-width: $below-lg) {
      grid-template-columns: 1fr;
      gap: 24px;
    }

    @media (max-width: $below-sm) {
      padding: 28px 16px 16px;
    }
  }

  // The card of Settings (mock-up of `ui-fix-v2`, variant B): the text takes the wider column, the picture the narrower one.
  .feature-card--wide {
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
    gap: 32px;
    margin-top: 13px;
    padding: 28px 24px 24px;

    @media (max-width: $below-lg) {
      grid-template-columns: 1fr;
      gap: 24px;
    }

    @media (max-width: $below-sm) {
      padding: 28px 16px 16px;
    }
  }

  // `.hub-status--ok` (`PanelAlphaConnect.vue:471-472`): the step is done.
  .feature-card--ok {
    border-color: var(--v-feature-card-ok-border);
    background: var(--v-feature-card-ok-bg);
  }

  // An action of the card runs (connecting, checking) or the card is loading: the frame goes grey.
  .feature-card--busy {
    border-color: var(--v-feature-card-busy-border);
  }

  // `h6.font-weight-bold` of the steps: 18/28/700.
  .feature-card__title {
    margin: 0 0 12px;
    color: var(--v-feature-card-title);
    font-size: v.$font-size-lg;
    font-weight: v.$font-weight-bold;
    line-height: 28px;
  }

  // The lead sits under the title and takes over its space to the checks (mock-up `.fc__lead`: 4px / 16px).
  .feature-card__lead {
    margin: 4px 0 16px;
    color: var(--v-feature-card-lead);
    font-size: inherit;
    line-height: inherit;
  }

  .feature-card--wide .feature-card__title {
    margin: 0;
    font-size: v.$font-size-lg;
  }

  // Two classes, so it wins over the `margin: 0` of `FeatureCheckList.vue` whatever the order of the chunks.
  .feature-card .feature-card__checks {
    margin-bottom: 24px;
  }

  .feature-card--wide .feature-card__checks {
    margin-bottom: 20px;
  }

  // Under the button (the redirect note, the pending note): 13px, left on a wide window, centred in one column (mock-up `.fc__note`).
  .feature-card__note {
    margin-top: 10px;
    color: var(--v-feature-card-lead);
    font-size: v.$font-size-xs;
    line-height: 1.5;

    @media (max-width: $below-lg) {
      text-align: center;
    }
  }

  // The bones of `loading` (mock-up `.fc-skel`): the V4 `image` bone shrunk to a block of the given size; the root surface is
  // transparent, so only the bone is painted. The flag bone is `FeatureFlag` with `loading` (the same place as the flag).
  .feature-card__bone {
    display: block;
    border-radius: 4px;
    background: transparent;

    :deep(.v-skeleton-loader__image) {
      height: 100%;
      min-height: 0;
      border-radius: inherit;
    }

    &--title {
      width: 60%;
      height: 24px;
    }

    &--lead {
      width: 80%;
      height: 16px;
      margin: 12px 0 20px;
    }

    &--check {
      width: 100%;
      height: 16px;
      margin-bottom: 10px;
    }

    &--button {
      width: 220px;
      height: 48px;
      margin-top: 10px;
    }

    &--aside {
      width: 100%;
      aspect-ratio: 960 / 500;
    }
  }
</style>
