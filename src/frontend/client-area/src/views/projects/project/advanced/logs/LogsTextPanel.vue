<template>
  <div
    class="logs-info-row pl-6 pr-6 pt-3 pb-3 d-flex justify-space-between border-bottom-gray"
    :class="{ 'align-center': alignCenter }"
  >
    <p class="d-flex align-center text-info p-xxs logs-info-row__text mb-0">
      <v-icon
        class="mr-2 text-info"
        icon="$infoCircle"
        size="16"
      />
      {{ t('notification.instance.advanced.logs.maxEntries') }}
    </p>
  </div>

  <div v-if="wrapped">
    <pre class="logs-pre pl-6 pr-6 pt-3 pb-3 overflow-x-auto overflow-y-auto text--gray-darken1 p-sm logs-lh always-ltr">{{ text }}</pre>
  </div>

  <pre
    v-else
    class="logs-pre pl-6 pr-6 pt-3 pb-3 overflow-x-auto overflow-y-auto text--gray-darken1 p-sm logs-lh always-ltr"
  >{{ text }}</pre>
</template>

<script lang="ts" setup>
  // The "max entries" row with Download and
  // the log text, three times (WordPress, PHP, webserver). The WordPress row is `align-center`, the PHP and webserver rows are not.
  import { useTranslation } from 'i18next-vue'

  // `wrapped`: the webserver tab keeps the `<pre>` in its own `div`, so the text is not the last child of the card
  // and takes no card radius; WordPress and PHP put it straight in the card.
  // Download is in the page title (`LogsView`), beside the controls of the tab.
  defineProps<{
    text: string
    alignCenter?: boolean
    wrapped?: boolean
  }>()

  const { t } = useTranslation()
</script>
