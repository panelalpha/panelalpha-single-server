<template>
  <v-card
    class="d-flex"
    :class="cardClass"
    data-testid="auth-card"
    elevation="4"
  >
    <v-card-text
      v-if="centered"
      class="d-flex justify-center align-center flex-column flex-grow-1 pb-0"
    >
      <slot name="media" />

      <v-card-title class="d-flex justify-center">
        <component
          :is="titleTag"
          :class="titleClass"
          data-testid="auth-title"
        >
          {{ title }}
        </component>
      </v-card-title>

      <slot />
    </v-card-text>

    <template v-else>
      <v-card-title class="d-flex justify-center">
        <component
          :is="titleTag"
          :class="titleClass"
          data-testid="auth-title"
        >
          {{ title }}
        </component>
      </v-card-title>

      <v-card-text :class="{ 'pb-8': Boolean($slots.bottom) }">
        <slot />
      </v-card-text>

      <div
        v-if="$slots.bottom"
        class="login-bottom-box p-d text--base"
        :class="{ 'login-bottom-box--register': stackBottom }"
        data-testid="auth-bottom-box"
      >
        <slot name="bottom" />
      </div>
    </template>
  </v-card>
</template>

<script lang="ts" setup>
  // Card of the session screens: Login, Register, Verify Email, Forgot / Reset Password,
  // Accept Invite, Hub Login. One look for every screen: elevation 4, centred title, 48px under the text (32px above the
  // bottom box). Props only for functions: heading level, the 600px form card, the waiting card, the stacked bottom box.
  import { computed } from 'vue'

  const props = withDefaults(defineProps<{
    title: string
    titleTag?: 'h1' | 'h2' | 'h5'
    wide?: boolean
    centered?: boolean
    stackBottom?: boolean
  }>(), {
    titleTag: 'h1',
    wide: false,
    centered: false,
    stackBottom: false,
  })

  const cardClass = computed(() => ({
    'v-card--mwidth-600px': props.wide,
    'v-card--minheight-508px': props.centered,
  }))

  // The h5 titles are 22px (`auth-card-title--h5` in `auth-screen.scss`).
  const titleClass = computed(() => [
    'font-weight-800',
    'text-center',
    ...(props.titleTag === 'h5' ? ['auth-card-title--h5'] : []),
  ])
</script>

<style lang="scss" scoped src="@/shared/ui/auth-frame/auth-screen.scss"></style>
