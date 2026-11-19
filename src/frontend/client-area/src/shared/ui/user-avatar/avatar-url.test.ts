import { describe, expect, it } from 'vitest'
import { avatarUrl, md5Digest } from './avatar-url'

describe('avatar-url', () => {
  it('matches known MD5 digests', () => {
    expect(md5Digest('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5Digest('hello')).toBe('5d41402abc4b2a76b9719d911017c592')
    expect(md5Digest('test@example.com')).toBe('55502f40dc8b7c769880b10874abc9d0')
  })

  it('builds the legacy Gravatar URL', () => {
    expect(avatarUrl('test@example.com', 48)).toBe(
      '//www.gravatar.com/avatar/55502f40dc8b7c769880b10874abc9d0.jpg?d=robohash&s=48',
    )
    expect(avatarUrl('hello', 96)).toBe(
      '//www.gravatar.com/avatar/5d41402abc4b2a76b9719d911017c592.jpg?d=robohash&s=96',
    )
  })

  it('keeps the legacy "rn" quirk (HelperFunctions md5 strips "rn" before hashing)', () => {
    // Legacy bug kept for parity: "learn" hashes like "lean".
    expect(md5Digest('learn@x.com')).toBe(md5Digest('lean@x.com'))
  })
})
