<template>
  <v-col
    class="sticky-sidebar"
    :class="[mobile ? 'pb-4 pt-4 px-0' : 'pt-8']"
    cols="12"
    lg="2"
    md="3"
  >
    <div
      class="flex flex-column align-start"
      style="height: 100%"
    >
      <v-list
        v-if="!mobile"
        class="pt-0 sticky-sidebar__item"
      >
        <AppButton
          id="#switch"
          ref="switch"
          block
          class="mt-0 pt-0 back-btn"
          color="gray"
          data-testid="tags-sidebar-back"
          elevation="0"
          size="large"
          variant="outlined"
          @click="emit('go-back')"
        >
          <v-icon
            color="gray-darken-1"
            icon="$arrowleft"
            size="16px"
          />
          {{ backLabel ?? t('button.dashboard.back') }}
        </AppButton>

        <div class="d-flex flex-row flex-md-column justify-start">
          <v-list-item
            v-for="(item, index) in defaultThemeCategories"
            :key="`${item.value}-${index}`"
            :active="isActive(item)"
            :ripple="false"
            @click="select(item)"
          >
            <v-list-item-title>{{ t(`heading.onboarding.chooseTheme.${item.text}`) }}</v-list-item-title>
          </v-list-item>

          <v-divider v-if="recommendedThemes" />

          <v-list-item
            v-if="recommendedThemes"
            :active="isActive(recommendedCategory)"
            :ripple="false"
            @click="select(recommendedCategory)"
          >
            <v-list-item-title>{{ t('general.recommended') }}</v-list-item-title>
          </v-list-item>

          <v-list-item
            v-for="(item, index) in groups"
            :key="index"
            :active="item.type !== 'divider' && isActive(item)"
            :disabled="item.type === 'divider'"
            :ripple="false"
            @click="select(item)"
          >
            <v-divider v-if="item.type === 'divider'" />
            <v-list-item-title v-else>{{ item.name }}</v-list-item-title>

            <template
              v-if="typeof item.count === 'number'"
              #append
            >
              <span class="tags-sidebar__count">{{ item.count }}</span>
            </template>
          </v-list-item>
        </div>
      </v-list>

      <!-- Legacy `v-tabs center-active` on mobile; the mount hook centres the selected tab. -->
      <v-tabs
        v-else
        center-active
        :model-value="activeKey"
        next-icon="$chevronright"
        prev-icon="$chevronleft"
        @vue:mounted="centerActiveTabOnMount"
      >
        <v-tab
          v-for="item in defaultThemeCategories"
          :key="tabKey(item)"
          class="p-5 px-3"
          :ripple="false"
          :value="tabKey(item)"
          @click="select(item)"
        >
          {{ t(`heading.onboarding.chooseTheme.${item.text}`) }}
        </v-tab>

        <v-tab
          v-for="item in groups"
          :key="tabKey(item)"
          class="p-5 px-3"
          :ripple="false"
          :value="tabKey(item)"
          @click="select(item)"
        >
          <v-divider v-if="item.type === 'divider'" />
          <span v-else>{{ item.name }}</span>

          <small
            v-if="typeof item.count === 'number'"
            class="tags-sidebar__count mx-2"
          >{{ item.count }}</small>
        </v-tab>
      </v-tabs>
    </div>
  </v-col>
</template>

<script lang="ts" setup>
  // `v-list-item-group` is a plain
  // `v-list-item` with `active`; the group value is the `group` prop, compared by `sameCategory`.
  import type { TemplateCategory } from './template-model'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { centerActiveTabOnMount } from '@/shared/ui/tabs/center-active-tab'
  import { sameCategory } from './template-model'

  const props = withDefaults(defineProps<{
    groups?: TemplateCategory[]
    group: TemplateCategory
    defaultThemeCategories?: TemplateCategory[]
    recommendedThemes?: boolean
    /** The Back button's label; "Back To Dashboard" (the theme chooser) without it. */
    backLabel?: string
  }>(), {
    groups: () => [],
    defaultThemeCategories: () => [],
    recommendedThemes: false,
    backLabel: undefined,
  })

  const emit = defineEmits<{
    'go-back': []
    'update:group': [category: TemplateCategory]
  }>()

  const { t } = useTranslation()
  const { mobile } = useDisplay()

  // The entry shown when the plan has recommended themes.
  const recommendedCategory: TemplateCategory = {
    text: t('general.recommended'),
    value: 'recommended',
    type: 'recommended',
  }

  function tabKey (item: TemplateCategory): string {
    return item.type === 'divider' ? `divider-${item.order}` : `${item.type ?? 'category'}-${item.value ?? item.id}`
  }

  const activeKey = computed(() => tabKey(props.group))

  function isActive (item: TemplateCategory): boolean {
    return sameCategory(item, props.group)
  }

  // An empty value is ignored; dividers are disabled, so they never get here from the list.
  function select (item: TemplateCategory): void {
    if (item && item.type !== 'divider') {
      emit('update:group', item)
    }
  }
</script>

<style lang="scss" scoped>
  @use '@/app/styles/legacy/tokens/variables' as v;

  .v-subheader {
    align-content: flex-start;
    height: 30px;
    color: var(--v-gray-lighten1);
  }

  .v-item-group {
    margin-bottom: 24px;
  }

  .v-list {
    .v-list-item {
      padding-left: 0;
      transition: padding-left 0.3s ease;

      @media (max-width: 975px) {
        box-shadow: none;
      }

      &--disabled {
        display: none;
      }

      .v-list-item__content {
        position: relative;
        z-index: 1;
      }

      .v-list-item-title {
        font-weight: v.$font-weight-semibold;
        color: var(--v-text-base);
        transition: color 0.24s ease, font-weight 0.24s ease;
      }

      &:hover {
        padding-left: 12px;
        color: var(--v-primary-base);

        .v-list-item-title {
          color: var(--v-primary-base);
        }
      }

      &--active {
        padding-left: 12px;
        border-radius: 4px;

        .v-list-item-title {
          font-weight: v.$font-weight-bold;
          color: var(--v-primary-darken1);
        }
      }
    }

    @media (max-width: 975px) {
      .v-list-item {
        padding: 0 12px 0 12px;
        text-align: center;
        min-width: unset;
      }
    }
  }

  .back-btn {
    max-width: 300px;
  }

  // How many items a category has (a category that sends `count`, the PanelAlpha Go catalog).
  .tags-sidebar__count {
    font-size: v.$font-size-xs;
    font-weight: v.$font-weight-normal;
    color: var(--v-gray-darken1);
  }

  .sticky-sidebar {
    position: relative;
  }

  .sticky-sidebar__item {
    position: sticky;
    padding-left: 0;
    top: 24px;
    left: 0;
    background: unset;
  }

  .v-tabs {
    padding: 8px 0;

    .v-tab {
      position: relative;
      overflow: visible;
      padding: 0 16px;
      border-radius: 4px;
      box-shadow: none;
      transition: opacity 0.3s ease;
      margin-left: 4px;
      margin-right: 4px;
      background: transparent;

      span {
        font-size: v.$font-size-base;
        line-height: v.$line-height-base;
        color: var(--v-text-base);
        font-weight: v.$font-weight-semibold;
      }

      &:not(:first-child) {
        margin-left: 0;
      }

      &--selected {
        span {
          color: var(--v-primary-darken1);
          font-weight: v.$font-weight-bold;
        }
      }
    }
  }
</style>
