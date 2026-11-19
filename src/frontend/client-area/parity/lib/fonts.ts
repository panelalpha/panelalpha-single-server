/**
 * Font file name without the content hash Vite appends to bundled assets
 * (`nunito-sans-latin-400-normal-DUb-KqT8.woff2` -> `nunito-sans-latin-400-normal.woff2`),
 * so next's bundled files and the plain `@fontsource` files served to legacy compare by name.
 */
export function normalizeFontName (name: string): string {
  return name.replace(/-[\w-]{8}(?=\.woff2?$)/, '')
}
