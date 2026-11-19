<template>
  <v-autocomplete
    v-model="time"
    hide-details="auto"
    :items="options"
    variant="outlined"
  >
    <template #item="{ props: itemProps }">
      <v-list-item v-bind="itemProps">
        <div class="input-dropdown-item">
          <span>{{ itemProps.title }}</span>

          <v-icon
            class="ml-2 input-dropdown-item__icon"
            icon="$check"
          />
        </div>
      </v-list-item>
    </template>

    <template #prepend-inner>
      <v-icon
        icon="$clock"
        size="24"
      />
    </template>
  </v-autocomplete>
</template>

<script lang="ts" setup>
  // The time picker of the automatic backups modal (the same autocomplete in the daily, weekly and monthly branches).
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { hourOptions, parseTimeLabel } from './automatic-backup'

  const props = defineProps<{
    // The label of the project's stored time: kept in the list when its minute is not a quarter-hour.
    keep?: string
  }>()

  const time = defineModel<string>({ default: '' })

  const { t } = useTranslation()
  const options = computed(() => {
    const kept = props.keep ? parseTimeLabel(props.keep, t('general.pm')) : null
    return hourOptions(t('general.am'), t('general.pm'), kept ? [kept.minute] : [])
  })
</script>

<style lang="scss" scoped>
.input-dropdown-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;

  .v-icon {
    opacity: 0;
    transition: opacity 0.24s ease;
  }
}

:deep(.v-list-item[aria-selected='true']) .input-dropdown-item {
  font-weight: 600;
  color: rgb(var(--v-theme-primary));

  .v-icon {
    opacity: 1;
  }
}
</style>
