<template>
  <!-- Social block of the session screens: `or-divider` + the provider buttons.
       `modifier="register"` is the register markup (`v-row` of `v-col`s, 24px gutter, `p-sm` label); the default is the login
       markup (plain wrapper, `p-d` label). The optional default slot is the hub button, which only login shows, placed first. -->
  <!-- Login: divider above the buttons; register: buttons above the divider. -->
  <div
    v-if="!register"
    class="or-divider mt-4 mb-4"
    data-testid="auth-or-divider"
  >
    <div>{{ dividerText }}</div>
  </div>

  <v-row
    v-if="register"
    class="social-login-btns social-login-btns--register row--small"
  >
    <v-col
      v-for="provider in providers"
      :key="provider"
      class="social-login-btn-col"
      cols="12"
      :sm="providers.length === 1 ? undefined : 6"
    >
      <AppButton
        block
        class="social-login-btn"
        :data-testid="`auth-social-${provider}`"
        kind="secondary"
        :loading="loading"
        size="large"
        @click.prevent="emit('select', provider)"
      >
        <v-icon
          :class="`social-icon-${provider}`"
          :icon="`$${provider}`"
          size="24"
        />

        <span class="text--gray-darken2 font-weight-400 p-sm">
          {{ t(labelKey) }}
          {{ providerLabel(provider) }}
        </span>
      </AppButton>
    </v-col>
  </v-row>

  <div
    v-if="register"
    class="or-divider mt-6 mb-6"
    data-testid="auth-or-divider"
  >
    <div>{{ dividerText }}</div>
  </div>

  <div
    v-else
    class="social-login-btns"
  >
    <slot />

    <AppButton
      v-for="provider in providers"
      :key="provider"
      block
      class="social-login-btn"
      :data-testid="`auth-social-${provider}`"
      kind="secondary"
      :loading="loading"
      size="large"
      @click.prevent="emit('select', provider)"
    >
      <v-icon
        :class="`social-icon-${provider}`"
        :icon="`$${provider}`"
        size="24"
      />

      <span class="text--gray-darken2 font-weight-400 p-d">
        {{ t(labelKey) }}
        {{ providerLabel(provider) }}
      </span>
    </AppButton>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  const props = withDefaults(defineProps<{
    providers: string[]
    loading?: boolean
    labelKey?: string
    dividerText: string
    modifier?: 'register'
  }>(), {
    loading: false,
    labelKey: 'heading.registerPage.signInWith',
    modifier: undefined,
  })

  const emit = defineEmits<{
    select: [provider: string]
  }>()

  const { t } = useTranslation()

  const register = computed(() => props.modifier === 'register')

  /** Capitalised provider key, shown after the "sign in with" label. */
  function providerLabel (provider: string): string {
    if (!provider) {
      return ''
    }
    return provider.charAt(0).toUpperCase() + provider.slice(1)
  }
</script>

<style lang="scss" scoped>
  @use 'sass:map';
  @use '@/app/styles/legacy/tokens/variables' as v;

  // The social block is a multi-root component, so the scoped rules of the host screen (`auth-screen.scss`) never reach it:
  // its own rules live here (ported 1:1 from legacy; they were in `auth-screen.scss` before).
  .social-login-btns {
    .social-login-btn {
      &:not(:first-child) {
        margin-top: 16px;
      }
    }
  }

  .or-divider {
    position: relative;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;

    > div {
      text-align: center;
      height: 100%;
      background: var(--v-panel-base);
      z-index: 2;
      padding: 0 8px;
    }

    &:before {
      content: '';
      background: var(--v-gray-lighten2);
      height: 1px;
      position: absolute;
      top: 11px;
      left: 0;
      right: 0;
    }
  }

  @media (max-width: map.get(v.$grid-breakpoints, sm)) {
    .social-login-btns {
      &.social-login-btns--register {
        // V2 stacked columns had no row gap (12px column padding + 4px `padding-top` = 16px between buttons); the V4 row
        // adds a 24px `row-gap` on top of the 4px, so the gap is 12px here (12 + 4 = 16).
        row-gap: 12px;

        .social-login-btn-col {
          &:not(:first-child) {
            padding-top: 4px;
          }
        }
      }
    }
  }
</style>
