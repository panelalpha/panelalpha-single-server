<template>
  <v-menu
    :model-value="open"
    :target="targetPoint"
    @update:model-value="onUpdate"
  >
    <v-list
      class="fm-context-menu"
      data-testid="fm-context-menu"
      role="menu"
      tabindex="-1"
    >
      <template
        v-for="(group, index) in groups"
        :key="index"
      >
        <v-divider v-if="index > 0" />

        <v-list-item
          v-for="item in group"
          :key="item.name"
          :base-color="item.danger ? 'error' : undefined"
          class="fm-context-menu__item"
          :data-testid="`fm-context-menu-${item.name}`"
          role="menuitem"
          tabindex="0"
          @click="onSelect(item.name)"
        >
          <template #prepend>
            <v-icon
              :color="item.danger ? 'error' : undefined"
              :icon="item.icon"
              size="18"
            />
          </template>

          <v-list-item-title>{{ t(item.label) }}</v-list-item-title>
        </v-list-item>
      </template>
    </v-list>
  </v-menu>
</template>

<script lang="ts" setup>
  // The groups come from `menuItems`.
  // The menu only reports the chosen action; the screen runs it and owns the modals. It opens at the pointer and closes after a choice.
  import type { FmDirectory, FmFile } from '@/views/hosting/file-manager/file-manager.types'
  import type { FmMenuAction } from '@/views/hosting/file-manager/fm-context-menu'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import { menuItems } from '@/views/hosting/file-manager/fm-context-menu'

  const props = defineProps<{
    /** The item under the pointer, or null for the empty area. */
    target: FmDirectory | FmFile | null
    /** Viewport coordinates of the pointer; null closes the menu. */
    position: { x: number, y: number } | null
  }>()

  const emit = defineEmits<{
    select: [action: FmMenuAction]
    close: []
  }>()

  const { t } = useTranslation()
  const store = useFileManagerStore()

  const groups = computed(() => menuItems(props.target, store.selectedItems, store.clipboard, store.config))

  // A menu without items does not open (legacy showed only the groups that had an item).
  const open = computed(() => props.position !== null && groups.value.length > 0)

  const targetPoint = computed<[number, number] | undefined>(() => (props.position ? [props.position.x, props.position.y] : undefined))

  /** The screen runs the action and clears `position`, which closes the menu. */
  function onSelect (action: FmMenuAction): void {
    emit('select', action)
  }

  function onUpdate (value: boolean): void {
    if (!value) {
      emit('close')
    }
  }
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

.fm-context-menu {
  min-width: 180px;
  padding: 4px 0;
  border-radius: 5px;
  background-color: rgb(var(--v-theme-surface));
  box-shadow: v.$box-shadow-elevation-4;
}

.fm-context-menu :deep(.v-divider) {
  margin: 4px 0;
  border-color: var(--v-gray-lighten2);
  opacity: 1;
}

.fm-context-menu__item {
  min-height: 36px;
  white-space: nowrap;
}

.fm-context-menu__item:hover,
.fm-context-menu__item:focus-visible {
  background-color: var(--v-row-hover);
}

.fm-context-menu__item :deep(.v-list-item__prepend > .v-icon) {
  margin-inline-end: 24px;
}

// The menu is teleported out of `.fm-root`, so its 18 px icons scale here (see `fm-icon-fill` in `FileManager.vue`).
.fm-context-menu__item :deep(.v-list-item__prepend > .v-icon > svg),
.fm-context-menu__item :deep(.v-list-item__prepend > .v-icon > div),
.fm-context-menu__item :deep(.v-list-item__prepend > .v-icon > div > svg) {
  width: 100%;
  height: 100%;
}
</style>
