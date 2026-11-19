<template>
  <v-tooltip
    v-if="lines.length > 0"
    location="bottom"
    open-delay="150"
    transition="custom-tooltip"
  >
    <template #activator="{ props: activatorProps }">
      <v-icon
        v-bind="activatorProps"
        aria-hidden="false"
        :aria-label="lines.join(' ')"
        class="ms-4"
        color="primary"
        data-testid="backup-data-check"
        icon="$checkcircle"
        role="img"
        size="20"
        tabindex="0"
      />
    </template>

    <div>
      <p
        v-for="line in lines"
        :key="line"
        class="p-3 mb-0"
      >
        {{ line }}
      </p>
    </div>
  </v-tooltip>

  <v-icon
    v-else
    class="ms-4"
    color="primary"
    data-testid="backup-data-check"
    icon="$checkcircle"
    size="20"
  />
</template>

<script lang="ts" setup>
  import type { BackupItem } from './backups-list'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { dataNames } from './backup-parts'
  // The Data check of a custom project: the check mark, and when the backup lists its volumes or databases a tooltip with the names
  // (`role="img"` and `aria-label` so a screen reader and the keyboard get the same text).

  const props = defineProps<{
    item: BackupItem
  }>()

  const { t } = useTranslation()

  const lines = computed(() => {
    const names = dataNames(props.item)
    if (!names) {
      return []
    }
    const result: string[] = []
    if (names.volumes.length > 0) {
      result.push(t('tooltip.backup.volumes', { defaultValue: 'Volumes: {{names}}', names: names.volumes.join(', ') }))
    }
    if (names.databases.length > 0) {
      result.push(t('tooltip.backup.databases', { defaultValue: 'Databases: {{names}}', names: names.databases.join(', ') }))
    }
    return result
  })
</script>
