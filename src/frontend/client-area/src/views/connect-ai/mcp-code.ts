/** Escapes `&`, `<` and `>` only, then wraps every `YOUR_TOKEN` in the placeholder span. */
export function renderMcpCode (code: string): string {
  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/YOUR_TOKEN/g, '<span class="tok-ph">YOUR_TOKEN</span>')
}
