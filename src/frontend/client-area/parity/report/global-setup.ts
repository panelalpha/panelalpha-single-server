import { legacyAssets } from '../driver/legacy-build'
import { legacyCacheMode } from '../driver/legacy-cache'
import { TARGET_NAMES, TARGETS } from '../driver/targets'
import { cacheKey } from '../lib/legacy-cache'

export default async function globalSetup () {
  // Set once per invocation; workers inherit it, the teardown matches results against it.
  process.env.PARITY_RUN_ID = new Date().toISOString()

  // Fingerprint of each deployed legacy build for the legacy capture cache: a redeploy changes the chunk hashes.
  // Left unset for a target whose legacy is unreachable or lists no hashed chunks, which disables the cache for that
  // target only: the other target keeps its cache.
  if (legacyCacheMode() !== 'off') {
    await Promise.all(TARGET_NAMES.map(async name => {
      const { url, buildEnv } = TARGETS[name]
      try {
        const assets = await legacyAssets(url)
        if (assets.length === 0) {
          throw new Error('no hashed js/css in it')
        }
        process.env[buildEnv] = cacheKey(assets)
      } catch (error) {
        console.warn(`Parity: ${name} legacy index.html unreadable (${url}), legacy cache disabled for ${name} this run (${error instanceof Error ? error.message : String(error)})`)
      }
    }))
  }
}
