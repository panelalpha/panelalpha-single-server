/**
 * Rendered HTML for a DOM snapshot: no scoped-style hashes, generated element ids, comments (also teleport markers),
 * icon paths or whitespace between tags, so the snapshot only pins the elements, their classes and their order.
 */
export function normalizeHtml (html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/g, '<svg></svg>')
    .replace(/ data-v-[\da-f]+=""/g, '')
    .replace(/ (id|aria-describedby|aria-controls|for)="v-[^"]*"/g, '')
    .replace(/>\s+</g, '><')
}
