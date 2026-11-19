<template>
  <ReadMoreModal
    :description="description"
    :frame="itemStatus"
    :model-value="modelValue && item !== null"
    :show-activate="!isNew && item?.status === 'inactive'"
    :show-install="isNew"
    :show-update="!isNew && updateAvailable"
    :status="chip"
    :title="title"
    title-html
    @action-activate="activate"
    @action-install="install"
    @action-update="update"
    @update:model-value="emit('update:model-value', $event)"
  >
    <template #title-prepend>
      <v-avatar
        v-if="pluginIcon"
        class="mr-2"
        height="48px"
        width="48px"
      >
        <v-img
          height="48px"
          :src="pluginIcon"
          width="48px"
        />
      </v-avatar>

      <v-icon
        v-else
        class="mr-4"
        color="primary"
        icon="$pluginIcon"
        size="24"
      />
    </template>
  </ReadMoreModal>
</template>

<script lang="ts" setup>
  // The overlay and the body scroll lock are the `v-dialog` of Vuetify 4
  // (`lockBodyScroll` of legacy is not needed). The legacy click on an action waited 100 ms before it emitted and reset the modal; here
  // the action is emitted at once and the dialog closes behind it.
  // The card is the kit `ReadMoreModal`; this file maps the plugin onto it and fills the icon slot.
  import type { InstalledPlugin, RepositoryPlugin } from '@/entities/project/instance-plugins.api'
  import { computed } from 'vue'
  import ReadMoreModal from '@/views/projects/project/ui/ReadMoreModal.vue'

  type ReadMoreItem = InstalledPlugin | RepositoryPlugin

  const props = withDefaults(defineProps<{
    item: ReadMoreItem | null
    // A number rating marks the catalogue plugins of Add New. They show Install instead of the status chip and actions.
    isNew?: boolean
    modelValue: boolean
  }>(), {
    isNew: false,
  })

  const emit = defineEmits<{
    'update:model-value': [value: boolean]
    'install-item': [item: ReadMoreItem]
    'action-button-activate': [item: InstalledPlugin]
    'action-button-update': [item: InstalledPlugin]
  }>()

  const title = computed(() => {
    if (!props.item) {
      return ''
    }
    return ('title' in props.item && props.item.title) || props.item.name
  })

  // The description, else the short one: the catalogue entries of Add New only carry the short one.
  const description = computed((): string => {
    if (!props.item) {
      return ''
    }
    return String(props.item.description || ('short_description' in props.item ? props.item.short_description : '') || '')
  })

  const updateAvailable = computed(() => Boolean(props.item && 'update' in props.item && props.item.update === 'available'))

  // A green card for an active plugin, red when it has an update, grey otherwise.
  const itemStatus = computed((): 'gray' | 'red' | 'green' => {
    if (props.item?.status !== 'active') {
      return 'gray'
    }
    return updateAvailable.value ? 'red' : 'green'
  })

  // The Active / Disabled chip of an installed plugin; a catalogue plugin has none.
  const chip = computed((): 'active' | 'disabled' | undefined => {
    if (props.isNew || !props.item) {
      return undefined
    }
    return props.item.status === 'active' ? 'active' : 'disabled'
  })

  // The svg, else the 1x icon of the catalogue entry; the installed plugins have none.
  const pluginIcon = computed(() => {
    if (!props.item || !('icons' in props.item)) {
      return ''
    }
    const icons = (props.item as RepositoryPlugin).icons
    return icons?.svg || icons?.['1x'] || ''
  })

  function close (): void {
    emit('update:model-value', false)
  }

  // The action buttons only exist for an installed plugin (`!isNew`), so the item is the installed shape here.
  function activate (): void {
    if (props.item) {
      emit('action-button-activate', props.item as InstalledPlugin)
    }
    close()
  }

  function update (): void {
    if (props.item) {
      emit('action-button-update', props.item as InstalledPlugin)
    }
    close()
  }

  // The catalogue plugin goes to the install dialog and the Read more closes, as legacy and the theme.
  function install (): void {
    if (props.item) {
      emit('install-item', props.item)
    }
    close()
  }
</script>

<style lang="scss" scoped>
// The plugin icon of the Read more card (slot `title-prepend` of the kit `ReadMoreModal`); the card itself is styled by `ReadMoreModal.vue`.
// `!important` removed: the global styles have no rule for `.v-avatar` (`_general.scss` has none), and this scoped rule (0,2,0)
// has no rival. Legacy had `!important`; values 1:1.
.v-avatar {
  border-color: var(--v-gray-lighten2);
  border-style: solid;
  border-width: 1px;
}
</style>
