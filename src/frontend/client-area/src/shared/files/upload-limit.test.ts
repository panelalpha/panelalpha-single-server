import type { HomeResponse } from '@/shared/session/session.api'
import { describe, expect, it } from 'vitest'
import { DEFAULT_UPLOAD_MAX_BYTES, exceedsUploadLimit, uploadMaxBytes, uploadMaxLabel } from './upload-limit'

function home (uploadMax?: unknown): HomeResponse {
  return { app: { upload_max_bytes: uploadMax as number } } as HomeResponse
}

describe('the panel upload limit', () => {
  it('reads home.app.upload_max_bytes, the bytes entrypoint.sh writes into PHP and nginx', () => {
    expect(uploadMaxBytes(home(5_242_880))).toBe(5_242_880)
    expect(uploadMaxBytes(home(1_073_741_824))).toBe(1_073_741_824)
  })

  it('falls back to the entrypoint default for a missing, zero or non-numeric field (an older or paid panel)', () => {
    expect(DEFAULT_UPLOAD_MAX_BYTES).toBe(268_435_456)
    expect(uploadMaxBytes(null)).toBe(DEFAULT_UPLOAD_MAX_BYTES)
    expect(uploadMaxBytes(undefined)).toBe(DEFAULT_UPLOAD_MAX_BYTES)
    expect(uploadMaxBytes(home(undefined))).toBe(DEFAULT_UPLOAD_MAX_BYTES)
    expect(uploadMaxBytes(home(0))).toBe(DEFAULT_UPLOAD_MAX_BYTES)
    expect(uploadMaxBytes(home('nonsense'))).toBe(DEFAULT_UPLOAD_MAX_BYTES)
  })

  it('names the limit the way the dialogs show it', () => {
    expect(uploadMaxLabel(home(5_242_880))).toBe('5 MB')
    expect(uploadMaxLabel(home(268_435_456))).toBe('256 MB')
    expect(uploadMaxLabel(home(1_073_741_824))).toBe('1 GB')
    expect(uploadMaxLabel(null)).toBe('256 MB')
  })

  it('refuses only a file over the limit: the limit itself goes through', () => {
    expect(exceedsUploadLimit({ size: 268_435_457 }, home(268_435_456))).toBe(true)
    expect(exceedsUploadLimit({ size: 268_435_456 }, home(268_435_456))).toBe(false)
    expect(exceedsUploadLimit({ size: 300_000_000 }, home(1_073_741_824))).toBe(false)
  })
})
