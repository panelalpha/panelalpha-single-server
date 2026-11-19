<template>
  <div>
    <AdvancedPageLayout :title="t('heading.instance.advanced.siteDetails.title')">
      <v-col
        v-if="showRebuildNote"
        cols="12"
      >
        <AppMessage
          data-testid="project-limits-rebuild-note"
          variant="info"
        >
          {{ t('heading.instance.advanced.projectLimits.rebuildNote') }}

          <template #action>
            <!-- A filled button and a bordered one: as plain text in the variant colour they read as part of the message, not as actions. -->
            <AppButton
              v-if="canRedeploy"
              color="info"
              data-testid="project-limits-redeploy"
              kind="primary"
              @click="redeployNow"
            >
              {{ t('heading.instance.advanced.projectLimits.redeployNow') }}
            </AppButton>

            <AppButton
              color="info"
              data-testid="project-limits-rebuild-note-close"
              kind="field"
              @click="showRebuildNote = false"
            >
              {{ t('button.close') }}
            </AppButton>
          </template>
        </AppMessage>
      </v-col>

      <ProjectUsageCards
        :is-container="isContainerProject(instance)"
        :loading="fetching"
        :resources="instance.resources"
        :server="serverSize"
      />

      <SiteDetailsCard
        :instance="instance"
        :limits-row="showLimitsRow"
        :loading="fetching"
      >
        <template #site-name>
          <EditableHeader
            :input-value="instance.title ?? ''"
            :instance="instance"
            :loading="frame.savingName"
            :rules="siteNameRules"
            @update:input-value="updateSiteName"
          />
        </template>

        <template #limits>
          <span
            class="details-value heading--text font-weight-bold"
            data-testid="project-limits-summary"
          >{{ limitsText }}</span>

          <AppButton
            class="ml-2"
            data-testid="project-limits-manage"
            size="x-small"
            variant="text"
            @click="limitsOpen = true"
          >
            {{ canManageLimits ? t('heading.instance.advanced.siteDetails.card.site.limits.manage') : t('heading.instance.advanced.siteDetails.card.site.limits.viewAll') }}
          </AppButton>
        </template>
      </SiteDetailsCard>

      <v-col
        v-if="speedCardsEnabled(session.home)"
        cols="12"
        md="6"
        sm="12"
      >
        <v-card elevation="4">
          <InstanceCardImgNotAvailable
            v-if="!instance.screenshot_url"
            :instance="instance"
          />

          <!-- Legacy `v-img` fills the box (V2 default is cover); V4 defaults to contain, which letterboxes the screenshot. -->
          <v-img
            v-else
            cover
            height="364px"
            :src="instance.screenshot_url"
            width="100%"
          >
            <template #placeholder>
              <v-skeleton-loader
                height="100%"
                type="image"
              />
            </template>
          </v-img>
        </v-card>
      </v-col>

      <v-col cols="12">
        <InstallationDetailsCard
          v-if="instance.hasViewInstallationDetailsPrivilege()"
          :installation-details="installationDetails"
          :instance-id="instance.id"
          :loading="fetchingInstallDetails"
        />
      </v-col>
    </AdvancedPageLayout>

    <ProjectLimitsModal
      v-if="showLimitsRow"
      v-model="limitsOpen"
      :instance="instance"
      :read-only="!canManageLimits"
      :save="frame.updateLimits"
      @saved="onLimitsSaved"
    />

    <!-- The page owns the redeploy modal and opens it with `open()`. -->
    <GitRedeployModal
      v-if="canRedeploy && instance.hasGitSource()"
      ref="redeployModal"
      :instance="instance"
      @reload-instance="emit('reload-instance')"
    />

    <FilesUploadVersionModal
      v-if="canRedeploy && instance.hasFilesSource()"
      ref="uploadModal"
      :instance="instance"
      @reload-instance="emit('reload-instance')"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { InstallationDetails } from './installation-details'
  // The Site name row takes the editable header through the card's `site-name` slot.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
  import { getServerMetricsCurrent } from '@/views/hosting/hosting.api'
  import AdvancedPageLayout from '@/views/projects/project/advanced/ui/AdvancedPageLayout.vue'
  import { speedCardsEnabled } from '@/views/projects/project/general/general-cards'
  import FilesUploadVersionModal from '@/views/projects/project/general/modals/FilesUploadVersionModal.vue'
  import GitRedeployModal from '@/views/projects/project/general/modals/GitRedeployModal.vue'
  import { getInstallationDetails } from '@/views/projects/project/instance.api'
  import { useInstanceStore } from '@/views/projects/project/instance.store'
  import { isContainerProject } from '@/entities/project/container-project'
  import { limitsSummary, type ServerTotals, serverTotals, type Translate, usageRings } from '@/entities/project/project-usage'
  import InstanceCardImgNotAvailable from '@/entities/project/ui/InstanceCardImgNotAvailable.vue'
  import ProjectLimitsModal from '@/entities/project/ui/ProjectLimitsModal.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { emit as emitAppEvent } from '@/shared/events/app-events'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { useFormRules } from '@/shared/ui/form/use-form-rules'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import EditableHeader from './EditableHeader.vue'
  import InstallationDetailsCard from './InstallationDetailsCard.vue'
  import ProjectUsageCards from './ProjectUsageCards.vue'
  import SiteDetailsCard from './SiteDetailsCard.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const emit = defineEmits<{ 'reload-instance': [] }>()

  const { t } = useTranslation()
  const session = useSessionStore()
  const frame = useInstanceStore()
  const alerts = useAlertsStore()
  const { siteNameRules } = useFormRules()

  const fetching = ref(true)
  const fetchingInstallDetails = ref(true)
  const installationDetails = ref<Partial<InstallationDetails>>({})

  const serverSize = ref<ServerTotals | null>(null)
  const limitsOpen = ref(false)
  const showRebuildNote = ref(false)
  const redeployModal = useTemplateRef<InstanceType<typeof GitRedeployModal>>('redeployModal')
  const uploadModal = useTemplateRef<InstanceType<typeof FilesUploadVersionModal>>('uploadModal')

  // The Limits row is for a live project with a resources block; a staging copy and an older payload have none.
  const showLimitsRow = computed(() => !props.instance.staging && props.instance.resources !== null)
  const canManageLimits = computed(() => props.instance.hasManageLimitsPrivilege())
  const canRedeploy = computed(() => isContainerProject(props.instance)
    && props.instance.hasRedeployPrivilege()
    && (props.instance.hasGitSource() || props.instance.hasFilesSource()))

  const limitsText = computed(() => {
    const resources = props.instance.resources
    if (!resources) {
      return ''
    }
    const { main, more } = limitsSummary(resources.limits, t as Translate)
    const parts = [main.join(' · ')]
    if (more > 0) {
      parts.push(t('heading.instance.advanced.siteDetails.card.site.limits.more', { count: more }))
    }
    return parts.filter(Boolean).join(' ')
  })

  function onLimitsSaved (needsRebuild: boolean): void {
    // A later save that needs no rebuild keeps the note: the earlier change is still waiting for it.
    showRebuildNote.value ||= needsRebuild
  }

  async function redeployNow (): Promise<void> {
    if (props.instance.hasGitSource()) {
      await redeployModal.value?.open()
    } else {
      uploadModal.value?.open()
    }
  }

  /**
   * RAM or disk without a limit is shown as a percent of the whole server. Its size comes from the server metrics, which only a single
   * server has (elsewhere the backend answers 404); without them, or on an error, the ring keeps the bare amount, so the error is not shown.
   */
  async function fetchServerSize (): Promise<void> {
    const resources = props.instance.resources
    if (serverSize.value !== null || !session.home?.app?.single_server?.active || !resources) {
      return
    }
    const rings = usageRings(resources, undefined, isContainerProject(props.instance))
    if (rings.ram.note !== 'unlimited' && rings.disk.note !== 'unlimited') {
      return
    }
    try {
      serverSize.value = serverTotals(await getServerMetricsCurrent())
    } catch {
      serverSize.value = null
    }
  }

  // Also after a limits Save reloads the project: a limit set back to unlimited needs the server size then.
  watch(() => props.instance.resources, () => void fetchServerSize(), { immediate: true })

  onMounted(() => {
    fetching.value = false

    if (props.instance.hasViewInstallationDetailsPrivilege()) {
      fetchInstallationDetails()
    } else {
      fetchingInstallDetails.value = false
    }
  })

  /** The request is made only with the privilege; the skeleton ends on success and on failure. */
  async function fetchInstallationDetails (): Promise<void> {
    fetchingInstallDetails.value = true
    try {
      installationDetails.value = await getInstallationDetails(props.instance.id)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      fetchingInstallDetails.value = false
    }
  }

  /** The save goes to the frame's store; the document title follows a successful save. */
  async function updateSiteName (name: string): Promise<void> {
    if (await frame.updateSiteName(name)) {
      emitAppEvent('document-title-update')
    }
  }
</script>

<style lang="scss" scoped>
// The cards fill the row height, and the screenshot placeholder fills the image box.
:deep(.v-card) {
  height: 100%;
}

.v-skeleton-loader {
  :deep(.v-skeleton-loader__image) {
    min-height: 100%;
  }
}
</style>
