<template>
  <div
    v-if="project"
    class="tasks-project"
    :class="{ 'tasks-project--inline': inline }"
    data-testid="tasks-project"
  >
    <router-link
      class="tasks-project__link font-weight-600 text-truncate"
      :to="spaPath(`${project.id}/general`)"
    >
      {{ project.name }}
    </router-link>

    <span
      v-if="project.domain"
      class="tasks-project__domain text-truncate"
    >
      {{ project.domain }}
    </span>
  </div>

  <v-tooltip
    v-else
    location="bottom"
    :offset="4"
    open-delay="150"
    transition="custom-tooltip"
    :z-index="99"
  >
    <template #activator="{ props: activatorProps }">
      <span
        v-bind="activatorProps"
        class="tasks-project__none text-gray"
        data-testid="tasks-no-project"
      >
        —
      </span>
    </template>

    <span>{{ t('tasks.project.notLinked') }}</span>
  </v-tooltip>
</template>

<script lang="ts" setup>
  // The project column. A linked project is a link with its domain under it (the hover card of legacy is gone), an unlinked task shows a
  // dash with a "not linked" tooltip (legacy showed the italic username, e.g. "panel", which read as a project name).
  import type { FreeTaskProject } from './tasks.api'
  import { useTranslation } from 'i18next-vue'
  import { useSpaResourcePath } from '@/shared/session/use-spa-resource-path'

  defineProps<{
    project: FreeTaskProject | null
    /** The compact mobile card: the link and the domain in one line, 6 px apart. */
    inline?: boolean
  }>()

  const { t } = useTranslation()
  const { spaPath } = useSpaResourcePath()
</script>

<style lang="scss" scoped>
// Legacy `.v-application a { color: primary }` (V4 keeps the UA blue).
.tasks-project__link {
  color: rgb(var(--v-theme-primary));
}

// A column of the link and the domain.
.tasks-project {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 260px;
}

// The compact mobile card: one line, the domain after the link.
.tasks-project--inline {
  flex-direction: row;
  align-items: baseline;
  gap: 6px;
  max-width: none;
}

// The domain is 13 / 18 under the link.
.tasks-project__domain {
  font-size: 13px;
  line-height: 18px;
  color: var(--v-gray-darken1);
}
</style>
