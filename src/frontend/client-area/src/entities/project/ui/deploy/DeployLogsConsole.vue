<template>
  <div
    ref="consoleEl"
    class="deploy-console"
    @scroll="onScroll"
  >
    <div class="deploy-console__lines">
      <div
        v-for="(line, index) in lines"
        :key="index"
        class="deploy-console__line"
        :class="`deploy-console__line--${line.level || 'dim'}`"
      >{{ line.msg || ' ' }}</div>

      <div
        v-if="lines.length === 0"
        class="deploy-console__line deploy-console__line--dim"
      >
        {{ emptyText }}
      </div>

      <span
        v-if="live"
        class="deploy-console__cursor"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import type { DeployLogLine } from './deploy-log.types'
  import { nextTick, onMounted, ref, watch } from 'vue'

  const props = withDefaults(defineProps<{
    lines?: DeployLogLine[]
    live?: boolean
    emptyText?: string
  }>(), {
    lines: () => [],
    live: false,
    emptyText: '',
  })

  const consoleEl = ref<HTMLElement | null>(null)
  let stickToBottom = true

  function onScroll () {
    const el = consoleEl.value
    if (!el) {
      return
    }
    stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  function scrollToBottom () {
    const el = consoleEl.value
    if (el && stickToBottom) {
      el.scrollTop = el.scrollHeight
    }
  }

  watch([() => props.lines, () => props.lines.length], () => {
    nextTick(scrollToBottom)
  })
  onMounted(() => {
    nextTick(scrollToBottom)
  })
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// The palette is the `$terminal` token map.
.deploy-console {
  background: map.get(v.$terminal, bg);
  border-radius: 14px;
  padding: 16px 18px;
  height: 360px;
  overflow-y: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.75;
  text-align: left;

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-thumb {
    background: map.get(v.$terminal, line);
    border-radius: 4px;
  }

  &__line {
    white-space: pre-wrap;
    word-break: break-word;
    color: map.get(v.$terminal, text);

    &--ok {
      color: map.get(v.$terminal, ok);
      font-weight: 600;
    }
    &--info {
      color: map.get(v.$terminal, info);
    }
    &--warn {
      color: map.get(v.$terminal, warn);
    }
    &--error {
      color: map.get(v.$terminal, error);
      font-weight: 600;
    }
  }

  &__cursor {
    display: inline-block;
    width: 7px;
    height: 14px;
    background: map.get(v.$terminal, ok);
    vertical-align: -2px;
    animation: deploy-console-blink 1s step-end infinite;
  }
}

@keyframes deploy-console-blink {
  50% {
    opacity: 0;
  }
}
</style>
