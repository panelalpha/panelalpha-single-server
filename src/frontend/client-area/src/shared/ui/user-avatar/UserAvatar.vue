<template>
  <div>
    <v-avatar
      class="user-avatar"
      :min-width="size"
      :size="size"
    >
      <v-img
        :height="size"
        :src="avatarUrl(email, size)"
        :width="size"
      />
    </v-avatar>

    <v-badge
      bordered
      class="user-dot-badge"
      :color="badge"
      dot
      location="bottom"
      :model-value="Boolean(badge)"
    />
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { avatarUrl } from './avatar-url'

  const props = withDefaults(defineProps<{
    size?: number
    email: string
    badge?: string
  }>(), {
    size: 48,
    badge: '',
  })

  // Colour of the dot border; exposed to SCSS through `v-bind` (no inline style in the template).
  const badgeColor = computed(() => (props.badge ? `rgb(var(--v-theme-${props.badge}))` : ''))
</script>

<style lang="scss" scoped>
// Legacy scoped `border-color: var(--v-gray-lighten2) !important` loses to V2 `.v-application .white { border-color }`
// (same specificity, later), so the computed border is white in both themes. `color="white"` is replaced by explicit
// declarations because the V4 colour prop also forces a black text colour, while V2 inherited the button's.
.v-avatar {
  background-color: var(--v-white-base);
  border-color: var(--v-white-base) !important;
  border-style: solid !important;
  border-width: 1px !important;
  box-shadow: none;
  color: inherit;
}

.user-dot-badge {
  position: absolute;
  // V4 anchors the dot to the (empty) badge root differently from V2: 7px lower and 3px further left than the V2 `bottom: 12px; right: 45px`.
  bottom: 5px;
  right: 42px;

  // The root of v-badge is .v-badge itself, so the modifier sits on the same element.
  &.v-badge--dot :deep(.v-badge__badge) {
    width: 10px;
    height: 10px;
    // V2 palette class (`.warning`): `border-color` repeats the background, text is white in both themes, 4.5px radius, 700 weight.
    border-color: v-bind(badgeColor);
    border-radius: 4.5px;
    color: var(--v-white-base);
    font-weight: 700;

    &:after {
      border-width: 1px;
    }
  }
}
</style>
