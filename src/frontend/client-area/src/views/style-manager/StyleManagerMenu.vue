<template>
  <v-navigation-drawer
    v-model="open"
    class="style-drawer"
    :class="[open ? 'style-drawer--open' : '']"
    data-testid="style-manager-drawer"
    location="end"
    :scrim="false"
    temporary
    :width="280"
  >
    <!-- The directive sits on a plain element: `v-navigation-drawer` has a fragment root, directives do not work on it. -->
    <div
      v-click-outside="{ handler: closeOnClickOutside, closeConditional: () => open, include: outsideIncludes }"
      class="style-drawer__scroll"
    >
      <div class="style-drawer__content d-flex flex-column justify-start pb-6">
        <h4 class="font-weight-light">
          {{ t('heading.styleManager.title') }}
        </h4>

        <div class="style-drawer__items-container">
          <div class="style-drawer__item mb-6">
            <h5 class="p-2 mb-4 mt-6 font-weight-bold">
              {{ t('heading.styleManager.darkMode.title') }}
            </h5>

            <div class="d-flex flex-column">
              <div class="d-flex align-center">
                <DarkModeSwitch
                  class="mr-3"
                  data-testid="style-manager-dark-mode"
                  :model-value="Boolean(themeStore.style.darkMode)"
                  @update:model-value="changeDarkModeSelection(Boolean($event))"
                />

                <p class="p-3 mb-0">
                  {{ t('heading.styleManager.darkMode.description') }}
                </p>
              </div>

              <div class="d-flex align-center mt-4">
                <AppSwitch
                  class="v-input--switch mt-0 pt-0 mr-3 text-primary"
                  data-testid="style-manager-allow-mode"
                  kind="toggle"
                  :model-value="Boolean(themeStore.style.allowToChangeMode)"
                  @update:model-value="allowUserSelectMode(Boolean($event))"
                />

                <p class="p-3 mb-0">
                  {{ t('heading.styleManager.darkMode.allow') }}
                </p>
              </div>
            </div>
          </div>

          <div class="style-drawer__item mb-6">
            <h5 class="p-2 mb-4 mt-6 font-weight-bold">
              {{ t('heading.styleManager.logo.title') }}
            </h5>

            <StyleManagerChangeLogo
              :dark-logo="themeStore.darkLogo"
              :light-logo="themeStore.lightLogo"
              @update:dark-logo-data="changeDarkLogo"
              @update:light-logo-data="changeLightLogo"
            />
          </div>

          <div class="style-drawer__item mb-6">
            <h5 class="p-2 mb-4 mt-6 font-weight-bold">
              {{ t('heading.styleManager.favicon.title') }}
            </h5>

            <StyleManagerChangeFavicon
              :favicon-data="themeStore.favicon"
              @update:favicon-data="changeFaviconData"
            />
          </div>

          <div class="style-drawer__item mb-6">
            <h5 class="p-2 mb-4 mt-6 font-weight-bold">
              {{ t('heading.styleManager.colorScheme.title') }}
            </h5>

            <StyleManagerColorGroupPicker
              :selected-colors="themeStore.colors.primary"
              @update:selected-colors="changeSelectedColorsTheme"
            />
          </div>

          <div class="style-drawer__item mb-6">
            <h5 class="p-2 mb-4 mt-6 font-weight-bold">
              {{ t('heading.styleManager.primaryColor.title') }}
            </h5>

            <StyleManagerGroupEditor
              :selected-colors="themeStore.colors.primary"
              @update:selected-colors="changeSelectedColorsTheme"
            />
          </div>

          <div
            v-if="Object.keys(themeStore.style).length > 0"
            class="style-drawer__item mb-6"
          >
            <h5 class="p-2 mb-4 mt-6 font-weight-bold">
              {{ t('heading.styleManager.additionalSettings.title') }}
            </h5>

            <div class="d-flex flex-column">
              <div class="d-flex align-center">
                <AppSwitch
                  class="my-0 py-0 mr-4"
                  data-testid="style-manager-disable-shadows"
                  kind="toggle"
                  :model-value="Boolean(themeStore.style.disableShadows)"
                  @update:model-value="changeShadowStyleSelection(Boolean($event))"
                />

                <p class="p-3 mb-0">
                  {{ t('heading.styleManager.additionalSettings.disableShadows.title') }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="d-flex flex-column mt-auto">
          <AppButton
            class="mb-2"
            data-testid="style-manager-save"
            kind="primary"
            :loading="submitting"
            size="large"
            @click="saveColorsTheme"
          >
            {{ t('button.saveChanges') }}
          </AppButton>

          <AppButton
            class="style-drawer__restore"
            data-testid="style-manager-restore"
            elevation="0"
            size="large"
            variant="flat"
            @click="restoreDefault"
          >
            {{ t('button.restoreDefault') }}
          </AppButton>
        </div>
      </div>
    </div>
  </v-navigation-drawer>

  <!--
    Legacy kept the tab inside the drawer (`left: -96px`). The closed V4 drawer is `inert` and translated off-screen, so the
    tab is a separate fixed element that follows the drawer edge instead.
  -->
  <div
    v-if="showActivator && !reseller"
    v-ripple
    :aria-expanded="open"
    :aria-label="activatorLabel"
    class="style-drawer__activator"
    :class="{ 'style-drawer__activator--open': open }"
    data-testid="style-manager-activator"
    role="button"
    tabindex="0"
    @click="open = !open"
    @keydown.enter.prevent="open = !open"
    @keydown.space.prevent="open = !open"
  >
    <div class="style-drawer__activator-content">
      <div class="style-drawer__activator-icon">
        <v-icon
          color="primary"
          size="24"
        >
          $sliders
        </v-icon>
      </div>

      <h6 class="p-5 style-drawer__activator-title">
        {{ activatorLabel }}
      </h6>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import type { BrandColors, BrandLogo } from '@/shared/theme/brand-theme'
  // Frame, activator, opening, mode and shadow switches, palette and primary editor, logos and favicon, Save and Restore Default.
  import { useTranslation } from 'i18next-vue'
  import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { ClickOutside as vClickOutside } from 'vuetify/directives'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { applyBodyDarkClasses, setStoredDarkMode } from '@/shared/browser/dark-mode'
  import { useAppEvent } from '@/shared/events/app-events'
  import { isDemoMode } from '@/shared/session/demo-mode'
  import { useSessionStore } from '@/shared/session/session.store'
  import { syncStyleManagerFlag } from '@/shared/session/style-manager-flag'
  import { STORED_THEME_KEY } from '@/shared/theme/brand-theme'
  import { useThemeStore } from '@/shared/theme/theme.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import AppSwitch from '@/shared/ui/buttons/AppSwitch.vue'
  import DarkModeSwitch from '@/shared/ui/dark-mode-switch/DarkModeSwitch.vue'
  import { buildThemePayload, defaultTheme, initialActivatorState, resolveSaveTarget, shouldOpenOnRoute } from './style-manager-rules'
  import { putResellerBranding, putUserappBranding } from './style-manager.api'
  import StyleManagerChangeFavicon from './StyleManagerChangeFavicon.vue'
  import StyleManagerChangeLogo from './StyleManagerChangeLogo.vue'
  import StyleManagerColorGroupPicker from './StyleManagerColorGroupPicker.vue'
  import StyleManagerGroupEditor from './StyleManagerGroupEditor.vue'

  const props = withDefaults(defineProps<{
    reseller?: boolean
  }>(), {
    reseller: false,
  })

  const { t } = useTranslation()
  const router = useRouter()
  const route = useRoute()
  const themeStore = useThemeStore()
  const sessionStore = useSessionStore()
  const alerts = useAlertsStore()

  const open = ref(false)
  const showActivator = ref(false)
  const submitting = ref(false)

  // Legacy commits the whole drawer state; here the store already holds it, so only
  // the changed `style` / `colors` are written and the logos and favicon are passed through (the store resets them to `false` otherwise).
  function commitStyle (
    style: typeof themeStore.style,
    colors?: BrandColors,
    images: { logo?: BrandLogo, darkLogo?: BrandLogo, favicon?: BrandLogo } = {},
  ) {
    themeStore.changeColorsTheme({
      colors,
      style,
      logo: images.logo === undefined ? themeStore.lightLogo : images.logo,
      darkLogo: images.darkLogo === undefined ? themeStore.darkLogo : images.darkLogo,
      favicon: images.favicon === undefined ? themeStore.favicon : images.favicon,
    })
  }

  // The component emits the new data URL
  // (`null` after Remove) and the whole state is committed at once (live logo in the navbar and favicon).
  function changeLightLogo (data: string | null) {
    commitStyle(themeStore.style, undefined, { logo: data })
  }

  function changeDarkLogo (data: string | null) {
    commitStyle(themeStore.style, undefined, { darkLogo: data })
  }

  function changeFaviconData (data: string | null) {
    commitStyle(themeStore.style, undefined, { favicon: data })
  }

  // `localStorage.isDarkMode` is written before the body and fm classes switch. The Vuetify theme follows
  // `style.darkMode` through `useThemeSync`. Unlike the user menu, this does not call `PUT /user/dark-mode` (legacy neither).
  function changeDarkModeSelection (dark: boolean) {
    setStoredDarkMode(dark)
    applyBodyDarkClasses(dark)
    themeStore.setDarkMode(dark)
  }

  function allowUserSelectMode (allow: boolean) {
    commitStyle({ ...themeStore.style, allowToChangeMode: allow })
  }

  // Legacy bound `v-model` and toggled in `@change`, flipping twice; one write of the new value here.
  function changeShadowStyleSelection (disable: boolean) {
    commitStyle({ ...themeStore.style, disableShadows: disable })
  }

  // A group pick or a single edited shade commits at once (live preview).
  function changeSelectedColorsTheme (colors: BrandColors) {
    commitStyle(themeStore.style, colors)
  }

  // Commit, `localStorage.theme` and `isDarkMode`, then the PUT for the role.
  // Without an endpoint (no `home.admin`, e.g. the demo) only `localStorage` is written and `submitting` is not set.
  async function saveColorsTheme () {
    if (submitting.value) {
      return
    }
    const payload = buildThemePayload(themeStore)
    themeStore.changeColorsTheme(payload)

    try {
      localStorage.setItem(STORED_THEME_KEY, JSON.stringify(payload))
      localStorage.setItem('isDarkMode', themeStore.style.darkMode ? 'true' : 'false')
    } catch {
      // storage unavailable
    }

    const target = resolveSaveTarget(props.reseller, sessionStore.home)
    if (!target) {
      return
    }
    submitting.value = true
    try {
      await (target === 'reseller' ? putResellerBranding(payload) : putUserappBranding(payload))
      alerts.addAlert({ success: true, successMessage: t('notification.style.update.success') })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }

  // `default_theme` (or the built-in one), dark from its style, fm iframe light, then Save.
  // `home.app.default_theme` is copied, never mutated.
  async function restoreDefault () {
    const theme = defaultTheme(sessionStore.home)
    themeStore.changeColorsTheme(theme)
    const dark = Boolean(themeStore.style.darkMode)
    applyBodyDarkClasses(dark)
    await saveColorsTheme()
  }

  const activatorLabel = computed(() => (props.reseller ? t('button.customizeResellerTheme') : t('button.customize')))

  useAppEvent('style-manager-open', () => {
    open.value = true
  })
  useAppEvent('style-manager-close', () => {
    open.value = false
  })
  useAppEvent('style-manager-activator-show', () => {
    showActivator.value = true
  })
  useAppEvent('style-manager-activator-hide', () => {
    showActivator.value = false
  })

  // V2 `temporary` closed the drawer on a click outside it; V4 without a scrim does not. The tab and the overlays of the
  // drawer's own menus (colour picker, teleported out of the drawer) count as inside (V2 `getOpenDependentElements`).
  const activatorEl = () => document.querySelector('.style-drawer__activator')
  function outsideIncludes (): HTMLElement[] {
    const overlays = [...document.querySelectorAll<HTMLElement>('.v-overlay-container > .v-overlay')]
    const activator = activatorEl()
    return activator ? [activator as HTMLElement, ...overlays] : overlays
  }
  function closeOnClickOutside () {
    open.value = false
  }

  // `src/main.ts` mounts without waiting for the first navigation, so
  // the initial state is read after `router.isReady()`, and so are the route watchers: the first navigation (`?branding`
  // for a reseller) must not open the drawer through them.
  const scope = getCurrentScope()
  let openTimer: ReturnType<typeof setTimeout> | undefined
  onScopeDispose(() => clearTimeout(openTimer))

  // `isReady()` rejects when the first navigation fails (a lazy chunk that is gone after a deploy; `chunk-reload.ts` reloads the tab):
  // the drawer still reads its state then, instead of leaving an unhandled rejection and a drawer that never initialises.
  void router.isReady().catch(() => undefined).then(() => {
    if (!scope?.active) {
      return
    }
    const brandingQuery = route.query.branding
    let storage: Storage | null = null
    try {
      storage = localStorage
    } catch {
      // storage unavailable
    }
    const origin = window.location.origin
    const state = initialActivatorState({
      role: props.reseller ? 'reseller' : 'admin',
      brandingQuery,
      storedFlag: storage?.getItem(`${origin}-style-manager`),
    })
    if (state.showActivator) {
      showActivator.value = true
    }
    if (state.openAfterMs !== null) {
      openTimer = setTimeout(() => {
        showActivator.value = true
        open.value = true
        if (state.writeFlag && storage) {
          try {
            syncStyleManagerFlag(storage, origin, brandingQuery)
          } catch {
            // storage unavailable
          }
        }
      }, state.openAfterMs)
    }

    // `flush: 'post'`: the V4 drawer closes itself on every route change (V2 did it only when it was active); the watcher
    // has to run after that, or `?branding` set by a navigation would be closed again in the same tick.
    scope.run(() => {
      watch(() => route.name, name => {
        if (shouldOpenOnRoute({ routeName: name, demoMode: isDemoMode() })) {
          open.value = true
        }
      }, { flush: 'post' })
      watch(() => route.query, query => {
        if (query.branding) {
          open.value = true
        }
      }, { flush: 'post' })
    })
  })
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// `fixed right` -> `location="end"` (V4 mirrors it in RTL on
// its own, so the legacy `.v-navigation-drawer--right/--close/--open` RTL overrides are dropped). The V4 layout item carries an inline `z-index`.
.style-drawer {
  visibility: visible;
  overflow: visible !important;
  z-index: 1010 !important;
  // V2 `fixed` drawer sat at the viewport top; V4 `temporary` starts under the app bar (visible in the mobile full-page screenshot).
  top: 0 !important;
  height: 100% !important;
  box-shadow: none !important;
  // V4 `location="end"` draws a 1px inline border that the V2 `fixed right` drawer did not have.
  border-width: 0;
  // V2 drawer inherited the `.v-application` text colour; V4 `v-navigation-drawer` sets `on-surface`.
  color: var(--v-text-base);
  background: var(--v-white-base);
  transition-property: transform, visibility, width, margin;

  &::before {
    content: "";
    position: absolute;
    width: 100%;
    min-height: 100%;
    z-index: -10;
    left: 0;
    top: 0;
    box-shadow: var(--v-style-drawer-shadow);
    opacity: 0;
    transition: opacity 0.24s ease;
  }

  &--open {
    &::before {
      opacity: 1;
    }
  }

  // Mobile full-page screenshot: legacy drawer edge sits on the viewport edge, V4's 2px further right. Desktop keeps the V4 position
  // (the same shift shows a 2px strip there).
  @media (max-width: map.get(v.$grid-breakpoints, md)) {
    &:not(.style-drawer--open) {
      right: 2px !important;
    }
  }

  &__content {
    padding: 32px;

    min-height: 100%;
  }

  &__items-container {
    min-height: 100%;
  }

  &.v-navigation-drawer :deep(.v-navigation-drawer__content) {
    overflow: visible !important;
    background: var(--v-panel-base);

    .style-drawer__scroll {
      overflow-y: auto !important;
      max-height: 100%;

      &::-webkit-scrollbar {
        width: 14px;
      }

      &::-webkit-scrollbar-track {
        box-shadow: none;
        background-color: transparent;
        max-width: 8px;
        border: 3px solid transparent;
      }

      &::-webkit-scrollbar-thumb {
        background-color: var(--v-gray-lighten2);
        border-radius: 8px;
        border: 4px solid transparent;
        background-clip: padding-box;
      }
    }
  }

  // V2 `color="primary--text text--darken-1"` was an `!important` text colour class.
  // Legacy inline `background-color` on the restore button (`primary-lighten4`). The class (0,2,0 with the scoped attribute)
  // outranks the Vuetify flat-variant fill; no `!important` here.
  &__restore {
    background-color: var(--v-primary-lighten4);
    color: var(--v-primary-darken1) !important;
  }

  // Legacy: absolute in the drawer at `top: 208px; left: -96px` (98px wide, hanging 2px under the drawer edge), `z-index: -1`.
  // Here: fixed to the viewport edge the drawer slides from. Closed: the drawer edge is the viewport edge. Open: 280px in.
  // Legacy hover on the closed tab moved the drawer (and the tab) 16px in (`margin-right: 16px`).
  &__activator {
    background: var(--v-panel-base);
    cursor: pointer;
    width: 98px;
    height: 98px;
    position: fixed;
    top: 208px;
    right: -2px;
    border-radius: 8px 0px 0px 8px;
    padding: 8px 20px 18px 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1009;
    box-shadow: v.$box-shadow-elevation-8;
    transition: right 0.2s cubic-bezier(0.4, 0, 0.2, 1);

    &:hover {
      right: 14px;
    }

    &--open,
    &--open:hover {
      right: 278px;
    }

    &-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    &-icon {
      min-height: 46px;
      width: 46px;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    &-title {
      color: map.get(v.$text, headings);
      font-weight: v.$font-weight-semibold;
      line-height: 14px;
    }
  }
}

.v-application--is-rtl {
  .style-drawer {
    &__activator {
      right: unset;
      left: -2px;
      border-radius: 0px 8px 8px 0px;

      &:hover {
        left: 14px;
      }

      &--open,
      &--open:hover {
        left: 278px;
      }
    }
  }
}

p {
  color: var(--v-gray-darken1);
}
</style>
