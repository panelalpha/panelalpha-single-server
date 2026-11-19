<template>
  <div class="preview-not-available">
    <div class="preview-not-available__content">
      <preview-not-available-icon class="preview-not-available__img" />

      <div class="preview-not-available__text p-4">
        {{ t('message.notPreview.title') }}

        <v-tooltip
          location="bottom"
          open-delay="150"
          transition="custom-tooltip"
          z-index="99"
        >
          <template #activator="{ props: activatorProps }">
            <a
              href="#"
              v-bind="activatorProps"
            >{{ t('button.why') }}</a>
          </template>

          <span v-if="instance.isNew()">
            {{ t('message.notPreview.info.new') }}
          </span>

          <span v-else>
            {{ t('message.notPreview.info.other') }}
          </span>
        </v-tooltip>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import PreviewNotAvailableIcon from './PreviewNotAvailableIcon.vue'

  defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.preview-not-available {
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  position: relative;

  &::before {
    content: "";
    position: absolute;
    z-index: 1;
    opacity: 0.8;
    height: 100%;
    width: 100%;
    border-radius: 8px 8px 0 0;
  }

  &__content {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 8px;
    position: relative;
    z-index: 2;
  }

  &__text {
    color: map.get(v.$text, base);
    margin-top: 4px;

    a {
      color: map.get(v.$primary, darken1);
      transition: color 0.24s ease;

      &:hover {
        color: map.get(v.$primary, base);
      }
    }
  }
}
</style>
