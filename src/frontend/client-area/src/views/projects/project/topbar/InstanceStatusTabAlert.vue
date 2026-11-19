<template>
  <span
    v-if="visibleIssues.length > 0"
    class="instance-status-tab-alert"
  >
    <v-menu
      :close-delay="150"
      :close-on-content-click="false"
      content-class="elevation-4--before elevation-4"
      elevation="0"
      location="bottom"
      min-width="280"
      :open-delay="150"
      open-on-hover
    >
      <template #activator="{ props: activatorProps }">
        <StatusLabel
          v-bind="activatorProps"
          class="instance-status-tab-alert__chip ml-2"
          data-testid="instance-status-tab-alert"
          icon="$alertwarning"
          status="error"
        />
      </template>

      <div class="status-list">
        <div
          v-for="issue in visibleIssues"
          :key="issue.code"
          class="status-list__issue"
        >
          <div class="d-flex align-start">
            <v-icon
              class="status-list__icon mt-1"
              color="error"
              icon="$alertwarningfilled"
              :size="16"
            />

            <div class="d-flex flex-column">
              <span class="status-list__issue-title heading--text p-2 font-weight-bold">
                {{ issue.title || t(issue.titleKey, issue.params) }}
              </span>

              <span class="status-list__issue-description text-gray-darken-1 p-3">
                {{ issue.detail || t(issue.descriptionKey, issue.params) }}
              </span>

              <AppButton
                v-if="issue.showAction"
                class="status-list__issue-action mt-2"
                kind="primary"
                size="small"
                @click="onIssueAction(issue)"
              >
                <span class="font-weight-bold">{{ t(issue.labelKey, issue.params) }}</span>
              </AppButton>
            </div>
          </div>
        </div>
      </div>
    </v-menu>

    <IssueResolveModal
      v-if="resolveOpen"
      v-model="resolveOpen"
      :instance="instance"
      :issue="activeIssue"
      :submitting="issueResolve.isSubmitting(instance.id)"
      @error="issueResolve.onError"
      @resolve="onResolve"
    />
  </span>
</template>

<script lang="ts" setup>
  // The chip next to Site details for the deploy issues, a menu on
  // hover, and the action (navigate, or the resolve modal). Three sources of issues: the Engine's inspect report (`GET /instances/{id}/source`,
  // its `warnings`, shared memo 30 s, asked again after `instance-item-changed` of this instance), the project payload the Engine synced
  // (`details.deployment_status`/`deployment_warnings`, so a warning shows before the two calls answer), and the Engine's probe of the
  // running application (`GET /instances/{id}/app-health`, asked on mount and when the instance id changes). A request that cannot be
  // answered shows nothing and does not hide the other ones. The host duties of the kit `StatusIndicator`: `markResolved` dismisses
  // the code, the resolve run reports its errors, a second resolve is refused, and the component is keyed by the instance id (`TopBarTabs`).
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import type { ProjectSource } from '@/entities/project/project-source.api'
  import type { HydratedIssue } from '@/entities/project/ui/status-issues/issue-registry'
  import type { IssueResolvePayload } from '@/entities/project/ui/status-issues/status-issues.types'
  import type { IssueIndicator } from '@/entities/project/use-issue-resolve'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { fetchAppHealth } from '@/entities/project/instance-app-health.api'
  import { getProjectSource } from '@/entities/project/project-source.api'
  import { type AppHealth, deployIssuesFromHealth, deployIssuesFromInstance, deployIssuesFromSource, uniqueIssues } from '@/entities/project/ui/status-issues/collect-instance-issues'
  import { hydrateIssue } from '@/entities/project/ui/status-issues/issue-registry'
  import IssueResolveModal from '@/entities/project/ui/status-issues/IssueResolveModal.vue'
  import { useIssueResolve } from '@/entities/project/use-issue-resolve'
  import { useAppEvent } from '@/shared/events/app-events'
  import { preferredSpaBase } from '@/shared/session/preferred-spa-base'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const router = useRouter()
  const session = useSessionStore()
  const issueResolve = useIssueResolve()

  const dismissedCodes = ref<string[]>([])
  const resolveOpen = ref(false)
  const activeIssue = ref<HydratedIssue | null>(null)

  // The Engine's probe of the running application; null until it answers or when it cannot be asked, which shows nothing.
  const health = ref<AppHealth | null>(null)
  // The Engine's inspect report (deploy warnings); same rules as `health`.
  const source = ref<ProjectSource | null>(null)

  const visibleIssues = computed<HydratedIssue[]>(() => uniqueIssues(deployIssuesFromSource(source.value)
    .concat(deployIssuesFromInstance(props.instance.details))
    .concat(deployIssuesFromHealth(health.value)))
    .filter(issue => !dismissedCodes.value.includes(issue.code))
    .map(issue => hydrateIssue(issue, props.instance)))

  async function loadHealth (): Promise<void> {
    const id = props.instance.id
    health.value = null
    dismissedCodes.value = []
    if (!id) {
      return
    }
    try {
      const result = await fetchAppHealth(id)
      // A late answer for a previous instance is ignored.
      if (props.instance.id === id) {
        health.value = result
      }
    } catch {
      // An Engine that cannot be asked is no reason to warn.
      health.value = null
    }
  }

  /** A refresh keeps the shown warnings until the answer arrives; a late answer for another instance is ignored. */
  async function loadSource ({ fresh = false }: { fresh?: boolean } = {}): Promise<void> {
    const id = props.instance.id
    if (!fresh) {
      source.value = null
    }
    if (!id) {
      return
    }
    try {
      const result = await getProjectSource(id, { fresh })
      if (props.instance.id === id) {
        source.value = result
      }
    } catch {
      source.value = null
    }
  }

  watch(() => props.instance.id, () => {
    void loadHealth()
    void loadSource()
  }, { immediate: true })

  // A deploy has changed the project: its warnings are read again.
  useAppEvent('instance-item-changed', item => {
    if (item?.id === props.instance.id) {
      void loadSource({ fresh: true })
    }
  })

  function dismissIssue (code: string): void {
    if (!dismissedCodes.value.includes(code)) {
      dismissedCodes.value = [...dismissedCodes.value, code]
    }
  }

  /** The indicator a resolve run marks on success: it dismisses the code and closes the modal. */
  const indicator: IssueIndicator = {
    markResolved (code: string): void {
      dismissIssue(code)
      resolveOpen.value = false
      activeIssue.value = null
    },
  }

  function onResolve (payload: IssueResolvePayload): void {
    void issueResolve.onResolve(props.instance.id, payload, indicator)
  }

  /** Navigate to the issue's page, or open the resolve modal for it. */
  function onIssueAction (issue: HydratedIssue): void {
    if (!issue.action) {
      return
    }
    if (issue.action.type === 'navigate') {
      void router.push(`${preferredSpaBase(session.home)}/${issue.action.to(props.instance)}`)
      return
    }
    activeIssue.value = issue
    resolveOpen.value = true
  }
</script>

<style lang="scss" scoped>
// The chip and its menu sit inline with the tab label.
.instance-status-tab-alert {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}

// The same chip as the other tabs (`InstanceTopBarTabs` `.top-bar__chip`: 32 px tall, icon centred), so the warning next to Site details is
// as big as the Backups, Monitoring, Plugins and Advanced chips (the kit chip is 24 px).
.v-chip.status-label.instance-status-tab-alert__chip {
  --v-chip-height: 32px;

  height: 32px;
  padding: 0 8px;

  :deep(.v-chip__content) {
    justify-content: center;
  }

  :deep(.v-icon) {
    margin-inline: 0;
  }
}

.status-list {
  padding: 16px;
  position: relative;
  z-index: 99;
  background: var(--v-tooltip-base);
  // Legacy `.status-list` text takes the theme text colour, and the menu is 280 px wide: long titles wrap in both apps.
  color: var(--v-text-base);
  border-radius: 6px;
  min-width: 280px;
  max-width: 280px;

  &__issue + &__issue {
    margin-top: 12px;
  }

  &__issue-description {
    margin-top: 2px;
    white-space: pre-line;
  }

  &__issue-action {
    align-self: flex-start;
  }

  &__icon {
    margin-right: 6px;
  }
}
</style>
