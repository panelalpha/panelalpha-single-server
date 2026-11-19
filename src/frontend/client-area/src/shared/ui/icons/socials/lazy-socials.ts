import { defineAsyncComponent } from 'vue'

// Apple, GitHub, LinkedIn and Microsoft are SVGs around base64 bitmaps (~460 kB of the entry before this module; the
// bitmaps are 96 px, ~12 kB together, drawn at the same 24 px). Only the session screens and the onboarding "GitHub"
// card draw them, so each is its own chunk. A screen that draws one calls `preloadSocialIcons` before it renders, so the
// icon is already in memory when the async wrapper first renders (no empty button).
const loaders = {
  apple: () => import('./Apple.vue'),
  github: () => import('./Github.vue'),
  linkedin: () => import('./Linkedin.vue'),
  microsoft: () => import('./Microsoft.vue'),
}

export type LazySocialIcon = keyof typeof loaders

export const lazySocialIcons = {
  apple: defineAsyncComponent(loaders.apple),
  github: defineAsyncComponent(loaders.github),
  linkedin: defineAsyncComponent(loaders.linkedin),
  microsoft: defineAsyncComponent(loaders.microsoft),
}

function isLazySocialIcon (name: string): name is LazySocialIcon {
  return Object.hasOwn(loaders, name)
}

/**
 * Fetches the chunks of the named logos (names the kit does not know, such as `google`, are ignored). A failed fetch does not
 * reject: the async wrapper retries on its own render and shows nothing at worst, as a missing bitmap would.
 */
export async function preloadSocialIcons (names: readonly string[]): Promise<void> {
  await Promise.allSettled(names.filter(isLazySocialIcon).map(name => loaders[name]()))
}
