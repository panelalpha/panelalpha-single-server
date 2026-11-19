<template>
  <v-chip
    v-if="colors"
    class="user-role-label"
    size="small"
    :style="{ backgroundColor: background, borderColor: background }"
    variant="flat"
  >
    <span
      class="p-3"
      :style="{ color: text }"
    >
      {{ role }}
    </span>
  </v-chip>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { useTheme } from 'vuetify'

  type RoleColors = { bg: string, text: string, darkBg: string, darkText: string }

  const props = defineProps<{
    role?: string
  }>()

  // V2 `--v-sand-lighten5` / `--v-sand-darken2` are the V4 theme colours (`sand-lighten-5`, `sand-darken-2`).
  const roles: Record<string, RoleColors> = {
    administrator: {
      bg: 'rgb(var(--v-theme-sand-lighten-5))',
      text: 'rgb(var(--v-theme-sand-darken-2))',
      darkBg: 'var(--v-role1-bg)',
      darkText: 'var(--v-role1-text)',
    },
    author: {
      bg: 'var(--v-role-author-light-bg)',
      text: 'var(--v-primary-base)',
      darkBg: 'var(--v-role2-bg)',
      darkText: 'var(--v-role2-text)',
    },
    contributor: {
      bg: 'var(--v-role-contributor-light-bg)',
      text: 'var(--v-role3-text)',
      darkBg: 'var(--v-role3-bg)',
      darkText: 'var(--v-role3-text)',
    },
    editor: {
      bg: 'var(--v-role-editor-light-bg)',
      text: 'var(--v-warning-base)',
      darkBg: 'var(--v-role4-bg)',
      darkText: 'var(--v-role4-text)',
    },
    subscriber: {
      bg: 'var(--v-role-subscriber-light-bg)',
      text: 'var(--v-info-base)',
      darkBg: 'var(--v-role5-bg)',
      darkText: 'var(--v-role5-text)',
    },
    default: {
      bg: 'var(--v-gray-lighten5)',
      text: 'var(--v-gray-darken1)',
      darkBg: 'var(--v-gray-lighten5)',
      darkText: 'var(--v-gray-darken1)',
    },
  }

  const theme = useTheme()

  // Legacy threw on an unknown role (`this.roles[this.role]` is undefined); the kit renders nothing.
  const colors = computed(() => (
    props.role !== undefined && Object.hasOwn(roles, props.role) ? roles[props.role] : undefined
  ))
  const background = computed(() => (theme.current.value.dark ? colors.value?.darkBg : colors.value?.bg))
  const text = computed(() => (theme.current.value.dark ? colors.value?.darkText : colors.value?.text))
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// V2 `::before { display: none }` (the chip state overlay) is the V4 `.v-chip__overlay` / `.v-chip__underlay`.
.v-chip {
  font-weight: v.$font-weight-bold;

  // V2 `v-chip small`: 24px high, 12px side padding and a 12px radius (V4 small is 26px, 10px, pill); measured on the Users table.
  &.user-role-label {
    height: 24px;
    padding: 0 12px;
    border-radius: 12px;
  }

  :deep(.v-chip__overlay),
  :deep(.v-chip__underlay) {
    display: none;
  }
}

// V2 chip text colour in light: `--v-text-default` is 87% black; dark keeps the colour the chip had.
.v-theme--light .v-chip.user-role-label {
  color: var(--v-text-default);
}
</style>
