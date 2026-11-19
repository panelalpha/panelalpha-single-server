<template>
  <v-switch v-bind="defaults">
    <template
      v-for="(_, name) in $slots"
      #[name]="slotProps"
    >
      <slot
        :name="name"
        v-bind="slotProps ?? {}"
      />
    </template>
  </v-switch>
</template>

<script lang="ts" setup>
  import type { AppSwitchKind } from './app-switch'
  import { computed, useAttrs } from 'vue'
  import { appSwitchDefaults } from './app-switch'

  // The one switch of the app, with one look per `kind` (style below). It declares no `modelValue`, `disabled` or `loading`: they fall through to the
  // `v-switch`, so a `:model-value` without `@update:model-value` keeps the V4 behaviour it has on a bare `v-switch`.
  const props = defineProps<{
    kind?: AppSwitchKind
  }>()

  const attrs = useAttrs()
  const defaults = computed(() => appSwitchDefaults(props.kind, Object.keys(attrs)))
</script>

<style lang="scss" scoped>
// One look per `kind` for every consumer. Selected by the Vuetify `v-switch--inset` class, so the
// rendered DOM stays the DOM of a bare `v-switch`; `:where()` keeps the toggle rule below the `ButtonSwitch` container rules (40px row).

// Track and thumb of every kind: V2 `generic/_switch.scss` moves the 45x28 track 3px towards the line start and
// the 20px thumb from 0-20px (off) to 19-39px (on, `translate(19px)`) of the 45px box, so it sits 3px inside the track in both states. V4 instead
// moves the thumb box 10px either side of the box centre (22.5px), which put the on thumb 0.5px past the track end. The values below are the V2
// thumb centres (10px, 29px) minus that centre; RTL mirrors them like legacy.
.v-input.v-switch {
  --app-switch-dir: 1;
  --app-switch-thumb-off: -12.5px;
  --app-switch-thumb-on: 6.5px;

  :deep(.v-switch__track) {
    position: relative;
    left: calc(-3px * var(--app-switch-dir));
  }

  :deep(.v-selection-control__input) {
    transform: translateX(calc(var(--app-switch-thumb-off) * var(--app-switch-dir)));
  }

  :deep(.v-selection-control--dirty .v-selection-control__input) {
    transform: translateX(calc(var(--app-switch-thumb-on) * var(--app-switch-dir)));
  }
}

// `i18n.ts` sets `dir` on `<html>`, so `:dir()` also covers switches in teleported dialogs.
.v-input.v-switch:dir(rtl) {
  --app-switch-dir: -1;
}

// `toggle`: V2 `.v-input--switch .v-input__slot { min-height: unset }`, the row is the 28px track, not the V4 46px row. Was in `DarkModeSwitch.vue`,
// `StyleManagerMenu.vue` (allow mode 28px, Disable Shadows 48px) and `UserInfoDropdown.vue` (`min-height: 0`).
.v-input.v-switch:where(:not(.v-switch--inset)) {
  --v-input-control-height: 28px;

  :deep(.v-selection-control) {
    min-height: 28px;
  }
}

// `inset`: V2 `.v-input--switch` geometry (was `GitView.vue`, the most complete port; Onboarding Git, Backup store and `BasicModalField` had their own
// variants): 4px top padding, a 48px slot and a 20px thumb in both states (V4 `inset` shrinks the off thumb to 2/3); track and thumb position are
// the shared rule above. `_switch.scss` already sets 45x28. V2 `color="primary"` paints the root (`primary--text`) only while the switch is on.
.v-input.v-switch.v-switch--inset {
  padding-top: 4px;

  &:has(.v-selection-control--dirty) {
    color: rgb(var(--v-theme-primary));
  }

  :deep(.v-selection-control) {
    min-height: 48px;
  }

  :deep(.v-switch__track) {
    min-width: 45px;
    width: 45px;
    padding: 0 3px;
  }

  :deep(.v-switch__thumb) {
    width: 20px;
    height: 20px;
    transform: none;
  }
}
</style>
