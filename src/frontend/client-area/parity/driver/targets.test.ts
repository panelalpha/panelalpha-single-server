import { describe, expect, it } from 'vitest'
import { fixtureInputsFor, parseMainWorktree, targetCheckout, targetOf } from './targets'

describe('targetOf', () => {
  it('defaults to lite', () => {
    expect(targetOf({})).toBe('lite')
    expect(targetOf({ target: 'app' })).toBe('app')
  })
})

describe('fixtureInputsFor', () => {
  const files = ['avatar.png', 'home.json', 'screenshot.png', 'translation.en.json', 'lite/home.json', 'lite/translation.en.json']

  it('keeps lite fixtures out of the app key', () => {
    expect(fixtureInputsFor('app', files)).toEqual(['avatar.png', 'home.json', 'screenshot.png', 'translation.en.json'])
    expect(fixtureInputsFor('app', files)).toEqual(fixtureInputsFor('app', files.filter(file => file !== 'lite/home.json')))
  })

  it('gives lite its own files and the shared images, without the app home and translation', () => {
    expect(fixtureInputsFor('lite', files)).toEqual(['avatar.png', 'screenshot.png', 'lite/home.json', 'lite/translation.en.json'])
  })
})

describe('main checkout resolution', () => {
  const porcelain = 'worktree /repo/main\nHEAD abc\nbranch refs/heads/master\n\nworktree /repo/main/.claude/worktrees/x\nHEAD def\n'

  it('takes the first worktree entry, falls back otherwise', () => {
    expect(parseMainWorktree(porcelain, '/cwd')).toBe('/repo/main')
    expect(parseMainWorktree('', '/cwd')).toBe('/cwd')
  })

  it('resolves the legacy checkout against the given base', () => {
    expect(targetCheckout('app', '/repo/main')).toBe('/repo/client-area')
    expect(targetCheckout('lite', '/repo/main')).toBe('/app-lite/packages/client-area')
  })
})
