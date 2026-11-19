<template>
  <v-tabs v-model="tab">
    <v-tab
      v-if="canManageMysql"
      data-testid="databases-tab-databases"
      :ripple="false"
      :value="DATABASES"
    >
      {{ t('heading.hosting.databases.databases.title') }}
    </v-tab>

    <v-tab
      v-if="canManageMysql"
      data-testid="databases-tab-users"
      :ripple="false"
      :value="USERS"
    >
      {{ t('heading.hosting.databases.users.title') }}
    </v-tab>

    <v-tab
      v-if="canPhpmyadminSso"
      data-testid="databases-tab-phpmyadmin"
      :ripple="false"
      :value="PHPMYADMIN"
    >
      {{ t('heading.hosting.databases.phpmyadmin.title') }}
    </v-tab>
  </v-tabs>
</template>

<script lang="ts" setup>
  // The tab strip: the same tabs in both frames
  // (the hosting header puts them beside the filters, the project header in a second row), so the screen mounts this one fragment.
  import { useTranslation } from 'i18next-vue'
  import { DATABASES, PHPMYADMIN, USERS } from './databases-tabs'

  defineProps<{
    canManageMysql: boolean
    canPhpmyadminSso: boolean
  }>()

  const tab = defineModel<number>({ required: true })

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
// V4 tabs are buttons: the legacy 46px cap and the 18px tab font come from `_tabs.scss` (global).
.v-tab {
  min-width: unset;
  max-height: 46px;
}

// `_buttons.scss` paints the V4 text-variant border black; the V2 tab border was the text colour (`currentColor`). Scoped to this
// screen: a global rule regressed the hosting usage tabs (`graphs-tab`), whose border already matched legacy.
.page-title__tabs .v-tab.v-btn--variant-text {
  border-color: currentColor;
}

.v-tabs {
  max-height: 46px;
}
</style>
