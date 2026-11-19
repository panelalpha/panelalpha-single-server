<template>
  <div
    class="table-item item--status"
    :class="main ? 'group-start' : ''"
  >
    <div class="item">
      <p
        v-if="item.hasActionInProgress()"
        class="item__value"
      >
        <v-icon
          class="text--gray-lighten1"
          icon="$loader"
          :size="20"
        />
      </p>

      <status-indicator
        v-else
        ref="issueIndicator"
        :instance="item"
        same-size
        :submitting="issueResolve.isSubmitting(item.id)"
        @action="onIssueAction"
        @error="issueResolve.onError"
        @resolve="payload => issueResolve.onResolve(item.id, payload, issueIndicator)"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import type { HydratedIssue } from '@/entities/project/ui/status-issues/issue-registry'
  import type { IssueIndicator } from '@/entities/project/use-issue-resolve'
  import { useTemplateRef } from 'vue'
  import { useRouter } from 'vue-router'
  import StatusIndicator from '@/entities/project/ui/status-issues/StatusIndicator.vue'
  import { useIssueResolve } from '@/entities/project/use-issue-resolve'
  import { preferredSpaBase } from '@/shared/session/preferred-spa-base'
  import { useSessionStore } from '@/shared/session/session.store'

  const props = defineProps<{
    item: InstanceResource
    main?: boolean
  }>()

  const router = useRouter()
  // Not `statusIndicator`: a setup binding of that name would shadow the `<status-indicator>` tag.
  const issueIndicator = useTemplateRef<IssueIndicator>('issueIndicator')
  const issueResolve = useIssueResolve()
  const session = useSessionStore()

  /** The kit `StatusIndicator` leaves navigation to the host. */
  function onIssueAction (issue: HydratedIssue): void {
    if (issue.action?.type === 'navigate') {
      void router.push(`${preferredSpaBase(session.home)}/${issue.action.to(props.item)}`)
    }
  }
</script>
