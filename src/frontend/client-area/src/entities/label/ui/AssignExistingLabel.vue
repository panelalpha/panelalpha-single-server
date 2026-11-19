<template>
  <div
    class="assign-existing-label"
    data-testid="label-assign"
  >
    <div class="px-3 py-3 heading--text d-flex justify-space-between">
      <div class="p-2 font-weight-bold py-1">
        {{ t('heading.instance.tag.assignExisting.title') }}
      </div>

      <div
        v-ripple
        class="btn-close"
        @click="emit('close')"
      >
        <v-icon
          icon="$close"
          size="16"
        />
      </div>
    </div>

    <v-divider />

    <div
      v-if="instanceLabels.length > 0"
      class="px-4 pt-4 pb-2 labels-list"
    >
      <labels-list
        chips
        container-class="ml-0"
        :labels="instanceLabels"
        :loading="isLoading"
        :max-labels-displayed="99"
        removable
        small
        @unassign-label="emit('unassign-label', $event)"
      />
    </div>

    <div
      v-else
      class="px-4 py-4 labels-list"
    >
      <span
        v-if="!isLoading"
        class="no-tags-text text-gray-darken-1 text-center mb-0 p-4 font-weight-600"
      >
        {{ t('message.tag.noAssigned') }}
      </span>

      <span v-else>
        <loader
          no-margins
          size="16"
        />
      </span>
    </div>

    <v-divider />

    <div class="d-flex">
      <v-autocomplete
        v-model="input"
        class="pt-0 mt-0 custom-input"
        hide-details
        item-title="title"
        item-value="title"
        :items="availableLabels"
        :menu-icon="''"
        :menu-props="labelMenuProps"
        persistent-placeholder
        :placeholder="t('form.placeholder.tag.assign')"
        variant="solo"
        @update:search="input = null"
      >
        <template #append-inner>
          <v-icon
            icon="$chevrondown"
            size="16"
          />
        </template>

        <template #prepend-inner>
          <v-icon
            icon="$search"
            size="20"
          />
        </template>

        <template #no-data>
          <div class="text-center px-4 py-4">
            <i18next :translation="t('message.tag.noTags')">
              <template #link>
                <a
                  class="info--text"
                  @click="emit('change-view')"
                >{{ t('button.tag.add') }}</a>
              </template>
            </i18next>
          </div>
        </template>

        <template #item="{ item, props: itemProps }">
          <v-list-item
            v-bind="itemProps"
            :title="undefined"
          >
            <div
              class="d-flex justify-space-between w-100 instance-label-list"
              @click="emit('assign-label', item)"
            >
              <label-chip
                :item="item"
                xsmall
              />

              <v-tooltip
                v-if="item.in_use"
                content-class="instance-label-list__tooltip"
                location="bottom"
                max-width="148px"
                open-delay="150"
                transition="custom-tooltip"
              >
                <template #activator="{ props: tooltipProps }">
                  <div
                    v-bind="tooltipProps"
                    class="instance-label-list__remove instance-label-list__remove--disabled"
                    @click.stop
                  >
                    {{ t('button.remove') }}
                  </div>
                </template>

                <span class="p-4 text-center">{{ t('tooltip.label.remove') }}</span>
              </v-tooltip>

              <div
                v-else
                class="instance-label-list__remove"
                @click.stop="emit('delete-label', item)"
              >
                {{ t('button.remove') }}
              </div>
            </div>
          </v-list-item>
        </template>
      </v-autocomplete>

      <AppButton
        class="custom-button"
        @click="emit('change-view')"
      >
        {{ t('button.addNew') }}
      </AppButton>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The chips here do nothing on a click
  // (`labels-list` has no toggle-filter listener), and the "Remove" of an in-use label is disabled with a tooltip.
  // Errors of the assign request are not shown here; the host turns them into an alert.
  import type { LabelChipItem } from '@/shared/ui/labels/labels.types'
  import { useTranslation } from 'i18next-vue'
  import { ref } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import LabelChip from '@/shared/ui/labels/LabelChip.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import LabelsList from './LabelsList.vue'

  withDefaults(defineProps<{
    instanceLabels: LabelChipItem[]
    availableLabels: LabelChipItem[]
    isLoading?: boolean
  }>(), {
    isLoading: false,
  })

  const emit = defineEmits<{
    'close': []
    'change-view': []
    'assign-label': [label: LabelChipItem]
    'unassign-label': [label: LabelChipItem]
    'delete-label': [label: LabelChipItem]
  }>()

  const { t } = useTranslation()

  const input = ref<string | null>(null)

  // Legacy `nudge-bottom="24px"` without `offset-y` opens the menu over the 56px field. The offset is measured in the parity harness (list `y` 746px).
  // Legacy `.label-autocomplete { margin-top: 16px }` computes to 12px there, and
  // a 16px margin here moves the list the wrong way, so the margin is not ported.
  const labelMenuProps = {
    contentClass: 'label-autocomplete',
    offset: 4,
  }
</script>

<style lang="scss">
// The autocomplete list is teleported out of this component, so its rules cannot be scoped. Scope is the `label-autocomplete` class.
// `.v-theme--light.v-menu > .v-overlay__content` (`_dropdowns.scss`) is (0,3,0): the content class needs the menu and overlay
// selectors too, or the overlay text colour wins.
// The menu takes the width of the field (the connected strategy writes it as `min-width`). The global `.label-autocomplete`
// (`_labels.scss`, 354px) is the width of the whole panel, which V2 overrode with the field width inline (249px measured).
.v-menu > .v-overlay__content.label-autocomplete.label-autocomplete {
  color: var(--v-text-base);
  width: auto;

  // V2 list tile content is a flex item that shrinks by the `margin-right: 10px` of `.instance-label-list` (`_labels.scss`), so "Remove"
  // ends 10px before the tile's edge; V4's grid content lets the 100%-wide row overflow instead (measured 9.77px).
  .instance-label-list {
    margin-right: 0;
    padding-right: 10px;
  }
}
</style>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.btn-close {
  height: 32px;
  min-width: 32px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.custom-button,
.custom-input {
  border: none;
  box-shadow: none;
  border-radius: 0;
  background: transparent;
  height: 56px;
}

.custom-button.v-btn {
  :deep(.v-btn__content) {
    font-weight: v.$font-weight-bold;
    font-size: v.$font-size-base;
    line-height: v.$line-height-base;
    color: map.get(v.$text, headings);
  }
}

.custom-input {
  padding: 0;
  border-right: 1px solid map.get(v.$gray, lighten2);

  // V2 `.v-select--is-menu-active` is `.v-select--active-menu` in V4.
  &.v-select--active-menu {
    .v-field__prepend-inner .v-icon {
      color: map.get(v.$primary, base);
    }

    .v-field__append-inner .v-icon {
      transform: rotate(180deg);
      transform-origin: center;
      color: map.get(v.$primary, base);
    }
  }

  :deep(.v-field__input) {
    min-height: 56px;
    max-height: 56px;
    padding-top: 0;
    padding-bottom: 0;
  }

  :deep(.v-field__prepend-inner),
  :deep(.v-field__append-inner) {
    margin-top: 0;
    align-items: center;
    padding-top: 0;
  }

  :deep(.v-field__field) {
    align-items: center;
  }

  // The hint is the input placeholder (always shown), so it sits on the input line with the search icon.
  :deep(.v-field-label) {
    display: none;
  }

  // V4 hides the placeholder of an inactive field (`.v-text-field .v-field:not(.v-field--active) input::placeholder`).
  :deep(.v-field input) {
    opacity: 1;
  }

  :deep(.v-field input::placeholder) {
    opacity: 1;
    color: map.get(v.$gray, lighten1);
    font-weight: v.$font-weight-normal;
  }

  :deep(.v-field) {
    border-radius: 0;
    box-shadow: none;
    background: transparent;
  }
}
</style>
