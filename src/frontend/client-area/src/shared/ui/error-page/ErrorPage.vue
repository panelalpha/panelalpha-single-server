<template>
  <div>
    <v-container class="mt-13">
      <v-row align="stretch">
        <v-col
          class="d-flex flex-column"
          cols="12"
        >
          <h1>{{ t('heading.errorPage.title') }}</h1>
          <span>{{ t('heading.errorPage.subtitle') }}</span>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
// V2 `.container` padding is 12px (V4: 16px). The `h1` zero margin comes from the reset layer (`reset.scss`), not from this screen.
.v-container {
  padding: 12px;
}

// Legacy `.row:not(.row--small, .no-gutters)` is `margin: -16px` with `.col-12` padding 16px (`_general.scss`): the text
// stays in place, but on a narrow screen the row sticks out 4px past the container and the page scrolls sideways.
// V4 spaces columns with `gap`, so the global rule is omitted; this screen needs the legacy numbers to match.
.v-row {
  margin: -16px;
}

.v-col {
  padding: 16px;
}
</style>
