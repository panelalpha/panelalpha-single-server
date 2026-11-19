<template>
  <AppSwitch
    v-model="modelValue"
    class="dark-mode-switch v-input--switch mt-0 pt-0 text-primary"
    kind="toggle"
  >
    <template #thumb>
      <v-icon
        v-show="!modelValue"
        class="dark-mode-icon--sun"
        color="gray-darken-1"
        size="13"
      >
        $sun
      </v-icon>

      <v-icon
        v-show="modelValue"
        class="dark-mode-icon--moon"
        color="primary"
        size="13"
      >
        $moon
      </v-icon>
    </template>
  </AppSwitch>
</template>

<script lang="ts" setup>
  import AppSwitch from '@/shared/ui/buttons/AppSwitch.vue'

  // Dark-mode switch with `$sun` / `$moon` thumb icons, used in the user menu and in the style drawer. Two consumers, so it lives in the shared kit.
  // The mode itself is applied by the host (`changeDarkMode` in the navbar, `changeDarkModeSelection` in the drawer): this component
  // only holds the value. Host attributes (`class`, `data-testid`) fall through to the single `v-switch` root.
  const modelValue = defineModel<boolean>({ default: false })
</script>
