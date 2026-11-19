<template>
  <page-frame
    class="free-tasks"
    :tab="statusTab"
    :tabs="statusTabs"
    :tabs-label="t('tasks.filters.status')"
    testid-prefix="tasks"
    :title="t('tasks.title')"
    @update:tab="changeTab"
  >
    <template #filters>
      <div class="tasks-filters">
        <v-select
          v-model="projectModel"
          class="tasks-filter"
          data-testid="project-filter"
          density="compact"
          hide-details
          item-title="title"
          :items="projectItems"
          :label="t('tasks.filters.project', { defaultValue: 'Project' })"
          variant="outlined"
          @update:model-value="changeFilter"
        />

        <v-select
          v-model="action"
          class="tasks-filter"
          data-testid="action-filter"
          density="compact"
          hide-details
          item-title="title"
          :items="actionItems"
          :label="t('tasks.filters.action')"
          variant="outlined"
          @update:model-value="changeFilter"
        />
      </div>
    </template>

    <v-container class="px-0 py-3">
      <v-row>
        <v-col cols="12">
          <!-- Server paging: the table keeps no page of its own (`table-paging-events` off) and the footer clicks reach the
               view, which refetches. The header is the pattern's row without sort (`sortable: false`), the status column to the right.
               Mock A (task-ui): rows of 64 px grouped by day, a red bar on a failed task, a row opens its details in place. -->
          <data-table
            v-model:expanded-key="expandedKey"
            :default-items-per-page="TASKS_PER_PAGE"
            expandable
            footer-testid="tasks-footer"
            footer-when-empty
            :group-label="taskGroupLabel"
            header-testid="tasks-header"
            :headers="taskTableHeaders"
            :item-slots="TASK_CELL_KEYS"
            item-value="id"
            :items="(tasks as unknown as Record<string, unknown>[])"
            :items-loading="initialLoading"
            :items-per-page="itemsPerPage"
            :items-total="total"
            :loading="loading"
            mobile-variant="compact"
            :number-of-pages="lastPage"
            :page="page"
            :per-page-label="t('table.footer.items')"
            :possible-items-per-page="TASKS_POSSIBLE_PER_PAGE"
            :row-attrs="tasksRowAttrs"
            :row-marker="taskRowMarker"
            row-size="lg"
            server
            skeleton-testid="tasks-skeleton"
            :table-paging-events="false"
            @update:items-per-page="changePerPage"
            @update:page="changePage"
          >
            <template #no-data>
              <EmptyState
                data-testid="tasks-empty"
                :desc="t('tasks.empty.description')"
                :title="t('tasks.empty.title')"
              >
                <template #image>
                  <no-data-table-logs />
                </template>
              </EmptyState>
            </template>

            <template
              v-for="column in TASK_TABLE_COLUMNS"
              :key="column.value"
              #[`item.${column.value}`]="{ item }"
            >
              <tasks-table-cell
                :expanded="expandedKey === asTask(item).id"
                :header="column"
                :item="asTask(item)"
                :now="now"
              />
            </template>

            <template #expanded="{ item }">
              <task-details
                :now="now"
                :task="asTask(item)"
              />
            </template>

            <!-- The compact card: a grid without labels, filled slot by slot from the cells of the table. -->
            <template #mobile-title="{ item }">
              <tasks-table-cell
                :expanded="expandedKey === asTask(item).id"
                :header="{ value: 'task' }"
                :item="asTask(item)"
                :now="now"
              />
            </template>

            <template #mobile-status="{ item }">
              <tasks-table-cell
                :header="{ value: 'status' }"
                :item="asTask(item)"
                :now="now"
              />
            </template>

            <template #mobile-full="{ item }">
              <tasks-table-cell
                :header="{ value: 'mobile-project' }"
                :item="asTask(item)"
                :now="now"
              />
            </template>

            <template #mobile-meta="{ item }">
              <tasks-table-cell
                :header="{ value: 'mobile-meta' }"
                :item="asTask(item)"
                :now="now"
              />
            </template>

            <template #mobile-meta-end="{ item }">
              <tasks-table-cell
                :header="{ value: 'duration' }"
                :item="asTask(item)"
                :now="now"
              />
            </template>
          </data-table>
        </v-col>
      </v-row>
    </v-container>
  </page-frame>
</template>

<script lang="ts" setup>
  // The state, loading and polling live in `useFreeTasks`; a failed GET alerts and keeps the previous rows.
  import type { FreeTask } from './tasks.api'
  import type { DataTableRowMarker } from '@/shared/ui/data-table/data-table'
  import type { PageFrameTab } from '@/shared/ui/page-frame/page-frame'
  import i18next from 'i18next'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import NoDataTableLogs from '@/shared/ui/illustrations/NoDataTableLogs.vue'
  import PageFrame from '@/shared/ui/page-frame/PageFrame.vue'
  import TaskDetails from './TaskDetails.vue'
  import { TASK_TABLE_COLUMNS, taskActionFilterItems, taskDayLabel, TASKS_PER_PAGE, TASKS_POSSIBLE_PER_PAGE, taskStatusTabItems } from './tasks-table'
  import TasksTableCell from './TasksTableCell.vue'
  import { useFreeTasks } from './use-free-tasks'

  const { t } = useTranslation()
  const { tasks, total, lastPage, page, itemsPerPage, action, project, projectOptions, statusTab, expandedKey, loading, initialLoading, now, changePage, changePerPage, changeFilter } = useFreeTasks()

  const actionItems = computed(() => taskActionFilterItems(t))
  // The status tabs (All, Active, Failed, Completed, Cancelled); the tab value is the index into `TASK_STATUS_TABS`.
  const statusTabs = computed<PageFrameTab[]>(() => taskStatusTabItems(t).map((item, index) => ({ value: index, title: item.title })))
  // The project select: `''` is the "All" item (V4 shows no selection for `null`); the model maps it to `project: null`.
  const projectItems = computed(() => [
    { title: t('tasks.filters.all'), value: '' },
    ...projectOptions.value.map(option => ({ title: option.name, value: option.id })),
  ])
  const projectModel = computed<number | ''>({
    get: () => project.value ?? '',
    set: value => {
      project.value = value === '' ? null : Number(value)
    },
  })

  function changeTab (value: number): void {
    statusTab.value = value
    changeFilter()
  }

  // The header row of the pattern without sort: ready labels, the column widths, the status column to the right (V4 cell alignment,
  // `headerAlign` for the header); the chevron column has no title.
  const taskTableHeaders = computed(() => TASK_TABLE_COLUMNS.map(column => ({
    text: column.text ?? '',
    label: column.text ? t(column.text) : '',
    value: column.value,
    width: column.width,
    sortable: false,
    align: column.align as 'start' | 'center' | 'end' | undefined,
    headerAlign: column.align,
  })))
  const TASK_CELL_KEYS = TASK_TABLE_COLUMNS.map(column => column.value)

  // The group header of a day: "Today" / "Yesterday" or the date with the month in the app language, from the day the task was queued
  // (`now` moves on every fetch).
  function taskGroupLabel (item: Record<string, unknown>): string {
    const day = taskDayLabel(asTask(item), now.value, i18next.language)
    if ('label' in day) {
      return day.label
    }
    return day.kind === 'today' ? t('tasks.groups.today', { defaultValue: 'Today' }) : t('tasks.groups.yesterday', { defaultValue: 'Yesterday' })
  }

  // A failed task has the red bar of the row (the kit `rowMarker`).
  function taskRowMarker (item: Record<string, unknown>): DataTableRowMarker | undefined {
    return asTask(item).status === 'failed' ? 'red' : undefined
  }

  function tasksRowAttrs (): Record<string, string> {
    return { 'data-testid': 'tasks-row' }
  }

  // The V4 slot hands the row as a plain record; the items are `FreeTask`.
  function asTask (item: unknown): FreeTask {
    return item as FreeTask
  }
</script>

<style lang="scss" scoped>
// The Tasks page has no page padding of the shell; nothing visible sits outside the page box, so a wider child must not make the page
// scroll sideways.
.free-tasks {
  overflow-x: clip;
}

// The two filters beside the title: 220px wide, 12px apart (a wrapper and a class on the selects, not a rule on the frame's filter row).
.tasks-filters {
  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
  width: max-content;
}

.tasks-filter {
  flex: 0 0 220px;
  width: 220px;
  max-width: 220px;
}

// Below 976 px the frame stacks the title and the filters: the row spans the width and the selects share it, wrapping when narrow.
@media (max-width: 975.98px) {
  .tasks-filters {
    flex-wrap: wrap;
    width: 100%;
  }

  .tasks-filter {
    flex: 1 1 140px;
    width: auto;
    max-width: none;
  }
}
</style>
