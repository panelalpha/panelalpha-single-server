<template>
  <div>
    <v-tooltip
      location="bottom"
      open-delay="150"
      transition="custom-tooltip"
      z-index="99"
    >
      <template #activator="{ props: activatorProps }">
        <v-chip
          :class="isSmall ? 'v-chip--small' : ''"
          color="sand-darken-1"
          href="#"
          size="small"
          variant="flat"
          v-bind="activatorProps"
        >
          <v-icon
            class="mr-1"
            color="white"
            icon="$collaborate"
            :size="isSmall ? '14' : '18'"
          />

          <v-icon
            class="icon-arrow mr-1"
            color="white"
            icon="$arrowRightSm"
            size="15"
          />
        </v-chip>
      </template>

      <span v-safe-html="t('tooltip.instance.collaborate.start')" />
    </v-tooltip>
  </div>
</template>

<script lang="ts" setup>
  // The click is the parent's `@click` on this root, as legacy `@click.native` (the card and the table call `useCollaborationLink`).
  import { useTranslation } from 'i18next-vue'
  import { vSafeHtml } from '@/shared/html/v-safe-html'

  defineProps<{
    isSmall?: boolean
  }>()

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

.v-chip {
  // V2 `color="white"` on the icons.
  .v-icon {
    color: var(--v-white-base);
  }

  // V2 `color="sand darken-1"` painted the palette value `#FFB600`; V4 generates a different `sand-darken-1` shade, so the
  // legacy value is set on the variable (`themes-variables.scss`). V2 chips had no border and no shadow.
  background-color: var(--v-sand-darken1);
  border-color: var(--v-sand-darken1);
  border-style: none;
  box-shadow: none;
  border-radius: 4px;
  font-size: v.$font-size-xxs;
  line-height: v.$line-height-xxs;
  color: white;
  font-weight: v.$font-weight-semibold;
  width: 50px;
  max-width: 50px;
  height: 28px;
  padding: 4px 8px;

  &:active,
  &:focus {
    box-shadow: none;
  }

  &--small {
    width: 37px;
    max-width: 37px;
    padding: 4px 4px;
    height: 24px;
  }

  .icon-arrow {
    margin-left: -3px;
  }
}
</style>
