<template>
  <div
    class="drop-zone"
    :class="zoneClasses"
    @click="open"
    @dragenter.prevent="onDragEnter"
    @dragleave.prevent="onDragLeave"
    @dragover.prevent="onDragOver"
    @drop.prevent="onDrop"
  >
    <input
      ref="fileInput"
      :accept="accept"
      class="d-none"
      :data-testid="inputTestid"
      :multiple="multiple"
      type="file"
      @change="onPicked"
      @click.stop
    >

    <v-progress-circular
      v-if="reading && !filled"
      class="mb-2"
      color="primary"
      indeterminate
      size="32"
      width="3"
    />

    <template v-else-if="!filled">
      <v-icon
        class="mb-2"
        :color="active ? 'primary' : 'gray'"
        icon="$filetext"
        size="32"
      />

      <p class="drop-zone__title p-2 font-weight-medium mb-1">
        {{ title }}
      </p>

      <p class="drop-zone__hint caption text-gray-darken-1 mb-0 text-center">
        {{ hint }}
      </p>
    </template>

    <template v-else>
      <div
        class="selection-list"
        @click.stop
      >
        <div
          v-for="item in items"
          :key="item.id"
          class="d-flex align-center"
          :class="multiple ? 'selection-list__item' : 'drop-zone__file'"
        >
          <v-icon
            class="mr-2"
            color="gray"
            :icon="item.icon ?? '$filetext'"
            size="18"
          />

          <span
            class="p-2 flex-grow-1 text-truncate"
            :data-testid="labelTestid"
          >{{ item.label }}</span>

          <AppButton
            :aria-label="removeLabel"
            :data-testid="removeTestid"
            :disabled="removeDisabled"
            kind="icon"
            @click.stop="emit('remove', item.id)"
          >
            <v-icon
              color="gray"
              icon="$close"
              size="18"
            />
          </AppButton>
        </div>
      </div>

      <button
        v-if="addMoreLabel"
        class="drop-zone__add-more caption"
        :disabled="disabled"
        type="button"
        @click.stop="open"
      >
        <v-progress-circular
          v-if="reading"
          class="mr-2"
          color="primary"
          indeterminate
          size="14"
          width="2"
        />

        {{ addMoreLabel }}
      </button>
    </template>
  </div>
</template>

<script lang="ts" setup>
  // Kit drop zone: the dashed area that takes files by drag and drop or by the hidden picker. From the three
  // copies in `UploadArchiveWidget`, `FilesUploadVersionModal` and `OnboardingDeployFromZipModal`; one look
  // for all of them, props only for functions. The file rules (type, size, limit, alert, folders) stay with the consumer, which gets the
  // files through `files`: a pick gives `transfer = null`, a drop gives the `DataTransfer` (read it in the handler, its items are empty later).
  // The input sits inside the zone with `@click.stop`, so its programmatic `click()` does not reach the zone again. No i18n: copy comes in props.
  import type { DropZoneItem } from './drop-zone'
  import { computed, ref, useTemplateRef } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { dragLeaveDepth, dropZoneClasses, filesOf } from './drop-zone'

  const props = withDefaults(defineProps<{
    accept: string
    title: string
    hint: string
    multiple?: boolean
    disabled?: boolean
    reading?: boolean
    items?: DropZoneItem[]
    removeDisabled?: boolean
    addMoreLabel?: string
    /** Name of the `×` of a chosen file; the kit has no i18n, so the consumer passes the translated `button.remove`. */
    removeLabel?: string
    inputTestid?: string
    labelTestid?: string
    removeTestid?: string
  }>(), {
    multiple: false,
    disabled: false,
    reading: false,
    items: () => [],
    removeDisabled: false,
    addMoreLabel: undefined,
    removeLabel: undefined,
    inputTestid: undefined,
    labelTestid: undefined,
    removeTestid: undefined,
  })

  const emit = defineEmits<{
    files: [files: File[], transfer: DataTransfer | null]
    remove: [id: string]
  }>()

  const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
  const active = ref(false)
  const dragDepth = ref(0)

  const filled = computed(() => props.items.length > 0)
  const zoneClasses = computed(() => dropZoneClasses({
    active: active.value,
    disabled: props.disabled,
    reading: props.reading,
    filled: filled.value,
  }))

  function open (): void {
    if (props.disabled) {
      return
    }
    fileInput.value?.click()
  }

  function onPicked (event: Event): void {
    const input = event.target as HTMLInputElement
    const files = filesOf(input.files)
    input.value = ''
    if (files.length > 0) {
      emit('files', files, null)
    }
  }

  function onDragEnter (): void {
    if (props.disabled) {
      return
    }
    dragDepth.value += 1
    active.value = true
  }

  function onDragOver (): void {
    if (props.disabled) {
      return
    }
    active.value = true
  }

  function onDragLeave (): void {
    dragDepth.value = dragLeaveDepth(dragDepth.value)
    if (dragDepth.value === 0) {
      active.value = false
    }
  }

  function onDrop (event: DragEvent): void {
    dragDepth.value = 0
    active.value = false
    const transfer = event.dataTransfer
    if (props.disabled || !transfer) {
      return
    }
    emit('files', filesOf(transfer.files), transfer)
  }

  defineExpose({ open })
</script>

<style lang="scss" scoped>
// One look for every drop zone: the sheet of `UploadArchiveWidget` and `FilesUploadVersionModal`, plus
// the parts only the onboarding zip step has (`--disabled`, `--reading`, the list of many files, add-more). No background (two of three
// copies; onboarding was white). The hint uses the global V2 `.caption` (`src/app/styles/legacy/_fonts.scss`).
.drop-zone {
  border: 2px dashed var(--v-gray-lighten2);
  border-radius: 8px;
  padding: 32px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;

  &--active {
    border-color: rgb(var(--v-theme-primary));
    background-color: var(--v-primary-lighten5);
  }

  &--disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  &--reading {
    cursor: wait;
  }

  &--filled {
    align-items: stretch;
    justify-content: flex-start;
    padding: 8px 12px;
  }

  &__title {
    text-align: center;
  }

  &__add-more {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    margin-top: 8px;
    padding: 8px 0 4px;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--v-gray-darken1);
    font: inherit;
    text-align: center;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  }
}

.selection-list {
  max-height: 160px;
  overflow-y: auto;
  width: 100%;
  cursor: default;
}

// One row look for one file (`drop-zone__file`) and many (`selection-list__item`): no padding, a line between rows.
.drop-zone__file,
.selection-list__item {
  border-bottom: 1px solid var(--v-gray-lighten4);

  &:last-child {
    border-bottom: none;
  }
}
</style>
