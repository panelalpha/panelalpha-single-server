/**
 * Legacy V2 breakpoints as Vuetify 4 sees them (measured on the legacy deploy).
 *
 * V2 configured `xs 576 / sm 768 / md 992 / lg 1216 / xl 1416` as *upper* bounds of each name and subtracted
 * `scrollBarWidth` (16) from `md` and `lg`, so the first width of each name is sm 576, md 768, lg 976, xl 1200.
 * V4 `thresholds` are the *lower* bounds of the name (`sm` is the first width of `sm`), so those measured edges are
 * the thresholds. `mobile` flips at 976 (V2 `mobileBreakpoint: 'md'` = 992 - 16), which is the `lg` threshold, and
 * `smAndDown` ends at 768. No `xxl` on purpose: legacy has none, so V4 keeps its default (2138).
 */
export const displayOptions = {
  mobileBreakpoint: 'lg' as const,
  thresholds: {
    xs: 0,
    sm: 576,
    md: 768,
    lg: 976,
    xl: 1200,
  },
}
