<template>
  <div
    id="languageSwitcher"
    class="language-container"
  >
    <v-menu
      v-model="isOpen"
      attach="#languageSwitcher"
      close-delay="150"
      :close-on-content-click="false"
      content-class="language-menu-overlay"
      :content-props="{ 'data-testid': 'language-menu' }"
      location="top start"
      min-width="273"
      offset="0"
      open-delay="150"
    >
      <template #activator="{ props: menuProps }">
        <button
          v-bind="menuProps"
          class="language-activator d-flex align-center"
          data-testid="language-activator"
          type="button"
        >
          <span
            v-if="isLogin"
            class="mr-2"
          >{{ t('general.language') }}:</span>

          <img
            v-if="selectedFlagUrl"
            alt=""
            class="language-flag mr-2"
            height="15"
            :src="selectedFlagUrl"
            width="21"
          >

          <span :class="isLogin ? 'language-activator__label--login' : ''">
            {{ languageLabel(selectedCode) }}
          </span>

          <v-icon
            icon="$chevrondown"
            size="12"
          />
        </button>
      </template>

      <div class="language-dropdown">
        <div>
          <v-text-field
            v-model="search"
            class="language-dropdown__search"
            density="compact"
            hide-details
            placeholder="Search"
            variant="outlined"
          >
            <template #prepend-inner>
              <v-icon
                color="gray-darken-1"
                icon="$search"
                size="20"
              />
            </template>
          </v-text-field>
        </div>

        <v-list
          class="language-dropdown__list my-0 pt-2"
          density="compact"
        >
          <v-list-item
            v-for="code in filteredLanguages"
            :key="code"
            :class="{ 'v-list-item--active': code === selectedCode }"
            @click="selectLanguage(code)"
          >
            <div class="language-dropdown__item d-flex align-center w-100">
              <img
                v-if="flagUrl(code)"
                alt=""
                class="language-flag mr-3"
                height="15"
                :src="flagUrl(code)!"
                width="21"
              >

              <span class="language-dropdown__item-label">{{ languageLabel(code) }}</span>

              <v-icon
                v-if="code === selectedCode"
                class="language-dropdown__check ml-auto"
                color="primary"
                icon="$check"
                size="18"
              />
            </div>
          </v-list-item>

          <v-list-item v-if="filteredLanguages.length === 0">
            <span>{{ t('message.emptyTable.noRecords') }}</span>
          </v-list-item>
        </v-list>
      </div>
    </v-menu>

    <div
      v-if="errors.length > 0"
      class="language-errors"
      data-testid="language-errors"
    >
      <p
        v-for="(msg, index) in errors"
        :key="index"
      >
        {{ msg }}
      </p>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import i18next from 'i18next'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import { isApiError } from '@/shared/api/error-message'
  import { resolveBootLanguage } from '@/shared/session/resolve-boot-language'
  import { putUserLanguage } from '@/shared/session/session.api'
  import { useSessionStore } from '@/shared/session/session.store'
  import { applyLanguage } from './apply-language'

  const props = withDefaults(defineProps<{ isLogin?: boolean }>(), {
    isLogin: false,
  })

  // Only a successful `PUT /user/language` on a signed-in switcher counts as a change; the footer relays it to the App remount.
  const emit = defineEmits<{ 'language-changed': [] }>()

  const { t } = useTranslation()
  const session = useSessionStore()

  const isOpen = ref(false)
  const search = ref('')
  const selectedCode = ref('en')
  const errors = ref<string[]>([])

  const isLogin = computed(() => props.isLogin)

  const languages = computed(() => {
    const fromHome = session.home?.app?.languages
    return Array.isArray(fromHome) && fromHome.length > 0 ? fromHome.map(String) : ['en']
  })

  const languageFlags = computed(() => session.home?.app?.language_flags ?? {})

  const filteredLanguages = computed(() => {
    const q = search.value.trim().toLowerCase()
    if (!q) {
      return languages.value
    }
    return languages.value.filter(code => {
      const label = languageLabel(code).toLowerCase()
      return label.includes(q) || code.toLowerCase().includes(q)
    })
  })

  const selectedFlagUrl = computed(() => flagUrl(selectedCode.value))

  function flagUrl (code: string): string | null {
    const flag = languageFlags.value[code]
    if (!flag) {
      return null
    }
    return `/assets/img/flags/${flag}.png`
  }

  function languageLabel (code: string): string {
    return t(`form.option.languages.${code}`)
  }

  function extractLaravelErrors (error: unknown): string[] {
    if (!isApiError(error) || !error.response) {
      return []
    }
    const data = error.response.data as {
      message?: string
      errors?: Record<string, string[]> | string[]
    }
    const bag = data.errors
    if (bag) {
      const lists = Array.isArray(bag) ? bag : Object.values(bag)
      return lists.flat().map(String)
    }
    if (data.message) {
      return [data.message]
    }
    return []
  }

  async function selectLanguage (code: string) {
    selectedCode.value = code
    isOpen.value = false
    search.value = ''
    errors.value = []
    await applyLanguage(code)

    if (props.isLogin || !session.user) {
      return
    }

    try {
      await putUserLanguage(code)
      if (session.home?.user) {
        session.home.user.language = code
      }
      emit('language-changed')
    } catch (error) {
      // Keep the new language; surface the Laravel body (errors.* else message).
      errors.value = extractLaravelErrors(error)
    }
  }

  onMounted(() => {
    // When home is set, boot rule wins over stale client-area-language.
    // Use localStorage only before ensureHome (login/register).
    const initial = session.home
      ? resolveBootLanguage(session.home)
      : (localStorage.getItem('client-area-language') || i18next.language || 'en')
    selectedCode.value = initial
    if (initial !== i18next.language) {
      void (async () => {
        localStorage.setItem('client-area-language', initial)
        await i18next.changeLanguage(initial)
      })()
    }
  })

  defineExpose({ selectLanguage, errors, selectedCode })
</script>

<style lang="scss">
.language-container {
  position: relative;

  /*
   * Legacy attached the menu to `#languageSwitcher` and pinned it with CSS (bottom: 100%).
   * V4 still teleports into an overlay-container child; force absolute
   * overlay + bottom pin so the open menu sits flush above the activator.
   */
  .v-overlay.v-menu {
    position: absolute;
    inset: 0 0 auto 0;
    width: 100%;
    height: 0;
    overflow: visible;
    /* V2 menu content z-index is 8 (measured); V4 overlays are 2000 and would cover the mobile FAB (z-index 99), which legacy draws above the menu. */
    z-index: 8 !important;
  }

  /* Legacy `left` menu: the menu's right edge sits on the container's right edge. */
  .language-menu-overlay {
    top: unset !important;
    bottom: 100% !important;
    left: unset !important;
    right: 0 !important;
    transform: none !important;
  }

  /* Legacy menu content inherited the container colour; the global overlay colour rule is for detached menus. */
  .v-menu > .v-overlay__content.language-menu-overlay {
    color: inherit;
  }
}

.language-activator {
  background: transparent;
  border: 0;
  cursor: pointer;
  color: inherit;
  font: inherit;
  padding: 0;

  &__label--login {
    color: rgb(var(--v-theme-primary));
  }

  /* Legacy: open activator + chevron use primary */
  &[aria-expanded='true'] {
    color: rgb(var(--v-theme-primary));

    .v-icon {
      color: rgb(var(--v-theme-primary));
    }
  }
}

.language-flag {
  object-fit: cover;
  flex-shrink: 0;
}

.language-errors {
  margin-top: 8px;
  color: rgb(var(--v-theme-error));
  font-size: 12px;
}

/* Menu radius, background and shadow come from the global dropdown styles. */
.language-menu-overlay {
  /* V4 connected strategy can shrink minWidth to activator width on axis=y */
  /* No forced min-height: few langs give a content-sized menu (~273x108 with 1 lang + search) */
  min-width: 273px !important;
  width: 273px;
  overflow: hidden;
}

/* Legacy search slot padding is 0 20px !important (the global field padding is 12px). The global `.v-input .v-input__control .v-field:not()`
   rule has the weight of five selectors, so this one adds the `.language-dropdown` ancestor to win. */
.language-dropdown .language-dropdown__search.v-input .v-input__control .v-field.v-field--variant-outlined {
  padding-inline: 20px;
}

.language-dropdown {
  background: rgb(var(--v-theme-tooltip));
  min-width: 273px;
  display: flex;
  flex-direction: column;

  &__search {
    flex-shrink: 0;

    .v-field {
      border-radius: 0;
      box-shadow: none;
      background: transparent;
      border-bottom: 1px solid rgb(var(--v-theme-gray-lighten-2));
    }

    /* Legacy: only bottom border (fieldset sides/top unset) */
    .v-field__outline {
      display: none;
    }

    .v-field--focused,
    .v-field:hover {
      border-bottom-color: rgb(var(--v-theme-gray-lighten-2));
    }

    .v-icon {
      opacity: 1;
    }
  }

  &__list {
    flex: 1 1 auto;
    max-height: 328px;
    overflow-y: auto;
    background-color: rgb(var(--v-theme-tooltip));
    padding-inline: 0;
  }

  &__item-label {
    color: rgb(var(--v-theme-text-darken-1));
    transition: color 0.24s ease;
  }

  .v-list-item {
    /* V2 list items have no border; V4 paints `solid` + width 0 in the theme border colour. */
    border-style: none;
    border-color: currentColor;
    min-height: 44px;
    padding: 0 20px;
    border-radius: 0;

    /* Kill V4 active/hover tonal overlay; legacy uses primary-darken title hover */
    .v-list-item__overlay {
      opacity: 0;
    }

    &:hover {
      .language-dropdown__item-label,
      .v-icon {
        color: rgb(var(--v-theme-primary-darken-1));
      }

      .v-list-item__overlay {
        opacity: 0.05;
        background: rgb(var(--v-theme-primary));
      }
    }

    &--active {
      .language-dropdown__item-label {
        color: inherit;
      }
    }
  }
}
</style>
