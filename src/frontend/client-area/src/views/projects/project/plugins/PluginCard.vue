<template>
  <div
    class="data-iterator-card"
    :class="[
      checked ? 'data-iterator-card--selected' : '',
      variant.green ? 'data-iterator-card--green' : '',
      variant.red ? 'data-iterator-card--red' : '',
    ]"
  >
    <div class="data-iterator-card__checkbox-container">
      <Checkbox
        :model-value="checked"
        @update:model-value="emit('checked', $event)"
      />
    </div>

    <v-card elevation="4">
      <v-card-title class="d-flex justify-space-between align-center flex-nowrap">
        <h5
          v-safe-html:external="item.title"
          class="item-title"
        />

        <v-tooltip
          location="bottom"
          :offset="4"
          open-delay="150"
          transition="custom-tooltip"
          z-index="99"
        >
          <template #activator="{ props: activatorProps }">
            <div
              class="ml-auto"
              v-bind="activatorProps"
            >
              <v-icon
                v-if="variant.updateAvailable"
                color="error"
                icon="$alertwarning"
                size="16"
              />

              <v-icon
                v-else
                :color="item.status === 'active' ? 'primary' : 'gray-darken-1'"
                icon="$checkcircle"
                size="16"
              />
            </div>
          </template>

          <span class="text-gray-darken-2">
            <span v-if="variant.updateAvailable">{{ t('tooltip.instance.plugin.update.available') }}</span>
            <span v-else>{{ t('tooltip.instance.plugin.update.current') }}</span>
          </span>
        </v-tooltip>
      </v-card-title>

      <v-card-text class="p-3">
        <span
          v-safe-html:external="description.text"
          class="truncate"
        />

        <a
          v-if="description.hasReadMore"
          class="truncate-text"
          @click="emit('action-button-read-more', item)"
        >
          <span class="text-gray-darken-2 font-weight-regular">...&nbsp;</span>
          {{ t('button.readMore') }}
        </a>
      </v-card-text>

      <v-card-actions class="pt-2 px-4">
        <div
          v-if="asyncState === 'installing'"
          class="d-flex w-100 justify-space-between"
        >
          <BaseIconButton
            icon="$update"
            loading
            :text="t('button.installing')"
          />
        </div>

        <div
          v-else-if="asyncState === 'updating'"
          class="d-flex w-100 justify-space-between"
        >
          <BaseIconButton
            icon="$update"
            loading
            :text="t('button.updating')"
          />
        </div>

        <div
          v-else
          class="d-flex w-100 justify-space-between"
        >
          <div class="d-flex">
            <v-tooltip
              v-if="item.status === 'inactive'"
              location="bottom"
              open-delay="150"
              transition="custom-tooltip"
            >
              <template #activator="{ props: activatorProps }">
                <div v-bind="activatorProps">
                  <BaseIconButton
                    :disabled="item.activation_disabled"
                    icon="$checkcircle"
                    :text="t('button.activate')"
                    @click="emit('action-button-activate', item)"
                  />
                </div>
              </template>

              <span
                v-if="item.activation_disabled"
                class="base--text"
              >{{ t('tooltip.instance.plugin.activationIsNotAllowed') }}</span>

              <span
                v-else
                class="base--text"
              >{{ t('button.plugin.activate') }}</span>
            </v-tooltip>

            <v-tooltip
              v-else
              location="bottom"
              open-delay="150"
              transition="custom-tooltip"
            >
              <template #activator="{ props: activatorProps }">
                <div v-bind="activatorProps">
                  <BaseIconButton
                    icon="$xcircle"
                    :text="t('button.disable')"
                    @click="emit('action-button-deactivate', item)"
                  />
                </div>
              </template>

              <span class="base--text">{{ t('button.plugin.deactivate') }}</span>
            </v-tooltip>

            <v-tooltip
              v-if="item.update === 'available'"
              location="bottom"
              open-delay="150"
              transition="custom-tooltip"
            >
              <template #activator="{ props: activatorProps }">
                <div v-bind="activatorProps">
                  <BaseIconButton
                    color="error"
                    icon="$update"
                    :text="t('button.update')"
                    @click="emit('action-button-update', item)"
                  />
                </div>
              </template>

              <span class="base--text">{{ t('button.plugin.update') }}</span>
            </v-tooltip>
          </div>

          <v-tooltip
            location="bottom"
            open-delay="150"
            transition="custom-tooltip"
          >
            <template #activator="{ props: activatorProps }">
              <div v-bind="activatorProps">
                <BaseIconButton
                  icon="$thrash"
                  :text="t('button.remove')"
                  @click="emit('action-button-delete', item)"
                />
              </div>
            </template>

            <span class="base--text">{{ t('button.plugin.delete') }}</span>
          </v-tooltip>
        </div>
      </v-card-actions>
    </v-card>
  </div>
</template>

<script lang="ts" setup>
  import type { InstalledPlugin } from '@/entities/project/instance-plugins.api'
  import type { ItemAsyncState } from '@/entities/project/wordpress-items'
  // Colours are in `plugin-card.ts`, the description cut in
  // `@/entities/project/wordpress-items`; the async state (installing / updating) comes from the page.
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { cardDescription } from '@/entities/project/wordpress-items'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import BaseIconButton from '@/shared/ui/buttons/BaseIconButton.vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import { pluginCardVariant } from './plugin-card'

  const props = defineProps<{
    item: InstalledPlugin
    checked?: boolean
    asyncState?: ItemAsyncState
  }>()

  const emit = defineEmits<{
    'checked': [value: boolean]
    'action-button-activate': [item: InstalledPlugin]
    'action-button-deactivate': [item: InstalledPlugin]
    'action-button-update': [item: InstalledPlugin]
    'action-button-delete': [item: InstalledPlugin]
    'action-button-read-more': [item: InstalledPlugin]
  }>()

  const { t } = useTranslation()

  const variant = computed(() => pluginCardVariant(props.item))
  const description = computed(() => cardDescription(props.item.description))
</script>

<style lang="scss" scoped>
// The V2 `$font-weight-bold` is 700; `--v-primary-base`, `--v-error-base` and
// `--v-info-base` become the theme channels as elsewhere in next. The RTL block is `[dir='rtl']`.
.data-iterator-card {
  .v-card {
    border: 0px solid;
    border-top: 6px solid;
    border-color: var(--v-gray-lighten2);
    border-radius: 8px;

    .v-card-text {
      position: relative;
      padding-bottom: 24px;
      margin-bottom: -24px;
      // V2 `.v-card__text` line-height is 20px; global `.v-card-text` (`_card.scss`) sets 22px, which made the card 226 px high instead of 220 px.
      line-height: 1.25rem;
    }

    .v-card-title {
      padding-top: 18px;
    }
  }

  // Legacy used `!important` against the global `_data-iterator.scss` checkbox rules. The scoped
  // selector here (`.data-iterator-card … .data-iterator-card__checkbox-container`) already has higher specificity, so the property
  // is set without it; the computed styles are checked in parity.
  .data-iterator-card__checkbox-container {
    background: var(--v-panel-base);
    left: -34px;
    top: 26px;
    width: 42px;
    height: 42px;
    display: flex;
    align-content: center;
    justify-content: center;
    flex-wrap: wrap;
    transition: opacity 0.24s ease;
    box-shadow: var(--v-card-checkbox-shadow);

    .checkbox {
      margin: 0px;
    }

    &::before {
      background: var(--v-panel-base);
      width: 24px;
      height: 72px;
      top: -6px;
      right: -17px;
    }
  }

  &--selected {
    .v-card {
      outline: none;
    }
  }

  &--green {
    .v-card {
      border-top-color: rgb(var(--v-theme-primary));
    }
  }

  &--red {
    .v-card {
      border-top-color: rgb(var(--v-theme-error));
    }

    .data-iterator-card__checkbox-container {
      border-color: rgb(var(--v-theme-error));
    }
  }

  &.data-iterator-card--selected {
    .v-card {
      &:before {
        box-shadow: none;
      }
    }
  }
}

.truncate-text {
  font-weight: 700;
  color: rgb(var(--v-theme-info));
  display: inline;
  justify-content: flex-end;
  margin-left: -4px;
}

[dir='rtl'] {
  .data-iterator-card {
    .data-iterator-card__checkbox-container {
      right: -32px;

      &::before {
        right: 32px;
      }
    }
  }
}
</style>
