<template>
  <div
    class="task-details"
    data-testid="tasks-details"
  >
    <dl class="task-details__grid">
      <div
        v-for="field in fields"
        :key="field.key"
        class="task-details__field"
        :data-testid="`tasks-details-${field.key}`"
      >
        <dt class="task-details__label">
          {{ t(field.labelKey, { defaultValue: field.defaultLabel }) }}
        </dt>

        <dd class="task-details__value">
          {{ fieldValue(field) }}
        </dd>
      </div>
    </dl>

    <div
      v-if="task.error"
      class="task-details__error"
      data-testid="tasks-details-error"
    >
      <div class="task-details__label">
        {{ t('tasks.details.error', { defaultValue: 'Error' }) }}
      </div>

      <div class="task-details__error-row">
        <pre class="task-details__error-text">{{ task.error }}</pre>

        <CopyTextButton
          :aria-label="t('tooltip.copy')"
          data-testid="tasks-details-copy"
          :text="task.error"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import type { TaskDetailField } from './tasks-table'
  // The details row of an open task: the three dates and the id in a grid, the whole error with a copy button.
  import type { FreeTask } from './tasks.api'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useDateFormat } from '@/shared/time/use-date-format'
  import CopyTextButton from '@/shared/ui/buttons/CopyTextButton.vue'
  import { taskDetails } from './tasks-table'

  const props = defineProps<{
    task: FreeTask
    now: number
  }>()

  const { t } = useTranslation()
  const formatDate = useDateFormat()

  const fields = computed(() => taskDetails(props.task, props.now))

  function fieldValue (field: TaskDetailField): string {
    if (field.date) {
      return formatDate(field.date, { time: true })
    }
    if (field.textKey) {
      return t(field.textKey, { defaultValue: field.defaultText })
    }
    return field.text ?? '—'
  }
</script>

<style lang="scss" scoped>
// Four columns (two below 976 px), 16 / 24 px apart; label 13 / 18 gray, value 14 / 20.
.task-details__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px 24px;
  margin: 0;
}

.task-details__label {
  font-size: 13px;
  line-height: 18px;
  font-weight: 400;
  color: var(--v-gray-darken1);
}

.task-details__value {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  color: var(--v-text-darken1);
}

.task-details__error {
  margin-top: 16px;
}

.task-details__error-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.task-details__error-text {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  font-family: inherit;
  font-size: 14px;
  line-height: 20px;
  color: var(--v-status-error-text);
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 975.98px) {
  .task-details__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
