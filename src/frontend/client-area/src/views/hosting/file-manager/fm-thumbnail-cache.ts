import type { FmFile } from './file-manager.types'
import { thumbnail } from './file-manager.api'

// Thumbnails of images, kept for the page: a file is requested again only when its timestamp changes (legacy loaded it on every mount).
// The cache is not cleared on navigation, so a folder opened again shows its images at once; it is cleared
// when the store resets (another account, leaving the page). It holds the request, so tiles that ask for one file share a single request.
const cache = new Map<string, Promise<string | null>>()

/** Requests that run at once; the others wait, so a folder of many images does not open dozens of connections. */
const MAX_PARALLEL = 4
let running = 0
const waiting: (() => void)[] = []

async function acquireSlot (): Promise<void> {
  if (running >= MAX_PARALLEL) {
    await new Promise<void>(resolve => waiting.push(resolve))
  } else {
    running += 1
  }
}

function releaseSlot (): void {
  const next = waiting.shift()
  if (next) {
    next()
  } else {
    running -= 1
  }
}

/** The image of a response goes to `src`, so only an image data URI is accepted. */
export function isImageDataUri (value: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value)
}

export function thumbnailKey (accountId: number, file: Pick<FmFile, 'path' | 'timestamp'>): string {
  return `${accountId}|${file.path}|${file.timestamp}`
}

async function request (accountId: number, path: string): Promise<string | null> {
  await acquireSlot()
  try {
    const response = await thumbnail(accountId, path)
    const image = response.data?.image ?? ''
    return isImageDataUri(image) ? image : null
  } catch {
    return null
  } finally {
    releaseSlot()
  }
}

/** A data URI of the thumbnail, or null when the request failed (a failure is not cached). */
export function loadThumbnail (accountId: number, file: Pick<FmFile, 'path' | 'timestamp'>): Promise<string | null> {
  const key = thumbnailKey(accountId, file)
  const cached = cache.get(key)
  if (cached !== undefined) {
    return cached
  }
  const pending: Promise<string | null> = request(accountId, file.path).then(image => {
    if (image === null && cache.get(key) === pending) {
      cache.delete(key)
    }
    return image
  })
  cache.set(key, pending)
  return pending
}

/** Empties the cache: when the store resets (another account, leaving the page) and in tests. */
export function clearThumbnailCache (): void {
  cache.clear()
}
