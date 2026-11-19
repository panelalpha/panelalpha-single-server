<template>
  <StatusLabel
    class="task-status-label"
    :class="`task-status-label--${style.modifier}`"
    data-testid="tasks-status"
    :icon="style.icon ?? undefined"
    :status="TASK_MODIFIER_STATUS[style.modifier]"
    :value="text"
  />
</template>

<script lang="ts" setup>
  // The status chip of a task on the kit `StatusLabel`. The error no longer sits in a tooltip of the chip: it is in the details row of
  // the table. `task-status-label--<modifier>` stays as a hook (tests).
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
  import { isKnownTaskStatus, TASK_MODIFIER_STATUS, taskStatusStyle } from './tasks-table'

  const props = defineProps<{
    status: string
  }>()

  const { t } = useTranslation()

  const style = computed(() => taskStatusStyle(props.status))
  const text = computed(() => isKnownTaskStatus(props.status) ? t(`tasks.status.${props.status}`) : String(props.status || '—'))
</script>
