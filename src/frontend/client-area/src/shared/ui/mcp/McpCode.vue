<template>
  <code
    v-if="!block"
    class="mcp-code flex-grow-1"
  ><slot /></code>

  <pre
    v-else-if="html === undefined"
    class="mcp-code flex-grow-1 mb-0"
  ><slot /></pre>

  <pre
    v-else
    v-safe-html="html"
    class="mcp-code flex-grow-1 mb-0"
  />
</template>

<script lang="ts" setup>
  // The monospace value of an MCP step: a one-line `code` (the URL, the endpoint) or a `pre` block (a configuration). `html` is the
  // highlighted markup of `renderMcpCode`; it goes through `v-safe-html`, the slot is plain text.
  import { vSafeHtml } from '@/shared/html/v-safe-html'

  defineProps<{
    block?: boolean
    html?: string
  }>()
</script>

<style lang="scss" scoped>
// The Connect AI panel declared its own copy of this block too; this one is what the tool steps use.
.mcp-code {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 13px;
  color: inherit;
  // Legacy Connect AI declares these three with `!important` to beat V2's `.theme--light.v-application code`; V4 has no such rule, so the plain
  // declarations are enough (measured on the screens). The WordPress MCP endpoint restates the V2 look on `.well code.mcp-code`.
  background: transparent;
  background-color: transparent;
  box-shadow: none;
  white-space: pre-wrap;
  word-break: break-all;

  // Legacy `code` carries 5.2px side padding at 13px (`.4em`, measured: the shrink-wrapped URL well is 10.4px wider than without); V4 has no
  // `code` rule. It shows when the well shrinks to its content (ChatGPT, below `lg`).
  &:is(code) {
    padding: 0.2em 0.4em;
  }
}
</style>
