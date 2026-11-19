<template>
  <div class="no-data py-12 px-12">
    <div class="no-data__img mb-6">
      <slot name="image" />
    </div>

    <div
      class="no-data__content"
      :style="`max-width: ${maxWidth};`"
    >
      <h3 class="no-data__title text--heading">
        {{ title }}
      </h3>

      <p class="no-data__desc mt-4 mb-0 p-1 font-weight-light text-center text-gray-darken-1">
        {{ desc }}
      </p>

      <div
        v-if="$slots.action"
        class="no-data__action mt-6"
      >
        <slot name="action" />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  withDefaults(defineProps<{
    title?: string
    desc?: string
    maxWidth?: string
  }>(), {
    title: undefined,
    desc: undefined,
    maxWidth: '560px',
  })
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

.no-data {
  display: flex;
  flex-direction: column;
  align-items: center;

  &__title {
    font-weight: v.$font-weight-extrabold;
    text-align: center;
    line-height: 40px;
  }

  &__content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin: auto;
  }

  &__action {
    width: 100%;
    display: flex;
    justify-content: center;
  }
}
</style>
