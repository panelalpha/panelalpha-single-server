<template>
  <span
    class="status-indicator-root"
    :class="{
      'status-indicator-root--tab': isTabVariant,
      'status-indicator-root--empty': isTabVariant && visibleIssues.length === 0,
    }"
  >
    <v-menu
      v-if="visibleIssues.length > 0"
      :close-delay="150"
      :close-on-content-click="false"
      :content-class="menuContentClass"
      :location="isTabVariant ? 'bottom start' : 'start top'"
      :max-width="280"
      :min-width="280"
      :offset="isTabVariant ? 0 : [16, 50]"
      :open-delay="150"
      :open-on-hover="true"
    >
      <template #activator="{ props: activatorProps }">
        <span
          v-bind="activatorProps"
          :class="
            isTabVariant
              ? 'd-inline-flex align-center status-indicator-tab-activator'
              : 'status-indicator-container'
          "
        >
          <template v-if="isTabVariant">
            <v-chip
              v-if="!hasActionPending"
              class="text-error error p-3 px-2 py-1 ml-2"
              label
              variant="flat"
            >
              <v-icon
                class="text-error"
                icon="$alertwarning"
                size="16"
              />
            </v-chip>

            <span
              v-else
              class="ml-2 d-inline-flex"
            >
              <loader
                color="primary"
                no-margins
                :size="20"
              />
            </span>
          </template>

          <template v-else>
            <div
              v-if="!hasActionPending"
              class="status-indicator status-indicator--warning"
              :class="{ 'status-indicator--samesize': sameSize }"
            >
              <v-icon
                class="text-error"
                icon="$alertwarningfilled"
                size="16"
              />
            </div>

            <loader
              v-else
              color="primary"
              no-margins
              :size="20"
            />
          </template>
        </span>
      </template>

      <div class="status-list">
        <div
          v-for="group in groupedIssues"
          :key="group.category"
          class="d-flex flex-column status-list__group"
        >
          <span class="status-list__title p-4">{{ t(group.labelKey) }}</span>

          <div
            v-for="issue in group.issues"
            :key="issue.code"
            class="status-list__issue"
          >
            <div class="d-flex align-start">
              <v-icon
                class="status-list__icon mt-1"
                color="error"
                icon="$alertwarningfilled"
                size="16"
              />

              <div class="d-flex flex-column">
                <span class="status-list__issue-title p-2 font-weight-bold">{{
                  issue.title || t(issue.titleKey, issueParams(issue))
                }}</span>

                <span class="status-list__issue-description p-3">{{
                  issue.detail || t(issue.descriptionKey, issueParams(issue))
                }}</span>

                <AppButton
                  v-if="issue.showAction"
                  class="status-list__issue-action mt-2"
                  kind="primary"
                  size="small"
                  @click="onIssueAction(issue)"
                >
                  <span class="font-weight-bold">{{
                    t(issue.labelKey, issueParams(issue))
                  }}</span>
                </AppButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </v-menu>

    <issue-resolve-modal
      v-if="resolveOpen"
      v-model="resolveOpen"
      :instance="instance"
      :issue="activeIssue"
      :submitting="submitting"
      @error="emit('error', $event)"
      @resolve="onResolve"
    />
  </span>
</template>

<script lang="ts" setup>
  import type { IssueResolvePayload } from './status-issues.types'
  // The app version (always-visible
  // green/red status list with WordPress/WooCommerce versions and backup status) is NOT ported: accepted
  // difference from legacy for the app host.
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import {
    CATEGORY_ORDER,
    collectInstanceIssues,
  } from './collect-instance-issues'
  import { type HydratedIssue, hydrateIssue, type InstanceLike } from './issue-registry'
  import IssueResolveModal from './IssueResolveModal.vue'

  const props = withDefaults(defineProps<{
    instance: InstanceLike
    sameSize?: boolean
    variant?: 'card' | 'tab'
    // The lite screen runs the upload + redeploy POSTs; it reports the progress here.
    submitting?: boolean
  }>(), {
    sameSize: false,
    variant: 'card',
    submitting: false,
  })

  const emit = defineEmits<{
    // An issue action with a route; the screen navigates.
    action: [issue: HydratedIssue]
    // The resolve dialog was confirmed (legacy ran the API calls itself).
    resolve: [payload: IssueResolvePayload]
    error: [key: string]
  }>()

  const { t } = useTranslation()

  const dismissedCodes = ref<string[]>([])
  const resolveOpen = ref(false)
  const activeIssue = ref<HydratedIssue | null>(null)

  const isTabVariant = computed(() => props.variant === 'tab')

  const menuContentClass = computed(() => {
    // `disable-scroll` (global `_dropdowns.scss`: `overflow: visible !important`): V4's location strategy counts an overlay content that
    // overflows its own box as a scroll parent of itself, so a menu that is momentarily shorter than its list (the first measure, before the
    // activator has a box) clamps the viewport to that box and ends up with `max-height: 0`. V2 sized the menu from the list height.
    const classes = ['elevation-4--before', 'elevation-4', 'status-indicator-menu', 'disable-scroll']
    if (!isTabVariant.value) {
      classes.push('elevation-4--after', 'status-indicator-menu--card')
    }
    return classes.join(' ')
  })

  const visibleIssues = computed(() => collectInstanceIssues(props.instance)
    .filter(issue => !dismissedCodes.value.includes(issue.code))
    .map(issue => hydrateIssue(issue, props.instance)))

  const groupedIssues = computed(() => CATEGORY_ORDER.map(category => ({
    category,
    labelKey: `heading.instance.statusIndicator.category.${category}`,
    issues: visibleIssues.value.filter(issue => issue.category === category),
  })).filter(group => group.issues.length > 0))

  const hasWordpressAction = computed(() => typeof props.instance.hasUpdateInProgress === 'function'
    ? props.instance.hasUpdateInProgress()
    : false)

  const hasBackupAction = computed(() => {
    for (const b of props.instance.backup_details ?? []) {
      const asyncStatus = b.async_status ?? {}
      if (
        asyncStatus.create === 'pending'
        || asyncStatus.create === 'in_progress'
        || asyncStatus.restore === 'pending'
        || asyncStatus.restore === 'in_progress'
      ) {
        return true
      }
    }
    return false
  })

  const hasActionPending = computed(() => hasBackupAction.value || hasWordpressAction.value)

  function issueParams (issue: HydratedIssue): Record<string, unknown> {
    return (issue.params ?? {}) as Record<string, unknown>
  }

  function dismissIssue (code: string): void {
    if (!dismissedCodes.value.includes(code)) {
      dismissedCodes.value = [...dismissedCodes.value, code]
    }
  }

  function onIssueAction (issue: HydratedIssue): void {
    if (!issue.action) {
      return
    }
    if (issue.action.type === 'navigate') {
      emit('action', issue)
      return
    }
    activeIssue.value = issue
    resolveOpen.value = true
  }

  /** Dismiss the issue and close the dialog. */
  function markResolved (code: string): void {
    dismissIssue(code)
    resolveOpen.value = false
    activeIssue.value = null
  }

  function onResolve (payload: IssueResolvePayload): void {
    // The archive upload waits for the request, so the screen calls `markResolved` once that succeeds.
    emit('resolve', payload)
  }

  defineExpose({ markResolved })
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.status-indicator-root--tab {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}

.status-indicator-root--empty {
  display: none;
}

.error {
  background-color: var(--v-error-lighten5);
}

.status-indicator-container {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
}

.status-indicator {
  height: 20px;
  width: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;

  &--ok {
    color: map.get(v.$primary, base);
  }

  &--warning:not(.status-indicator--samesize) {
    height: 32px;
    width: 32px;
    color: map.get(v.$error, base);
    background-color: map.get(v.$error, lighten2);
  }
}

.status-list {
  padding: 16px;
  position: relative;
  z-index: 99;
  background: var(--v-tooltip-base);
  border-radius: 6px;
  min-width: 280px;

  &__group {
    &:not(:last-child) {
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--v-gray-lighten2);
    }
  }

  &__title {
    color: map.get(v.$gray, darken1);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-weight: v.$font-weight-semibold;
    margin-bottom: 8px;
  }

  &__issue {
    & + & {
      margin-top: 12px;
    }
  }

  &__issue-title {
    color: var(--v-heading-base);
  }

  &__issue-description {
    color: map.get(v.$gray, darken1);
    margin-top: 2px;
    // The Engine's own warning texts arrive one per line.
    white-space: pre-line;
  }

  &__issue-action {
    align-self: flex-start;
    // V2 `elevation="0"` painted three zero-size shadows; the V4 flat button paints two with other opacities.
    box-shadow: v.$box-shadow-v2-list-flat;
  }

  &__icon {
    margin-right: 6px;
  }
}

[dir=rtl] {
  .status-list {
    &__icon {
      margin-right: 0px;
      margin-left: 6px;
    }
  }
}
</style>

<style lang="scss">
@use '@/app/styles/legacy/tokens/variables' as v;

// Overlay content is teleported out of the scoped tree: unscoped, keyed on the V4 `.v-overlay__content`
// The menu takes the app text colour (V2 menu content had no theme colour of its own), the `.elevation-4` shadow and a 6px radius; the
// selectors are doubled to beat the global `.v-menu > .v-overlay__content` rules of `_dropdowns.scss`, which have the same specificity.
.v-menu > .v-overlay__content.status-indicator-menu.status-indicator-menu {
  color: var(--v-text-base);
}

.v-menu > .v-overlay__content.status-indicator-menu--card.status-indicator-menu--card {
  border-radius: 6px;
  box-shadow: v.$box-shadow-elevation-4;
}

.v-overlay__content.status-indicator-menu--card {
  border-radius: 6px;
  contain: none;

  &::before {
    content: "";
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 6px;
    top: 0px;
    z-index: -2;
    left: 0px;
  }

  &::after {
    content: "";
    position: absolute;
    width: 20px;
    height: 20px;
    right: -10px;
    top: 55px;
    z-index: -1;
    transform: rotate(45deg);
    transform-origin: center;
    background: white;
  }
}
</style>
