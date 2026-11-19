<template>
  <div class="progress-card">
    <div
      v-if="$slots.logo"
      class="progress-card__logo d-flex justify-center"
    >
      <slot name="logo" />
    </div>

    <div class="d-flex justify-center pt-16">
      <h1
        class="d-flex flex-column align-center text-center"
        :class="genericTitle ? 'progress-card__title--h1' : 'progress-card__title'"
      >
        <slot name="title" />
      </h1>
    </div>

    <p
      v-if="$slots.subtitle"
      class="p-1 pt-6 mb-0 text-center heading--text progress-card__subtitle"
    >
      <slot name="subtitle" />
    </p>

    <div
      v-if="showImage"
      class="mt-8 progress-card__image"
      :class="[imageClass, { 'progress-card__image--brand': barTone === 'brand', 'progress-card__image--bare': bare }]"
    >
      <Loader
        :color="loaderColor"
        :completed="completed"
        :size="120"
        :width="12"
      >
        <slot />
      </Loader>

      <slot name="media" />
    </div>

    <div
      v-if="$slots.actions"
      class="progress-card__actions"
    >
      <slot name="actions" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import Loader from '@/shared/ui/loader/Loader.vue'

  // Progress card of the onboarding installation, super-quick, sync and import modals.
  // Same DOM and class names as the app-lite installation card; the colours come from the `--v-progress-*` tokens (`:root` theme variables).
  const props = withDefaults(defineProps<{
    status?: 'in-progress' | 'success' | 'failed'
    /** Working bar colour: `neutral` (installation, app-lite grey) or `brand` (super-quick and sync, app-lite primary). */
    barTone?: 'neutral' | 'brand'
    /** The legacy setup-complete import hides the bar box on success (`v-if="!completed || error"`); default true. */
    showImage?: boolean
    /** The app-lite setup-complete import modal has no `.installation-card__image` rules: no gradient, shadow or rounding on the bar box. */
    bare?: boolean
    /** Same modal keeps the generic `h1` (36px / 48px) instead of the installation 40px / 50px heading. */
    genericTitle?: boolean
  }>(), {
    status: 'in-progress',
    barTone: 'neutral',
    showImage: true,
    bare: false,
    genericTitle: false,
  })

  const completed = computed(() => props.status !== 'in-progress')

  const imageClass = computed(() => {
    if (props.status === 'in-progress') {
      return 'progress-card__image--working'
    }
    return props.status === 'failed' ? 'progress-card__image--error' : 'progress-card__image--success'
  })

  const loaderColor = 'var(--v-progress-loader-color)'
</script>

<style lang="scss" scoped>
  @use '@/app/styles/legacy/tokens/variables' as v;

  .progress-card {
    width: 100%;

    // The `installation-card` heading (h1 40px / 50px).
    &__title {
      font-size: 40px;
      line-height: 50px;
    }

    // The app-lite modals hold the action row inside `d-flex flex-column align-center`:
    // the row shrinks to its buttons and sits in the middle.
    &__actions {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    // App-lite setup-complete modal: scoped `h1 { font-size: $font-size-h1; line-height: $line-height-h1 }`, fixed 36px / 48px (the global mobile 26px / 36px does not apply).
    &__title--h1 {
      font-size: v.$font-size-h1;
      line-height: v.$line-height-h1;
    }

    &__image {
      width: 100%;
      position: relative;
      border-radius: 16px;
      box-shadow: var(--v-progress-card-shadow);

      // `:deep`: the `v-img` comes from the parent's slot, so it carries the parent's scope id, not this component's.
      > :deep(.v-img) {
        border-radius: 16px;
        position: relative;

        &::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: 100%;
          backdrop-filter: blur(8px);
          z-index: 90;
        }
      }

      .loader {
        position: absolute;
        z-index: 100;
        width: 100%;
        height: 100%;
        top: 0;
        left: 0;
        display: flex;
        align-items: center;
      }

      &::before,
      &::after {
        content: "";
        position: absolute;
        width: 100%;
        height: 100%;
        left: 0;
        top: 0;
        z-index: 99;
        border-radius: 16px;
        transition: opacity 0.5s ease;
      }

      &::before {
        background: var(--v-progress-working-gradient);
        opacity: 1;
      }

      &::after {
        background: var(--v-progress-working-gradient);
        opacity: 0;
      }

      // `bare`: after the status modifiers, so it wins over `--error` / `--success`.
      &--bare {
        border-radius: 0;
        box-shadow: none;

        &::before,
        &::after {
          display: none;
        }

        // App-lite has no `.loader` overlay rule in this modal: the loader (120px + 2 x 16px margin) stays in the flow and gives the box its height.
        .loader {
          position: static;
          width: auto;
          height: auto;
        }
      }

      &--brand {
        &::before,
        &::after {
          background: var(--v-progress-brand-gradient);
        }
      }

      &--error::before,
      &--success::before {
        opacity: 0;
      }

      &--error::after,
      &--success::after {
        opacity: 1;
      }

      &--error::after {
        background: var(--v-progress-error-gradient);
      }

      &--success::after {
        background: var(--v-progress-success-gradient);
      }
    }
  }
</style>
