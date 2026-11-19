/**
 * Live favicon, app-lite variant: the href of `<link rel~='icon'>` from the theme,
 * and `fallbackHref` (the href kept at start) when the theme has no favicon. A missing link is created.
 */
export function applyDocumentFavicon (doc: Document, favicon: string | false | null | undefined, fallbackHref: string): void {
  let link = doc.querySelector<HTMLLinkElement>('link[rel~=\'icon\']')
  if (!link) {
    link = doc.createElement('link')
    link.rel = 'icon'
    doc.head.append(link)
  }
  link.href = favicon || fallbackHref
}

/** The href of `<link rel~='icon'>` at start (in next `/favicon.svg` from `index.html`). */
export function readDocumentFaviconHref (doc: Document): string {
  return doc.querySelector<HTMLLinkElement>('link[rel~=\'icon\']')?.getAttribute('href') ?? ''
}
