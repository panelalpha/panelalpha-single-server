// The pure parts of `computed` and `methods`: the plan check and the feature label.

/**
 * A missing `provider_slug` counts as `'none'`. The empty string is NOT treated as "no CDN" here,
 * unlike `planHasCdn` in `entities/project/instance-resource.ts`, because legacy lets `''` through.
 */
export function isCdnEnabled (instance: { plan_settings?: Record<string, unknown> | null }): boolean {
  const slug = (instance.plan_settings?.cdn as { provider_slug?: unknown } | null | undefined)?.provider_slug
  return (slug ?? 'none') !== 'none'
}

/** Feature label: `feature.title || feature.name`. */
export function cdnFeatureLabel (feature: { name: string, title?: string | null }): string {
  return feature.title || feature.name
}
