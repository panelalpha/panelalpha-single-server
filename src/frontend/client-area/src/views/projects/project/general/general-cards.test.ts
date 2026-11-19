import type { GeneralHome } from './general-cards'
import { describe, expect, it } from 'vitest'
import { GENERAL_SKELETON_CARD_COUNT, speedCardsEnabled, visibleGeneralCards, withSecurityCard } from './general-cards'

function instance (wordpress: boolean, source: 'git' | 'files' | null = null) {
  return { hasInstallationDetails: () => wordpress, hasGitSource: () => source === 'git', hasFilesSource: () => source === 'files' }
}

const speedOn: GeneralHome = { app: { page_speed_enabled: true, single_server: { active: false } } }
const singleServer: GeneralHome = { app: { page_speed_enabled: false, single_server: { active: true } } }
const allOff: GeneralHome = { app: { page_speed_enabled: false, single_server: { active: false } } }

describe('visibleGeneralCards', () => {
  it('shows the Git source card instead of Installation for a git project', () => {
    expect(visibleGeneralCards(instance(false, 'git'), speedOn)).toEqual(['siteDetails', 'gitSource', 'loadingSpeed'])
  })

  it('shows the Files source card for an uploaded-files project', () => {
    expect(visibleGeneralCards(instance(false, 'files'), speedOn)).toEqual(['siteDetails', 'filesSource', 'loadingSpeed'])
  })

  it('shows the source card without the speed gates and puts Security after it', () => {
    expect(withSecurityCard(visibleGeneralCards(instance(false, 'git'), allOff))).toEqual(['gitSource', 'security'])
  })

  it('shows all three cards for a WordPress instance with page speed on', () => {
    expect(visibleGeneralCards(instance(true), speedOn)).toEqual(['siteDetails', 'installation', 'loadingSpeed'])
  })

  it('shows the speed cards under single server even without page speed', () => {
    expect(visibleGeneralCards(instance(true), singleServer)).toEqual(['siteDetails', 'installation', 'loadingSpeed'])
  })

  it('hides Site details and Loading speed when neither page speed nor single server is on', () => {
    expect(visibleGeneralCards(instance(true), allOff)).toEqual(['installation'])
  })

  it('hides Installation for a non-WordPress instance', () => {
    expect(visibleGeneralCards(instance(false), speedOn)).toEqual(['siteDetails', 'loadingSpeed'])
  })

  it('returns no cards for a non-WordPress instance without the speed gates', () => {
    expect(visibleGeneralCards(instance(false), allOff)).toEqual([])
  })

  it('treats a missing home as both gates off', () => {
    expect(visibleGeneralCards(instance(true), null)).toEqual(['installation'])
    expect(visibleGeneralCards(instance(true), undefined)).toEqual(['installation'])
  })

  it('treats a non-boolean page_speed_enabled as off', () => {
    expect(speedCardsEnabled({ app: { page_speed_enabled: undefined } })).toBe(false)
  })
})

describe('GENERAL_SKELETON_CARD_COUNT', () => {
  it('is four skeleton cards, as the legacy fetching state', () => {
    expect(GENERAL_SKELETON_CARD_COUNT).toBe(4)
  })
})

describe('withSecurityCard', () => {
  it('puts Security before Loading speed', () => {
    expect(withSecurityCard(['siteDetails', 'installation', 'loadingSpeed'])).toEqual(['siteDetails', 'installation', 'security', 'loadingSpeed'])
  })

  it('puts Security last when the speed cards are hidden', () => {
    expect(withSecurityCard(['installation'])).toEqual(['installation', 'security'])
  })

  it('shows Security alone for a non-WordPress instance without the speed gates', () => {
    expect(withSecurityCard([])).toEqual(['security'])
  })
})
