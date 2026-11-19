<template>
  <section
    class="go-details"
    data-testid="go-app-details"
  >
    <div class="go-details__head">
      <div class="go-details__title">
        <img
          v-if="app.icon_url && !iconFailed"
          alt=""
          class="go-details__icon"
          :src="app.icon_url"
          @error="iconFailed = true"
        >

        <div>
          <h2 class="go-details__name">
            {{ app.name }}
          </h2>

          <p class="go-details__tagline">
            {{ app.headline || app.tagline }}
          </p>

          <p
            v-if="stars"
            class="go-details__stars"
            data-testid="go-app-details-stars"
            :title="starsTitle"
          >
            ★ {{ t('heading.onboarding.goCatalog.stars', { count: stars }) }}
          </p>
        </div>
      </div>

      <AppButton
        class="go-details__deploy"
        data-testid="go-app-deploy"
        :disabled="!canDeploy"
        kind="primary"
        :loading="deploying"
        size="large"
        @click="deploy"
      >
        <span class="font-weight-600">
          {{ t('button.onboarding.goCatalog.install') }}
          <v-icon
            icon="$arrowright"
            size="20"
          />
        </span>
      </AppButton>
    </div>

    <p
      v-if="failed"
      class="go-details__error"
    >
      {{ t('heading.onboarding.goCatalog.detailsUnavailable') }}
    </p>

    <div
      v-if="shots.length > 0"
      class="go-details__gallery"
    >
      <img
        :alt="app.name"
        class="go-details__shot"
        :src="shots[shot]"
      >

      <div
        v-if="shots.length > 1"
        class="go-details__thumbs"
      >
        <button
          v-for="(url, index) in shots"
          :key="url"
          :aria-label="t('heading.onboarding.goCatalog.screenshot', { number: index + 1 })"
          class="go-details__thumb"
          :class="{ 'go-details__thumb--active': index === shot }"
          type="button"
          @click="shot = index"
        >
          <img
            alt=""
            loading="lazy"
            :src="url"
          >
        </button>
      </div>
    </div>

    <div
      v-if="loading"
      class="go-details__loading"
    >
      <v-progress-circular
        color="primary"
        indeterminate
        size="24"
        width="3"
      />
    </div>

    <template v-else>
      <p
        v-for="(paragraph, index) in paragraphs"
        :key="index"
        class="go-details__description"
      >
        {{ paragraph }}
      </p>
    </template>
  </section>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { type GoAppDetails, starsTitle as starsTitleOf } from './go-catalog.api'

  // The details of a Go app (Go's own app page, shortened): the title row with the deploy button, then the screenshots and the
  // description. The catalog's Back returns to the list. Go only says what to deploy: the button deploys the repository of the `install` Go answered for this app (never a
  // list's) as a Git project.
  const props = defineProps<{
    app: GoAppDetails
    loading: boolean
    failed: boolean
    deploying?: boolean
  }>()
  const emit = defineEmits<{
    deploy: [app: GoAppDetails]
  }>()

  const { t } = useTranslation()
  const shot = ref(0)
  const iconFailed = ref(false)

  const shots = computed(() => {
    const list = props.app.screenshots?.filter(url => typeof url === 'string' && url !== '') ?? []
    if (list.length === 0 && props.app.cover_url) {
      return [props.app.cover_url]
    }
    return list
  })
  const paragraphs = computed(() => (props.app.description ?? '').split(/\n{2,}/).map(text => text.trim()).filter(Boolean))
  // The full count here (41,250), the short one on the card (41k).
  const stars = computed(() => typeof props.app.stars === 'number' ? props.app.stars.toLocaleString('en-US') : null)
  const starsTitle = computed(() => starsTitleOf(props.app, t))
  const canDeploy = computed(() => !props.loading && !props.failed && typeof props.app.install?.git_repo === 'string')

  watch(() => props.app.slug, () => {
    shot.value = 0
    iconFailed.value = false
  })

  function deploy (): void {
    if (canDeploy.value) {
      emit('deploy', props.app)
    }
  }
</script>

<style lang="scss" scoped>
  .go-details {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;

    &__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px 24px;
      margin-bottom: 24px;
    }

    &__title {
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
    }

    &__deploy {
      flex-shrink: 0;
    }

    &__icon {
      width: 56px;
      height: 56px;
      border-radius: 14px;
      object-fit: cover;
    }

    &__name {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      font-size: 28px;
      font-weight: 800;
      line-height: 34px;
    }

    &__stars {
      margin: 4px 0 0;
      font-size: 14px;
      font-weight: 600;
      color: rgba(var(--v-theme-on-surface), 0.7);
    }

    &__tagline {
      margin: 4px 0 0;
      font-size: 16px;
      color: rgba(var(--v-theme-on-surface), 0.7);
    }

    &__gallery {
      margin-bottom: 24px;
    }

    // Go's screenshots are 960x540: never drawn wider, so they are not upscaled (and blurred) on a wide page; centred on the page.
    &__shot {
      display: block;
      width: 100%;
      max-width: 960px;
      height: auto;
      margin: 0 auto;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      object-position: top center;
      border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
      border-radius: 16px;
    }

    &__thumbs {
      display: flex;
      justify-content: safe center;
      gap: 8px;
      margin-top: 12px;
      overflow-x: auto;
    }

    &__thumb {
      flex-shrink: 0;
      width: 96px;
      height: 54px;
      padding: 0;
      overflow: hidden;
      cursor: pointer;
      background: none;
      border: 2px solid transparent;
      border-radius: 8px;
      opacity: 0.7;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: top center;
      }

      &--active {
        border-color: rgb(var(--v-theme-primary));
        opacity: 1;
      }
    }

    &__loading {
      display: flex;
      justify-content: center;
      padding: 24px;
    }

    &__description {
      margin-bottom: 16px;
      font-size: 16px;
      line-height: 26px;
      color: rgba(var(--v-theme-on-surface), 0.85);
    }

    &__error {
      margin: 0 0 16px;
      font-size: 14px;
      color: rgb(var(--v-theme-error));
    }

  }
</style>
