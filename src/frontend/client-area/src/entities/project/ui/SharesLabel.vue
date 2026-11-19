<template>
  <v-chip
    v-if="shares"
    class="shares-label"
    :class="isSmall ? 'v-chip--small' : ''"
    color="info"
    data-testid="shares-label"
    size="small"
    variant="flat"
    @click.stop.prevent="emit('open')"
  >
    <v-icon
      class="mr-1"
      color="white"
      icon="$shareIcon"
      :size="isSmall ? '12' : '16'"
    />
    {{ shares }}
  </v-chip>

  <v-icon
    v-else-if="showAssignText && isIcon"
    class="share-instance-btn cursor-pointer"
    data-testid="shares-label"
    icon="$shareIcon"
    size="20"
    @click="emit('open')"
  />

  <span
    v-else-if="showAssignText"
    class="label-bar-empty link-text p-4 cursor-pointer"
    data-testid="shares-label"
    @click="emit('open')"
  >
    {{ t('button.user.assign') }}
  </span>
</template>

<script lang="ts" setup>
  // Legacy wrapped `ShareInstanceModal` around the
  // label; here the host mounts the modal (instance list, hosting Summary) and this component only reports the click.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'

  const props = defineProps<{
    instance: InstanceResource
    showAssignText?: boolean
    isSmall?: boolean
    isIcon?: boolean
  }>()

  const emit = defineEmits<{
    open: []
  }>()

  const { t } = useTranslation()

  const shares = computed(() => props.instance.sharedAccess?.length ?? 0)
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

.v-chip {
  // V2 `color="white"` on the icon.
  .v-icon {
    color: var(--v-white-base);
  }

  border-radius: 4px;
  // V4 draws a thin border on a chip; V2 had none.
  border-style: none;
  border-color: var(--v-info-base);
  box-shadow: none;
  font-size: v.$font-size-xxs;
  line-height: v.$line-height-xxs;
  color: white;
  font-weight: v.$font-weight-semibold;
  padding: 4px 8px;
  height: 28px;

  &--small {
    width: 37px;
    max-width: 37px;
    padding: 4px 4px;
    height: 24px;
  }

  &:active,
  &:focus {
    box-shadow: none;
  }
}
</style>
