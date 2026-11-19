<template>
  <div
    v-if="header.value === 'task'"
    class="tasks-cell-task"
    data-testid="tasks-cell-task"
  >
    <div class="tasks-cell-task__name font-weight-bold text-truncate">
      {{ taskLabel }}
    </div>

    <div
      v-if="errorLine && !expanded"
      class="tasks-cell-task__error"
      data-testid="tasks-error-line"
    >
      <v-icon
        aria-hidden="true"
        icon="$alertcircle"
        size="14"
      />

      <span class="text-truncate">{{ errorLine }}</span>
    </div>
  </div>

  <div
    v-else-if="header.value === 'project'"
    data-testid="tasks-cell-project"
  >
    <TaskProjectCell :project="item.project" />
  </div>

  <TaskProjectCell
    v-else-if="header.value === 'mobile-project'"
    inline
    :project="item.project"
  />

  <div
    v-else-if="header.value === 'mobile-meta'"
    data-testid="tasks-cell-meta"
  >
    {{ mobileMeta }}
  </div>

  <div
    v-else-if="header.value === 'started'"
    class="tasks-cell-stack"
    data-testid="tasks-cell-started"
  >
    <template v-if="item.status === 'queued'">
      <div>{{ t('tasks.waiting') }}</div>

      <div class="tasks-cell-stack__sub">
        {{ addedAgo }}
      </div>
    </template>

    <template v-else>
      <div>{{ startedAt ? formatTime(startedAt) : '—' }}</div>

      <div class="tasks-cell-stack__sub">
        {{ startedFromNow }}
      </div>
    </template>
  </div>

  <div
    v-else-if="header.value === 'duration'"
    data-testid="tasks-cell-duration"
  >
    {{ item.status === 'queued' ? '—' : duration }}
  </div>

  <div
    v-else-if="header.value === 'status'"
    class="d-flex actions-row"
    :class="{ 'justify-end': header.align === 'end' && !mobile }"
    data-testid="tasks-cell-status"
  >
    <TaskStatusLabel :status="item.status" />
  </div>

  <div
    v-else-if="header.value === 'open'"
    class="tasks-cell-open"
  >
    <v-icon
      aria-hidden="true"
      class="tasks-cell-open__icon"
      :class="{ 'tasks-cell-open__icon--open': expanded }"
      icon="$chevronright"
      size="16"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { TaskTableColumn } from './tasks-table'
  // One cell of the Free tasks table, picked by the column: two-line cells (name and error line, start and "ago") and the chevron column.
  import type { FreeTask } from './tasks.api'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import { formatTime } from '@/shared/time/date-format'
  import { fromNow } from '@/shared/time/from-now'
  import TaskProjectCell from './TaskProjectCell.vue'
  import { taskDuration, taskErrorLine, taskLabelKey, taskStartedAt } from './tasks-table'
  import TaskStatusLabel from './TaskStatusLabel.vue'

  const props = defineProps<{
    item: FreeTask
    header: { value: TaskTableColumn['value'] | 'mobile-project' | 'mobile-meta', align?: TaskTableColumn['align'] }
    now: number
    /** The row is the open one: its error line gives way to the details row. */
    expanded?: boolean
  }>()

  const { t } = useTranslation()
  const { mobile } = useDisplay()

  const taskLabel = computed(() => {
    const label = taskLabelKey(props.item)
    return 'key' in label ? t(label.key) : label.text
  })

  const errorLine = computed(() => taskErrorLine(props.item))

  const startedAt = computed(() => taskStartedAt(props.item))

  const startedFromNow = computed(() => (startedAt.value ? fromNow(startedAt.value, new Date(props.now)) : '—'))

  // `fromNow` already ends with "ago"; the key is "added {{value}}".
  const addedAgo = computed(() => t('tasks.addedAgo', {
    value: props.item.queued_at ? fromNow(props.item.queued_at, new Date(props.now)) : '—',
    defaultValue: 'added {{value}}',
  }))

  // The compact mobile card: "HH:mm · 5 minutes ago", a queued task "Waiting · added 5 minutes ago".
  const mobileMeta = computed(() => props.item.status === 'queued'
    ? `${t('tasks.waiting')} · ${addedAgo.value}`
    : `${startedAt.value ? formatTime(startedAt.value) : '—'} · ${startedFromNow.value}`)

  const duration = computed(() => taskDuration(props.item, props.now))
</script>

<style lang="scss" scoped>
// Legacy has an inline `max-width: 300px` on the task label.
.tasks-cell-task {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 300px;
}

// The first line of the error under the name, 13 / 18 with a small icon, in the error text colour.
.tasks-cell-task__error {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: 13px;
  line-height: 18px;
  color: var(--v-status-error-text);
}

.tasks-cell-stack__sub {
  font-size: 13px;
  line-height: 18px;
  color: var(--v-gray-darken1);
}

.tasks-cell-open {
  display: flex;
  justify-content: flex-end;
  color: var(--v-gray-darken1);
}

.tasks-cell-open__icon {
  transition: transform 0.15s ease;
}

// An open row turns the chevron a quarter turn.
.tasks-cell-open__icon--open {
  transform: rotate(90deg);
}

[dir='rtl'] .tasks-cell-open__icon {
  transform: scaleX(-1);
}

[dir='rtl'] .tasks-cell-open__icon--open {
  transform: scaleX(-1) rotate(90deg);
}
</style>
