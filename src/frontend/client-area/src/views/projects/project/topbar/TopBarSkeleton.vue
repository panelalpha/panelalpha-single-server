<template>
  <div class="px-6">
    <v-container class="mt-10 top-bar__container px-0">
      <v-row class="flex-row justify-space-between flex-nowrap mx-0 pb-12">
        <div class="d-flex align-center top-bar-title">
          <router-link
            v-if="!mobile"
            :aria-label="t(labels.back)"
            class="mr-6 back-button"
            to="/"
          >
            <v-icon
              class="heading--text"
              icon="$arrowleft"
              size="24"
            />
          </router-link>

          <div class="top-bar-title__container ml-0">
            <div class="d-flex skeleton-loader title flex-column">
              <v-skeleton-loader
                class="header"
                type="header"
              />

              <v-skeleton-loader
                class="subheader"
                type="text, chip@2"
              />
            </div>
          </div>
        </div>

        <div class="d-flex justify-start justify-lg-end align-center">
          <BaseIconButtonSkeleton
            v-for="index in mobile ? 2 : 5"
            :key="index"
          />
        </div>
      </v-row>

      <InstanceTopBarTabsSkeleton />
    </v-container>
  </div>
</template>

<script lang="ts" setup>
  // The avatar is left out (it is commented out in legacy).
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import { preferredSpaBaseLabels } from '@/shared/session/preferred-spa-base'
  import { useSessionStore } from '@/shared/session/session.store'
  import BaseIconButtonSkeleton from '@/shared/ui/buttons/BaseIconButtonSkeleton.vue'
  import InstanceTopBarTabsSkeleton from './InstanceTopBarTabsSkeleton.vue'

  const { t } = useTranslation()
  const { mobile } = useDisplay()
  const session = useSessionStore()
  const labels = computed(() => preferredSpaBaseLabels(session.home))
</script>

<style lang="scss" scoped>
// Legacy V2 `.container` has 12px vertical padding and `.row` a -16px vertical margin; V4 has 16px and none.
.top-bar__container {
  padding-top: 12px;
  padding-bottom: 12px;

  > .v-row {
    margin-top: -16px;
    margin-bottom: -16px;
  }
}

.skeleton-loader.title {
  // V4 roots paint the surface colour (V2 transparent).
  :deep(.v-skeleton-loader) {
    background: transparent;
  }

  :deep(.v-skeleton-loader.subheader) {
    display: flex;
    // V4 skeletons wrap their children; V2 kept the text and chips on one line.
    flex-wrap: nowrap;
    align-items: center;
    max-width: 100%;
    width: 300px;
  }

  :deep(.v-skeleton-loader.subheader .v-skeleton-loader__text) {
    margin-top: 5px;
    margin-bottom: 5px;
    margin-left: 0;
    border-radius: 3px;
    width: 182px;
    height: 10px;
    margin-right: 16px;
  }

  // V4 bones take a full row each (`flex: 1 1 100%`), so the text and chips would stack; V2 kept them on one line.
  :deep(.v-skeleton-loader.subheader .v-skeleton-loader__bone) {
    flex: 0 0 auto;
    flex-wrap: nowrap;
    align-items: center;
  }

  :deep(.v-skeleton-loader.subheader .v-skeleton-loader__chip) {
    // V4 chips carry `margin: 16px` and `height: 32px`; V2 chips had neither.
    margin: 0;
    min-width: 0;
    flex-shrink: 1;
    border-radius: 16px;
    height: 20px;
    width: 68px;
  }

  :deep(.v-skeleton-loader.subheader .v-skeleton-loader__chip + .v-skeleton-loader__chip) {
    margin-left: 8px;
  }

  :deep(.v-skeleton-loader.header .v-skeleton-loader__header) {
    margin-top: 4px;
    margin-bottom: 4px;
    border-radius: 3px;
    width: 150px;
    height: 32px;
  }
}
</style>
