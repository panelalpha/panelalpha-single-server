<template>
  <SourceInfoCardShell :actions="action !== null">
    <template #label-start>
      {{ t('heading.instance.siteDetails.source.repository') }}
    </template>

    <template #label-end>
      {{ t('heading.instance.siteDetails.source.database') }}
    </template>

    <template #value-start>
      <span
        v-if="repo"
        :title="repo"
      >{{ repo }}</span>
    </template>

    <template #value-end>
      <div
        v-if="sourceLoading"
        class="status-skeleton"
      >
        <v-skeleton-loader type="text" />
      </div>

      <span
        v-else-if="view.database.present"
        :title="view.database.label"
      >{{ view.database.label }}</span>

      <span
        v-else
        class="not-created"
      >
        <v-icon
          color="gray"
          icon="$alerterror"
          size="16"
        />
        {{ t('heading.instance.siteDetails.source.database.notCreated') }}
      </span>
    </template>

    <template #meta-start>
      <span
        v-if="branchLine"
        class="git-ref"
      >{{ branchLine }}</span>
    </template>

    <template #status-start>
      <div
        v-if="status.loading"
        class="status-skeleton"
      >
        <v-skeleton-loader type="text" />
      </div>

      <span
        v-else-if="upToDate"
        class="text-success status-line"
      >
        <v-icon
          color="success"
          icon="$check"
          size="16"
        />

        <span>{{ t('heading.instance.siteDetails.source.upToDate') }}</span>
      </span>

      <span
        v-else-if="behind"
        class="text-error status-line"
      >
        <v-icon
          color="error"
          icon="$arrowdown"
          size="16"
        />

        <span>{{ t('heading.instance.siteDetails.source.commitsBehind', { count: status.commitsBehind }) }}</span>
      </span>
    </template>

    <template #status-end>
      <router-link
        v-if="!sourceLoading && view.database.present && instance.hasManageContainersPrivilege()"
        class="p-3 font-weight-bold d-flex align-center text-primary"
        :to="containersPath(route.path, String(route.params.id))"
      >
        <v-icon
          class="mr-2"
          color="primary"
          icon="$slidersHorizontal"
          size="16"
        />

        <span>{{ t('button.manage') }}</span>
      </router-link>
    </template>

    <template #actions>
      <AppButton
        v-if="action === 'manage'"
        block
        class="font-weight-bold text-white"
        kind="primary"
        @click="goToGitPage"
      >
        <span>{{ t('button.manageGit') }}</span>
      </AppButton>

      <AppButton
        v-else
        block
        class="font-weight-bold text-white"
        :disabled="openingRedeploy"
        kind="primary"
        :loading="openingRedeploy"
        @click="openRedeploy"
      >
        <v-icon
          icon="$update"
          size="16"
        />

        <span>{{ t('button.redeploy') }}</span>
      </AppButton>
    </template>
  </SourceInfoCardShell>
</template>

<script lang="ts" setup>
  // app-lite only (no app counterpart). Logic in `../source-info.ts`. The redeploy modal is owned by the
  // General page: the card emits `action-redeploy` and the owner calls `finishRedeploy()` when the modal closes (legacy
  // `await $refs.redeployModal.open()` toggles `openingRedeploy`); `reloadStatus()` reads the status and the source again, without the emit.
  // The source (`GET /instances/{id}/source`, memo 30 s in `project-source.api.ts`) feeds the commit, the database and the base values;
  // until the first answer the database column shows a skeleton, a refresh keeps the shown values.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import type { ProjectSource } from '@/entities/project/project-source.api'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import SourceInfoCardShell from '@/views/projects/project/general/cards/SourceInfoCardShell.vue'
  import {
    containersPath,
    gitCardAction,
    gitPageRouteName,
    initialGitLiveStatus,
    isGitConnected,
    parseCommitsBehind,
    repoName,
    showBehind,
    showUpToDate,
    sourceBranch,
    sourceCardView,
  } from '@/views/projects/project/general/source-info'
  import { getGitSourceStatus } from '@/views/projects/project/instance.api'
  import { forgetProjectSource, getProjectSource } from '@/entities/project/project-source.api'
  import { useAppEvent } from '@/shared/events/app-events'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const emit = defineEmits<{
    'action-redeploy': [instance: InstanceResource]
  }>()

  const { t } = useTranslation()
  const route = useRoute()
  const router = useRouter()

  const connected = computed(() => isGitConnected(props.instance.git_repository))
  const repo = computed(() => repoName(props.instance.source))
  const branch = computed(() => sourceBranch(props.instance.source, props.instance.git_repository))
  const source = ref<ProjectSource | null>(null)
  const sourceLoading = ref(false)
  let sourceRequest = 0
  const view = computed(() => sourceCardView(source.value, props.instance))
  // The branch line, "main · a3f9c21": the branch and the commit of the last deploy.
  const branchLine = computed(() => [branch.value, view.value.deploy.commit].filter(Boolean).join(' · '))
  const action = computed(() => gitCardAction(connected.value, {
    manageGit: props.instance.hasManageGitPrivilege(),
    redeploy: props.instance.hasRedeployPrivilege(),
  }))

  const status = ref(initialGitLiveStatus(connected.value))
  const upToDate = computed(() => showUpToDate(status.value))
  const behind = computed(() => showBehind(status.value))
  const openingRedeploy = ref(false)

  // A request error leaves `commits_behind` unknown (no line), the status is "loaded" either way.
  async function loadGitStatus (): Promise<void> {
    if (!connected.value) {
      return
    }
    status.value = { loading: true, loaded: false, commitsBehind: null }
    let commitsBehind: number | null = null
    try {
      commitsBehind = parseCommitsBehind(await getGitSourceStatus(props.instance.id))
    } catch {
      commitsBehind = null
    }
    status.value = { loading: false, loaded: true, commitsBehind }
  }

  // Only the first load shows the skeleton; a refresh keeps the shown values and drops out of date answers.
  // A failed request falls back to the project payload (`sourceCardView`).
  async function loadSource ({ fresh = false }: { fresh?: boolean } = {}): Promise<void> {
    const request = ++sourceRequest
    sourceLoading.value = source.value === null
    try {
      const data = await getProjectSource(props.instance.id, { fresh })
      if (request === sourceRequest) {
        source.value = data || null
      }
    } catch {
      if (request === sourceRequest) {
        source.value = null
      }
    } finally {
      if (request === sourceRequest) {
        sourceLoading.value = false
      }
    }
  }

  // The live status and the source are read again.
  async function reloadStatus (): Promise<void> {
    await Promise.all([loadGitStatus(), loadSource({ fresh: true })])
  }

  useAppEvent('instance-item-changed', item => {
    if (item?.id === props.instance.id) {
      void loadSource({ fresh: true })
    }
  })

  // The lite route names `ProjectGit` / `Git` are `project-git` / `instance-git` here.
  function goToGitPage (): void {
    const name = gitPageRouteName(route.path) === 'ProjectGit' ? 'project-git' : 'instance-git'
    void router.push({ name, params: { id: props.instance.id } })
  }

  function openRedeploy (): void {
    if (openingRedeploy.value) {
      return
    }
    openingRedeploy.value = true
    emit('action-redeploy', props.instance)
  }

  // Legacy: the modal closed (deployed or not), the next read of `/source` must be a fresh one.
  function finishRedeploy (): void {
    forgetProjectSource(props.instance.id)
    openingRedeploy.value = false
  }

  onMounted(() => {
    void loadGitStatus()
    void loadSource()
  })

  defineExpose({ reloadStatus, finishRedeploy })
</script>

<style lang="scss" scoped>
.git-ref {
  font-family: monospace;
}

.not-created {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 400;
}

.status-line {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  white-space: nowrap;
  gap: 4px;

  .v-icon {
    flex-shrink: 0;
  }
}
</style>
