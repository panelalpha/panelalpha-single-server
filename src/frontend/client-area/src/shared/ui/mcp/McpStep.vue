<template>
  <div class="step">
    <div
      class="step__num"
      :data-testid="numTestId"
    >
      {{ num }}
    </div>

    <div class="step__body">
      <div
        class="step__title"
        :data-testid="titleTestId"
      >
        {{ title }}
      </div>

      <slot />
    </div>

    <slot name="action" />
  </div>
</template>

<script lang="ts" setup>
  // One numbered step of the MCP screens (Connect AI tool panel, WordPress MCP).
  // The screens keep their own dark colours of `.step__num` and their extras (`.step__action`, `.mcp-path`) in their scoped styles, reached
  // with `:deep()` because the number and the body are rendered here.
  defineProps<{
    num: number | string
    title: string
    numTestId?: string
    titleTestId?: string
  }>()
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;
@use 'sass:map';

.step {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.step__num {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 50%;
  background: map.get(v.$primary, lighten4);
  color: map.get(v.$primary, darken1);
  font-weight: 700;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step__title {
  font-weight: 600;
  font-size: 15px;
  color: map.get(v.$text, headings);
}

.step__body {
  flex: 1;
  min-width: 0;
}

@media (max-width: 767px) {
  .step {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
