<template>
  <div class="git-skeleton">
    <!-- Connection card -->
    <v-card elevation="4">
      <v-card-text class="d-flex justify-space-between text--gray-darken2 v-card--mobile">
        <div>
          <v-skeleton-loader class="title-skeleton" type="heading" />
          <v-skeleton-loader class="subtitle-skeleton mt-1" type="text" />
        </div>

        <div class="d-flex align-center">
          <v-skeleton-loader class="button" type="heading" />
        </div>
      </v-card-text>

      <v-divider class="mt-5" />

      <v-card-text>
        <template v-if="connected">
          <div class="d-flex flex-wrap align-center">
            <v-skeleton-loader class="kv-label mr-2" type="text" />
            <v-skeleton-loader class="kv-value-inline" type="text" />
          </div>
        </template>

        <template v-else>
          <div class="d-flex mb-4">
            <v-skeleton-loader class="toggle-btn mr-2" type="heading" />
            <v-skeleton-loader class="toggle-btn" type="heading" />
          </div>

          <v-skeleton-loader class="field mb-2" type="heading" />

          <div class="d-flex align-center justify-space-between mb-2">
            <v-skeleton-loader class="kv-label" type="text" />
            <v-skeleton-loader class="switch" type="heading" />
          </div>
        </template>
      </v-card-text>
    </v-card>

    <template v-if="connected">
      <!-- Branch card -->
      <v-card class="mt-4" elevation="4">
        <v-card-text class="d-flex justify-space-between text--gray-darken2 v-card--mobile">
          <div>
            <v-skeleton-loader class="title-skeleton" type="heading" />
            <v-skeleton-loader class="subtitle-skeleton mt-1" type="text" />
          </div>

          <div class="d-flex align-center">
            <v-skeleton-loader class="status-text mx-4" type="text" />
            <v-skeleton-loader class="button button--text" type="heading" />
          </div>
        </v-card-text>
      </v-card>

      <!-- Last Deployed Commit card -->
      <v-card class="mt-4" elevation="4">
        <v-card-text class="d-flex justify-space-between text--gray-darken2 v-card--mobile">
          <div>
            <v-skeleton-loader class="title-skeleton" type="heading" />
            <v-skeleton-loader class="subtitle-skeleton mt-1" type="text" />
          </div>

          <div class="d-flex align-center">
            <v-skeleton-loader class="button button--text" type="heading" />
          </div>
        </v-card-text>

        <v-divider class="mt-5" />

        <v-card-text class="git-commit-details">
          <v-row
            v-for="row in 3"
            :key="'commit-' + row"
            class="git-kv-row"
            dense
          >
            <v-col cols="12" sm="3">
              <v-skeleton-loader class="kv-label" type="text" />
            </v-col>

            <v-col cols="12" sm="9">
              <v-skeleton-loader class="kv-value" type="text" />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- Auto Deploy card -->
      <v-card class="mt-4" elevation="4">
        <v-card-text class="text--gray-darken2">
          <div class="d-flex justify-space-between flex-wrap v-card--mobile">
            <div class="mb-2 mb-sm-0">
              <v-skeleton-loader class="title-skeleton" type="heading" />
              <v-skeleton-loader class="subtitle-skeleton mt-1" type="text" />
            </div>

            <div class="d-flex align-center">
              <v-skeleton-loader class="switch" type="heading" />
            </div>
          </div>
        </v-card-text>
      </v-card>

      <!-- Pull card -->
      <v-card class="mt-4" elevation="4">
        <v-card-text class="d-flex justify-space-between text--gray-darken2 v-card--mobile">
          <div>
            <v-skeleton-loader class="title-skeleton" type="heading" />
            <v-skeleton-loader class="subtitle-skeleton mt-1" type="text" />
          </div>

          <div class="d-flex align-center">
            <v-skeleton-loader class="button button--primary" type="heading" />
          </div>
        </v-card-text>
      </v-card>

      <!-- Push card -->
      <v-card class="mt-4" elevation="4">
        <v-card-text class="d-flex justify-space-between text--gray-darken2 v-card--mobile">
          <div>
            <v-skeleton-loader class="title-skeleton" type="heading" />
            <v-skeleton-loader class="subtitle-skeleton mt-1" type="text" />
          </div>

          <div class="d-flex align-center">
            <v-skeleton-loader class="button button--primary" type="heading" />
          </div>
        </v-card-text>
      </v-card>

      <!-- Logs card -->
      <v-card class="mt-4" elevation="4">
        <v-card-text class="d-flex justify-space-between text--gray-darken2 v-card--mobile">
          <div>
            <v-skeleton-loader class="title-skeleton" type="heading" />
            <v-skeleton-loader class="subtitle-skeleton mt-1" type="text" />
          </div>
        </v-card-text>

        <v-divider class="mt-5" />

        <v-card-text>
          <div
            v-for="row in 5"
            :key="'log-' + row"
            class="logs-row d-flex"
          >
            <v-skeleton-loader
              v-for="col in 4"
              :key="'log-' + row + '-' + col"
              class="logs-cell"
              type="text"
            />
          </div>
        </v-card-text>
      </v-card>
    </template>
  </div>
</template>

<script lang="ts" setup>
  // The placeholder of the git page while its status loads. `connected` picks
  // the variant: one card for an unconnected instance, the full set of cards for a connected one.
  withDefaults(defineProps<{
    connected?: boolean
  }>(), {
    connected: false,
  })
</script>

<style lang="scss" scoped>
.v-card--mobile {
  @media (max-width: 767px) {
    flex-direction: column;
    align-items: flex-start;

    > :last-child {
      margin-top: 12px;
      width: 100%;
      justify-content: flex-start;
    }

    .v-btn,
    .button {
      width: 100%;
    }
  }
}

.v-skeleton-loader.title-skeleton :deep(.v-skeleton-loader__heading) {
  height: 16px;
  max-width: 140px;
  width: 100%;
  margin: 0;
}

.v-skeleton-loader.subtitle-skeleton :deep(.v-skeleton-loader__text) {
  height: 10px;
  max-width: 70%;
  width: 100%;
  margin: 0;
}

.v-skeleton-loader.kv-label :deep(.v-skeleton-loader__text) {
  height: 10px;
  max-width: 60px;
  width: 100%;
  margin: 0;
}

.v-skeleton-loader.kv-value :deep(.v-skeleton-loader__text) {
  height: 10px;
  max-width: 55%;
  width: 100%;
  margin: 0;
}

.v-skeleton-loader.kv-value-inline :deep(.v-skeleton-loader__text) {
  height: 10px;
  max-width: 200px;
  width: 100%;
  margin: 0;
}

.v-skeleton-loader.status-text :deep(.v-skeleton-loader__text) {
  height: 10px;
  max-width: 80px;
  width: 100%;
  margin: 0;
}

.v-skeleton-loader.button :deep(.v-skeleton-loader__heading) {
  height: 32px;
  width: 120px;
  border-radius: 6px;
  margin: 0;
}

.v-skeleton-loader.button.button--text :deep(.v-skeleton-loader__heading) {
  width: 100px;
}

.v-skeleton-loader.button.button--primary :deep(.v-skeleton-loader__heading) {
  width: 90px;
}

.v-skeleton-loader.switch :deep(.v-skeleton-loader__heading) {
  height: 28px;
  width: 45px;
  border-radius: 100px;
  margin: 0;
}

.v-skeleton-loader.toggle-btn :deep(.v-skeleton-loader__heading) {
  height: 32px;
  width: 120px;
  border-radius: 4px;
  margin: 0;
}

.v-skeleton-loader.field :deep(.v-skeleton-loader__heading) {
  height: 40px;
  width: 100%;
  border-radius: 4px;
  margin: 0;
}

// Same numbers as the real rows in `GitView.vue` (the legacy `.git-kv-row > .col` rule does not apply on the deployed page): row margin
// `0 -16px -16px`, column padding 16px.
.git-commit-details .git-kv-row {
  margin: 0 -16px -16px;
  --v-col-gap-x: 0px;
  --v-col-gap-y: 0px;

  > .v-col {
    padding: 16px;
  }
}

// `_card.scss` `:last-child` bottom padding never matches a V4 card (see `GitView.vue`).
.git-skeleton .v-card > .v-card-text:last-of-type {
  padding-bottom: 24px;
}

.logs-row {
  padding: 12px 0;
  border-bottom: 1px solid var(--v-gray-lighten2);

  &:last-child {
    border-bottom: none;
  }
}

.logs-cell {
  flex: 1;
  padding: 0 8px;

  &:first-child {
    flex: 0 0 175px;
    max-width: 175px;
  }

  &:nth-child(2) {
    flex: 0 0 280px;
    max-width: 280px;
  }

  &:nth-child(3) {
    flex: 1;
    max-width: 280px;
  }

  &:nth-child(4) {
    flex: 0 0 120px;
    max-width: 120px;
  }

  :deep(.v-skeleton-loader__text) {
    height: 8px;
    width: 100%;
    margin: 0;
  }
}
</style>
