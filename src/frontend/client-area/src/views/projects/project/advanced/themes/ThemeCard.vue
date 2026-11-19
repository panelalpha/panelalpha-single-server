<template>
  <div
    class="data-iterator-card"
    :class="[
      checked ? 'data-iterator-card--selected' : '',
      isActive ? 'data-iterator-card--green' : '',
    ]"
  >
    <v-card elevation="4">
      <div class="data-iterator-card__checkbox-container">
        <Checkbox
          :model-value="checked"
          @update:model-value="emit('checked', $event)"
        />
      </div>

      <!-- Screenshot and hover buttons: the catalogue card media of the kit. -->
      <CatalogCardMedia
        :action-label="isActive ? undefined : t('button.theme.use')"
        :preview-href="previewUrl"
        :preview-label="t('button.preview')"
        :src="screenshotSrc"
        @action="emit('action-button-activate', item)"
      />

      <v-card-title class="d-flex justify-space-between align-center">
        <!-- Title as text: the decoded API value is never rendered as HTML here. -->
        <h5 class="item-title">{{ title }}</h5>

        <div class="d-flex align-center">
          <v-tooltip
            location="bottom"
            open-delay="150"
            transition="custom-tooltip"
          >
            <template #activator="{ props: activatorProps }">
              <div v-bind="activatorProps">
                <v-icon
                  v-if="updateAvailable"
                  color="error"
                  icon="$alertwarning"
                  size="16"
                />

                <v-icon
                  v-else
                  :color="isActive ? 'primary' : 'gray-darken-1'"
                  icon="$alertok"
                  size="16"
                />
              </div>
            </template>

            <span class="base--text">
              <span v-if="updateAvailable">{{ t('tooltip.instance.theme.update.available') }}</span>
              <span v-else>{{ t('tooltip.instance.theme.update.current') }}</span>
            </span>
          </v-tooltip>
        </div>
      </v-card-title>

      <v-card-text class="p-3">
        <span
          v-safe-html:external="description.text"
          class="base--text"
        />

        <a
          v-if="hasReadMore"
          class="truncate-text"
          @click="emit('action-button-read-more', item)"
        >
          <span class="base--text font-weight-regular"> ... </span>
          {{ t('button.readMore') }}
        </a>
      </v-card-text>

      <v-card-actions class="pt-2 px-4">
        <div
          v-if="asyncState === 'installing'"
          class="d-flex w-100 justify-space-between"
        >
          <v-tooltip
            location="bottom"
            open-delay="150"
            transition="custom-tooltip"
            z-index="99"
          >
            <template #activator="{ props: activatorProps }">
              <div v-bind="activatorProps">
                <BaseIconButton
                  icon="$update"
                  loading
                  :text="t('button.installing')"
                />
              </div>
            </template>

            <span class="base--text">{{ t('message.status.install.inProgress') }}</span>
          </v-tooltip>
        </div>

        <div
          v-else-if="asyncState === 'updating'"
          class="d-flex w-100 justify-space-between"
        >
          <v-tooltip
            location="bottom"
            open-delay="150"
            transition="custom-tooltip"
            z-index="99"
          >
            <template #activator="{ props: activatorProps }">
              <div v-bind="activatorProps">
                <BaseIconButton
                  icon="$update"
                  loading
                  :text="t('button.updating')"
                />
              </div>
            </template>

            <span class="base--text">{{ t('message.status.update.inProgress') }}</span>
          </v-tooltip>
        </div>

        <div
          v-else
          class="d-flex w-100 justify-space-between"
        >
          <div class="d-flex">
            <v-tooltip
              location="bottom"
              open-delay="150"
              transition="custom-tooltip"
              z-index="99"
            >
              <template #activator="{ props: activatorProps }">
                <div v-bind="activatorProps">
                  <BaseIconButton
                    :disabled="isActive"
                    :icon="isActive ? '$xcircle' : '$checkcircle'"
                    :text="isActive ? t('message.status.activated') : t('message.status.active')"
                    @click="emit('action-button-activate', item)"
                  />
                </div>
              </template>

              <span class="base--text">
                <span v-if="!isActive">{{ t('tooltip.instance.theme.activated.notActive') }}</span>
                <span v-else>{{ t('tooltip.instance.theme.activated.active') }}</span>
              </span>
            </v-tooltip>

            <v-tooltip
              location="bottom"
              open-delay="150"
              transition="custom-tooltip"
              z-index="99"
            >
              <template #activator="{ props: activatorProps }">
                <div v-bind="activatorProps">
                  <BaseIconButton
                    :href="previewUrl"
                    icon="$eye"
                    rel="noopener noreferrer"
                    target="_blank"
                    :text="t('button.preview')"
                  />
                </div>
              </template>

              <span class="base--text">{{ t('tooltip.instance.theme.preview') }}</span>
            </v-tooltip>

            <v-tooltip
              v-if="updateAvailable"
              location="bottom"
              open-delay="150"
              transition="custom-tooltip"
              z-index="99"
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

              <span class="base--text">{{ t('tooltip.instance.theme.update') }}</span>
            </v-tooltip>
          </div>

          <v-tooltip
            location="bottom"
            open-delay="150"
            transition="custom-tooltip"
            z-index="99"
          >
            <template #activator="{ props: activatorProps }">
              <div v-bind="activatorProps">
                <BaseIconButton
                  :disabled="isActive"
                  icon="$thrash"
                  :text="t('button.remove')"
                  @click="emit('action-button-delete', item)"
                />
              </div>
            </template>

            <span
              v-if="isActive"
              class="base--text"
            >{{ t('tooltip.instance.theme.cannotDelete') }}</span>

            <span
              v-else
              class="base--text"
            >{{ t('tooltip.instance.theme.delete') }}</span>
          </v-tooltip>
        </div>
      </v-card-actions>
    </v-card>
  </div>
</template>

<script lang="ts" setup>
  import type { InstalledTheme } from '@/entities/project/instance-themes.api'
  // The app has a `message.tatus` typo: the lite key is used.
  // The description cut is shared with the plugins (`@/entities/project/wordpress-items`); the title is decoded to text, so it
  // is not `v-html` as in legacy. The screenshot URL is built at render time from the instance id and the theme name.
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { themeScreenshotSrc } from '@/entities/project/instance-themes.api'
  import CatalogCardMedia from '@/entities/project/ui/catalog/CatalogCardMedia.vue'
  import { CARD_DESCRIPTION_LIMIT, cardDescription, itemAsyncState } from '@/entities/project/wordpress-items'
  import { decodeEntities } from '@/shared/format/decode-entities'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import BaseIconButton from '@/shared/ui/buttons/BaseIconButton.vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'

  const props = defineProps<{
    item: InstalledTheme
    checked: boolean
    instanceId: number
  }>()

  const emit = defineEmits<{
    'checked': [value: boolean]
    'action-button-activate': [item: InstalledTheme]
    'action-button-update': [item: InstalledTheme]
    'action-button-delete': [item: InstalledTheme]
    'action-button-read-more': [item: InstalledTheme]
  }>()

  const { t } = useTranslation()

  const isActive = computed(() => props.item.status === 'active')
  const updateAvailable = computed(() => props.item.update === 'available')
  const asyncState = computed(() => itemAsyncState(props.item))
  const title = computed(() => decodeEntities(props.item.title || props.item.name))
  const screenshotSrc = computed(() => themeScreenshotSrc(props.instanceId, props.item.name))
  const previewUrl = computed(() => `https://wp-themes.com/${props.item.name}`)
  // The link follows the raw description.
  const description = computed(() => cardDescription(props.item.description || t('message.theme.noDescription')))
  const hasReadMore = computed(() => (props.item.description || '').length > CARD_DESCRIPTION_LIMIT)
</script>

<style lang="scss" scoped>
// `$font-weight-bold` is 700, `--v-primary-base`, `--v-error-base` and
// `--v-info-base` become the theme channels as elsewhere in next, and the V2 `v-card__title` / `v-card__text` are `v-card-title` /
// `v-card-text`. The `.truncate` rules of legacy match no element of this template, so they are not carried over.
.item-title {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.data-iterator-card {
  .v-card {
    border: 0px solid;
    border-top: 6px solid;
    border-color: var(--v-gray-lighten2);
    border-radius: 8px;

    .v-card-text {
      position: relative;
      // V2 `.v-card__text` line-height is 20px; the global `.v-card-text` (`_card.scss`) sets 22px, which made the card 4 px taller.
      line-height: 1.25rem;
    }

    .v-card-title {
      padding-top: 18px;
    }

    // A disabled action of the card (Activated, Remove) has no fill. The global rule paints `gray lighten5` on every disabled button, which showed as
    // grey squares on the active card. The icon and label keep the disabled colours.
    .v-card-actions :deep(.v-btn.v-btn--disabled) {
      background: unset !important;
      background-color: unset !important;
    }
  }

  .data-iterator-card__checkbox-container {
    background: var(--v-panel-base);
    left: -34px;
    top: 210px;
    width: 42px !important;
    height: 42px !important;
    display: flex;
    align-content: center;
    justify-content: center;
    flex-wrap: wrap;
    transition: opacity 0.24s ease;
    box-shadow: var(--v-card-checkbox-shadow);

    &::before {
      background: var(--v-panel-base);
      width: 24px;
      height: 72px;
      top: -6px;
      right: -17px;
    }

    .checkbox {
      margin: 0px !important;
    }
  }

  &.data-iterator-card--selected {
    .v-card {
      &:before {
        box-shadow: none !important;
      }
    }
  }

  &--green {
    .v-card {
      border-top-color: rgb(var(--v-theme-primary));
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
