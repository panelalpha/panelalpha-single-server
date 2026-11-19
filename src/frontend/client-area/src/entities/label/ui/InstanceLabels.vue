<template>
  <div class="d-flex">
    <v-menu
      v-model="menuOpen"
      :close-on-content-click="false"
      content-class="instance-label-menu"
      :location-strategy="legacyBelowLocation"
      max-width="354px"
      :open-on-click="false"
      width="100vw"
    >
      <template #activator="{ props: activatorProps }">
        <div v-bind="activatorProps">
          <div
            v-if="checkIfHasLabels"
            class="d-flex labels-wrap label-bar"
            :class="disabled ? 'label-bar--disabled' : ''"
          >
            <labels-list
              :active="activatorProps['aria-expanded'] === 'true'"
              :aria-expanded="activatorProps['aria-expanded']"
              :aria-haspopup="activatorProps['aria-haspopup']"
              :chips="chips"
              :container-class="containerClass"
              :dots="dots"
              :filters-active="filtersActive"
              :instance="instance"
              :instance-item="instanceItem"
              :labels="instanceLabels"
              :loading="loading"
              :max-labels-displayed="maxLabelsDisplayed"
              :max-width="maxWidth"
              :remaining-as-button="remainingAsButton"
              :removable="false"
              small
              xsmall
              @show-remaining="toggleMenu"
              @toggle-filter="toggleFilter"
            />
          </div>

          <span
            v-else
            :aria-expanded="activatorProps['aria-expanded']"
            :aria-haspopup="activatorProps['aria-haspopup']"
            class="label-bar-empty link-text p-4"
            :class="disabled ? 'label-bar--disabled' : ''"
            @click="toggleMenu"
          >
            <template v-if="!loading">{{ t('button.tag.addTags') }}</template>

            <span v-else>
              <loader size="16" />
            </span>
          </span>
        </div>
      </template>

      <add-new-label
        v-if="addNewLabelView"
        :error="addLabelError"
        @change-view="changeView"
        @close="closeMenu"
        @create-label="onCreateLabel"
      />

      <assign-existing-label
        v-else
        :available-labels="availableLabels"
        :instance-labels="instanceLabels"
        :is-loading="loading"
        @assign-label="onAssignLabel"
        @change-view="changeView"
        @close="closeMenu"
        @delete-label="onDeleteLabel"
        @unassign-label="onUnassignLabel"
      />
    </v-menu>
  </div>
</template>

<script lang="ts" setup>
  import type { LabelChipItem } from '@/shared/ui/labels/labels.types'
  // Differs from app: `.label-bar-empty` has no `white-space: nowrap` (app-lite wins). The menu (Assign / Add panels), the label API calls and the account label
  // list updates. The places that differ from legacy are marked.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onScopeDispose, ref, type Ref, watch } from 'vue'
  import { labelMenuLeft, labelMenuTop, labelsToAssign } from '@/entities/label/label-menu'
  import {
    assignLabel as assignLabelRequest,
    clearLabelsCache,
    createLabel,
    deleteLabel,
    type LabelResource,
    unassignLabel,
  } from '@/entities/label/labels.api'
  import { useLabelsStore } from '@/entities/label/labels.store'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import AddNewLabel from './AddNewLabel.vue'
  import AssignExistingLabel from './AssignExistingLabel.vue'
  import LabelsList from './LabelsList.vue'

  const props = withDefaults(defineProps<{
    disabled?: boolean
    filtersActive?: boolean
    dots?: boolean
    chips?: boolean
    containerClass?: string
    xsmall?: boolean
    remainingAsButton?: boolean
    instanceItem?: boolean
    maxLabelsDisplayed?: number
    maxWidth?: number
    labels: LabelChipItem[]
    instance: InstanceResource
  }>(), {
    disabled: false,
    filtersActive: false,
    dots: false,
    chips: false,
    containerClass: '',
    xsmall: false,
    remainingAsButton: false,
    instanceItem: false,
    maxLabelsDisplayed: 2,
    maxWidth: 0,
  })

  const emit = defineEmits<{
    'toggle-filter': [item: { title: string, color?: string }]
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()
  const labelsStore = useLabelsStore()

  // A local copy that is not re-synced by a watch. It is the same array as the
  // store's `instance.labels`, so an assign pushed here shows in the table and the filter too (legacy quirk, ported 1:1).
  const instanceLabels = ref(props.labels)
  const loading = ref(false)
  const menuOpen = ref(false)
  const addNewLabelView = ref(false)
  const addLabelError = ref('')

  const checkIfHasLabels = computed(() => props.labels.length > 0)

  const availableLabels = computed(() => labelsToAssign(labelsStore.availableLabels, instanceLabels.value))

  // Legacy V2 menu (`offset-y`, `nudge-bottom="8px"`): the content sits under the activator and moves up when it would end below the
  // viewport. It never flips above the activator, which V4's connected strategy does (the mobile Assign panel opened above the field).
  // Only the position is set here; the width is the prop's `max-width` plus the activator's width as `min-width`, as in legacy.
  interface MenuLocationData {
    target: Ref<HTMLElement | [number, number] | undefined>
    contentEl: Ref<HTMLElement | undefined>
    isActive: Ref<boolean>
  }
  function legacyBelowLocation (
    data: MenuLocationData,
    _props: unknown,
    contentStyles: Ref<Record<string, string>>,
  ): { updateLocation: () => void } {
    function update (): void {
      const target = data.target.value
      const content = data.contentEl.value
      if (!(target instanceof HTMLElement) || !content) {
        return
      }
      const anchor = target.getBoundingClientRect()
      const box = content.getBoundingClientRect()
      const top = labelMenuTop(anchor.bottom, box.height, window.innerHeight)
      const left = labelMenuLeft(anchor.left, box.width, window.innerWidth)
      contentStyles.value = {
        top: `${top + window.scrollY}px`,
        left: `${left + window.scrollX}px`,
        minWidth: `${anchor.width}px`,
      }
    }
    // The list of the Assign panel loads after the menu opens, so the height changes: follow the content size.
    const observer = new ResizeObserver(update)
    watch([data.isActive, data.contentEl], ([active, element], [, previous]) => {
      if (previous) {
        observer.unobserve(previous)
      }
      if (active && element) {
        observer.observe(element)
      }
    }, { flush: 'post' })
    onScopeDispose(() => observer.disconnect())
    return { updateLocation: update }
  }

  function toggleFilter (item: { title: string, color?: string }): void {
    emit('toggle-filter', item)
  }

  function toggleMenu (): void {
    menuOpen.value = !menuOpen.value
  }

  // The panel goes back to Assign only after the menu has closed.
  function closeMenu (): void {
    menuOpen.value = false
    setTimeout(() => {
      addNewLabelView.value = false
    }, 200)
  }

  function changeView (): void {
    addNewLabelView.value = !addNewLabelView.value
  }

  /**
   * Clears the add-panel error, calls the API and pushes the label locally. Returns the server
   * message on failure, `null` on success. `in_use` is written only after success (legacy wrote it first).
   */
  async function requestAssign (label: LabelChipItem): Promise<string | null> {
    addLabelError.value = ''
    loading.value = true
    try {
      await assignLabelRequest(props.instance.id, label as LabelResource)
      labelsStore.updateLabelInUse(label, true)
      instanceLabels.value.push(label)
      return null
    } catch (error) {
      return getErrorMessage(error)
    } finally {
      loading.value = false
    }
  }

  // Assign panel. Unlike legacy, the server message is an alert, the way unassign reports errors.
  async function onAssignLabel (label: LabelChipItem): Promise<void> {
    const error = await requestAssign(label)
    if (error !== null) {
      alerts.addAlert({ success: false, errorMessage: error })
    }
  }

  // `in_use` comes from the answer; a failure is an alert.
  async function onUnassignLabel (label: LabelChipItem): Promise<void> {
    loading.value = true
    try {
      const data = await unassignLabel(props.instance.id, label as LabelResource)
      labelsStore.updateLabelInUse(label, Boolean(data.in_use))
      instanceLabels.value = instanceLabels.value.filter(current => !(label.title === current.title && label.color === current.color))
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      loading.value = false
    }
  }

  // Create, then assign. A create or assign error stays inline in the Add panel.
  async function onCreateLabel (label: { title: string, color: string }): Promise<void> {
    try {
      await createLabel(label)
    } catch (error) {
      addLabelError.value = getErrorMessage(error)
      return
    }

    labelsStore.addUserLabel(label)
    // Legacy keeps `/labels` cached for 36000 s, so the next list of labels must come from the server.
    clearLabelsCache()

    const assignError = await requestAssign(label)
    if (assignError !== null) {
      addLabelError.value = assignError
    }
    changeView()
  }

  // The cache is dropped after a successful delete.
  async function onDeleteLabel (label: LabelChipItem): Promise<void> {
    try {
      await deleteLabel(label as LabelResource)
    } catch {
      alerts.addAlert({ success: false, errorMessage: t('notification.instance.label.delete.error') })
      return
    }

    labelsStore.removeUserLabel(label)
    clearLabelsCache()
  }
</script>

<style lang="scss">
// The menu is teleported out of this component, so its rule cannot be scoped. Scope is the `instance-label-menu` content class.
// Legacy V2 menu content text colour is `--v-text-base`; V4 overlay content paints `on-surface` (`rgba(0,0,0,.87)`) instead.
.v-menu > .v-overlay__content.instance-label-menu.instance-label-menu {
  color: var(--v-text-base);
}
</style>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.label-bar--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.label-bar-empty[aria-expanded="true"] {
  color: map.get(v.$primary, darken1);
}

.label-bar[aria-expanded="true"] {
  .v-btn.v-btn--icon.v-btn--size-x-small {
    border-color: transparent;
    background: map.get(v.$primary, lighten2);
    color: map.get(v.$primary, darken1);
  }
}

.v-btn.v-btn--icon.v-btn--size-x-small {
  max-width: 24px;
  max-height: 24px;
  font-size: v.$font-size-xs;
  line-height: v.$line-height-xs;
  padding: 0px !important; // beats the global `.v-btn { padding-x: 16px !important }`
  margin-top: 0px;
  border: 1px solid map.get(v.$gray, lighten1);
}

.labels-wrap {
  div {
    flex-wrap: wrap;
  }
}
</style>
