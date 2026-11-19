<template>
  <!-- The empty Containers table, as the other hosting tables (Cron, Databases, FTP): illustration, title and description. Containers come from
       the deploy of the project, so there is no Add button. -->
  <EmptyState
    data-testid="containers-empty"
    :desc="t('message.emptyTable.containers.description', { defaultValue: 'No containers available. They will appear here once a project is deployed.' })"
    :title="t('message.emptyTable.containers.title', { defaultValue: 'No Containers Found' })"
  >
    <template #image>
      <ContainersEmptyIllustration />
    </template>
  </EmptyState>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import ContainersEmptyIllustration from './ContainersEmptyIllustration.vue'

  const { t } = useTranslation()
</script>
