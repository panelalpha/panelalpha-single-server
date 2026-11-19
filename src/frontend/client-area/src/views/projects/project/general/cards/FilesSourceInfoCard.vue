<template>
  <SourceInfoCardShell>
    <template #label-start>
      {{ t('heading.instance.siteDetails.source.files') }}
    </template>

    <template #label-end>
      {{ t('heading.instance.siteDetails.source.database') }}
    </template>

    <template #value-start>
      <div
        v-if="sourceLoading"
        class="status-skeleton"
      >
        <v-skeleton-loader type="text" />
      </div>

      <span
        v-else-if="view.stackLabel"
        :title="view.stackLabel"
      >{{ view.stackLabel }}</span>
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
      <span v-if="!sourceLoading && deployedAt">{{ deployedAt }}</span>

      <span v-else-if="!sourceLoading && view.deploy.waitingForFiles">
        {{ t('heading.instance.siteDetails.source.waitingForFilesHint') }}
      </span>
    </template>

    <template #status-start>
      <span
        v-if="!sourceLoading && view.deploy.state === 'failed'"
        class="text-error"
      >
        {{ t('heading.instance.siteDetails.source.deployFailed') }}
      </span>

      <span
        v-else-if="!sourceLoading && view.deploy.waitingForFiles"
        class="lighten-text"
      >
        {{ t('heading.instance.siteDetails.source.waitingForFiles') }}
      </span>

      <span
        v-else-if="!sourceLoading && view.deploy.state === 'running'"
        class="lighten-text"
      >
        {{ t('heading.instance.siteDetails.source.deploying') }}
      </span>

      <span
        v-else-if="!sourceLoading && deployed"
        class="text-success status-line"
      >
        <v-icon
          color="success"
          icon="$check"
          size="16"
        />
        {{ t('heading.instance.siteDetails.source.deployed') }}
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
        v-if="instance.hasRedeployPrivilege()"
        block
        class="font-weight-bold text-white"
        kind="primary"
        @click="emit('action-upload-version', instance)"
      >
        <v-icon icon="$installIcon" />
        <span>{{ t('button.uploadNewVersion') }}</span>
      </AppButton>
    </template>
  </SourceInfoCardShell>
</template>

<script lang="ts" setup>
  // app-lite only (no app counterpart). Logic in `../source-info.ts`. The upload modal is owned by
  // the General page: the card emits `action-upload-version`.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import type { ProjectSource } from '@/entities/project/project-source.api'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import SourceInfoCardShell from '@/views/projects/project/general/cards/SourceInfoCardShell.vue'
  import { containersPath, sourceCardView } from '@/views/projects/project/general/source-info'
  import { getProjectSource } from '@/entities/project/project-source.api'
  import { useAppEvent } from '@/shared/events/app-events'
  import { useDateFormat } from '@/shared/time/use-date-format'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const emit = defineEmits<{
    'action-upload-version': [instance: InstanceResource]
  }>()

  const { t } = useTranslation()
  const route = useRoute()

  const formatDate = useDateFormat()

  // `GET /instances/{id}/source` (memo 30 s, shared with the Git card and the modals); the payload is the fallback.
  const source = ref<ProjectSource | null>(null)
  const sourceLoading = ref(false)
  let sourceRequest = 0
  const view = computed(() => sourceCardView(source.value, props.instance))
  const deployed = computed(() => view.value.deploy.state === 'finished')
  // The panel date format, not the legacy `D MMM, HH:mm`.
  const deployedAt = computed(() => (view.value.deploy.at ? formatDate(view.value.deploy.at, { time: true }) : ''))

  // Only the first load shows the skeleton; a refresh keeps the shown values.
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

  function reloadSource (): Promise<void> {
    return loadSource({ fresh: true })
  }

  useAppEvent('instance-item-changed', item => {
    if (item?.id === props.instance.id) {
      void loadSource({ fresh: true })
    }
  })

  onMounted(() => {
    void loadSource()
  })

  defineExpose({ reloadSource })
</script>

<style lang="scss" scoped>
.not-created {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 400;
}

.lighten-text {
  color: var(--v-gray-lighten1);
}

.status-line {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  gap: 4px;
}
</style>
