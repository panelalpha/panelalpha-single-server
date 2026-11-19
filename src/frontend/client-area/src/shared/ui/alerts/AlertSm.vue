<template>
  <div class="alert-sm">
    <div class="alert-sm-icon mr-2">
      <v-icon
        icon="$infoCircle"
        size="16"
      />
    </div>

    <div class="alert-sm-text text--gray-darken1">
      <span class="p-sm">{{ text }}</span>
    </div>
  </div>
</template>

<script lang="ts" setup>
  withDefaults(defineProps<{
    text?: string
  }>(), {
    text: '',
  })
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.alert-sm {
  display: flex;
  align-items: center;

  &.alert-sm {
    &--primary {
      .alert-sm-icon {
        // V4 renders the icon as <i class="v-icon"> (V2: <span>), so the selector is the class
        .v-icon {
          color: map.get(v.$primary, base);
        }
      }
    }
  }

  .alert-sm {
    &-icon {
      margin-top: -2px;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    &-text {
      display: flex;
      justify-content: center;
      align-items: center;
    }
  }
}
</style>
