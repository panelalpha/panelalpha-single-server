<template>
  <v-menu
    v-model="menuOpen"
    :close-delay="150"
    content-class="quick-actions-menu"
    :content-props="{ 'data-testid': `${testId}-menu` }"
    location="bottom start"
    :offset="[0, 16]"
    :open-delay="150"
    origin="top start"
  >
    <template #activator="{ props: activatorProps }">
      <AppButton
        v-bind="activatorProps"
        :aria-label="label"
        :data-testid="`${testId}-button`"
        :disabled="disabled"
        kind="page-add"
        :loading="loading"
        :size="smAndDown ? undefined : 'large'"
      >
        <v-icon
          v-if="icon && !smAndDown"
          class="mr-2"
          :icon="icon"
          size="20"
        />

        <template v-if="!smAndDown">
          <span class="quick-actions-label">{{ label }}</span>

          <v-icon
            class="quick-actions-chevron ml-2 me-0"
            icon="$chevrondown"
            size="24"
          />
        </template>

        <template v-else-if="mobileIcon">
          <v-icon
            class="me-0 quick-actions-mobile-icon"
            color="white"
            :icon="`$${mobileIcon}`"
            size="20"
          />
        </template>
      </AppButton>
    </template>

    <v-list class="elevation-0">
      <v-list-item
        v-for="item in actions"
        :key="item.id"
        class="mx-2"
        :class="hoverClass(item.color)"
        :data-testid="`${testId}-item`"
        @click="onItemClick(item.id)"
      >
        <template #prepend>
          <v-icon
            class="quick-actions-item-icon"
            :class="hoverClass(item.color)"
            :icon="item.icon"
            :size="item.iconSize ?? 32"
          />
        </template>

        <v-list-item-title>{{ item.title }}</v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script lang="ts" setup>
  // A menu button in the title bar. Used by the SFTP page and
  // the Containers tab of a project, so it lives in the shared buttons kit. The activator button is `AppButton` `kind="page-add"`. The legacy `hideCustomizeOption` and per-item `link` are never set and not ported.
  import { ref } from 'vue'
  import { useDisplay } from 'vuetify'
  import AppButton from './AppButton.vue'

  interface QuickAction {
    id: string
    title: string
    icon: string
    iconSize?: string
    /** Colour name of the hover state (`<color>-on-hover` class); `sand` maps to `sand-on-hover`. */
    color?: string
  }

  withDefaults(defineProps<{
    actions: QuickAction[]
    label: string
    /** Icon on the desktop button before the label; `false` shows none. */
    icon?: string | false
    /** Name without the `$` of the icon that replaces the button on small screens. */
    mobileIcon?: string
    /** Loading state of the button. */
    loading?: boolean
    disabled?: boolean
    /** Prefix of the test ids: `<testId>-button`, `<testId>-menu`, `<testId>-item`. */
    testId?: string
  }>(), {
    icon: false,
    loading: false,
    disabled: false,
    testId: 'quick-actions',
  })

  function hoverClass (color?: string): string | undefined {
    if (!color) return undefined
    return color === 'sand' ? 'sand-on-hover' : `${color}-on-hover`
  }

  const emit = defineEmits<{
    select: [id: string]
  }>()

  // Legacy `v-menu` closes on a content click (`close-on-content-click` is on by default in V2); the controlled menu does the same.
  const menuOpen = ref(false)

  function onItemClick (id: string): void {
    menuOpen.value = false
    emit('select', id)
  }

  const { smAndDown } = useDisplay()
</script>

<style lang="scss">
// The menu is teleported, so it is styled unscoped. Legacy sets the 292px width on the menu itself (`min-width` and `max-width`).
// `!important` stays on purpose: V4 places the teleported overlay with inline styles, so only `!important` wins over them
// (lessons.md, `menu-tooltip`; mapping doc, ui-sftp). Specificity 0,4,0 is kept so the rule beats a V4 menu rule of the same layer.
.v-menu.v-menu > .v-overlay__content.quick-actions-menu {
  min-width: 292px !important;
  max-width: 292px !important;
  color: var(--v-text-base);
}

// Legacy list item: no border, no vertical padding, 52px high (V4 adds a 1px border and 4px padding, and a 48px item).
// The menu content is teleported, so the rule is unscoped under the content class.
.v-menu > .v-overlay__content.quick-actions-menu .v-list-item {
  border: 0;
  padding-top: 0;
  padding-bottom: 0;
  min-height: 52px;
}

// Legacy item icon had an inline `min-width: unset` (V4 `v-icon` gets a min-width from the prepend slot); moved here from the template.
// V4 list prepend icons take 0.6 opacity by default; the legacy icon is fully opaque (measured on containers-actions-menu).
.v-menu > .v-overlay__content.quick-actions-menu .quick-actions-item-icon {
  min-width: unset;
  opacity: 1;
}

// The chevron and the mobile icon take the label colour of the primary button from the global rule in `_buttons.scss`
// (`.v-btn :is(.v-btn__content, …) .v-icon { color: inherit }`), so no colour is set here.
</style>

<style lang="scss" scoped>
// Legacy label and chevron were aligned with an inline `vertical-align: middle` (moved from the template).
.quick-actions-label,
.quick-actions-chevron {
  vertical-align: middle;
}
</style>
