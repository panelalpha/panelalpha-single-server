<template>
  <div class="no-results-container">
    <div
      v-if="searchTerm || filterLabels.length > 0"
      class="text-center"
    >
      <div
        class="d-flex flex-column align-center justify-center mx-auto pa-6 no-results-container__content"
      >
        <data-iterator-no-result-illustration />

        <span class="text--gray-darken1 mb-6 mt-7">
          {{ t('message.emptyTable.instances.filter.title') }}
        </span>

        <AppButton
          class="px-3"
          kind="link"
          @click="emit('clear-all-filters')"
        >
          <v-icon
            class="mr-2"
            color="primary"
            icon="$xcircle"
            size="16"
          />

          <span class="p-2 font-weight-normal">{{ t('button.clearFilter') }}</span>
        </AppButton>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataIteratorNoResultIllustration from '@/shared/ui/illustrations/DataIteratorNoResultIllustration.vue'

  withDefaults(defineProps<{
    searchTerm?: string
    filterLabels?: unknown[]
  }>(), {
    searchTerm: '',
    filterLabels: () => [],
  })

  const emit = defineEmits<{
    'clear-all-filters': []
  }>()

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.no-results-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-content: center;
  padding: 40px;
  border: 1px dashed map.get(v.$gray, lighten2);
  border-radius: 8px;
  margin: 16px 0 32px 0;

  &__content {
    max-width: 510px;
  }

  > div {
    + div {
      margin-top: 4px;
    }
  }
}
</style>
