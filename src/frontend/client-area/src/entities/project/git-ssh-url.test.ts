import { describe, expect, it } from 'vitest'
import { isSshRepoUrl, parseSshRepoUrl } from './git-ssh-url'

describe('isSshRepoUrl', () => {
  it.each([
    ['git@github.com:owner/repo.git', true],
    ['  git@gitlab.com:group/sub/repo.git ', true],
    ['ssh://git@example.com:2222/owner/repo.git', true],
    ['ssh://example.com/owner/repo', true],
    ['https://github.com/owner/repo.git', false],
    // eslint-disable-next-line unicorn/prefer-https -- legacy case: a plain http address is not an SSH one
    ['http://example.com/repo', false],
    ['', false],
    [null, false],
    ['git@github.com', false],
  ])('%s -> %s', (url, expected) => {
    expect(isSshRepoUrl(url)).toBe(expected)
  })
})

describe('parseSshRepoUrl', () => {
  it('returns the lower-case host and the path without .git', () => {
    expect(parseSshRepoUrl('git@GitHub.com:Owner/Repo.git')).toEqual({ host: 'github.com', path: 'Owner/Repo' })
    expect(parseSshRepoUrl('ssh://git@gitlab.com/g/sub/r.git')).toEqual({ host: 'gitlab.com', path: 'g/sub/r' })
  })

  it('returns null for non-SSH addresses', () => {
    expect(parseSshRepoUrl('https://github.com/o/r')).toBeNull()
  })
})
