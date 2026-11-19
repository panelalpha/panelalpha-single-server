import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { VIcon } from 'vuetify/components'
import vuetify from '@/app/plugins/vuetify'
import { aliases } from './aliases'

const APP_LITE_KEYS = [
  'loadingHourglass',
  'upgradeIcon',
  'supportIcon',
  'discordIcon',
  'user',
  'loader',
  'suspended',
  'bell',
  'creditcard',
  'logout',
  'configureRules',
  'errorCircle',
  'bandwidth',
  'pause',
  'alertTriangle',
  'tryAgain',
  'systemInstallations',
  'grid',
  'list',
  'plus',
  'search',
  'storage',
  'backupS3',
  'backupFtp',
  'settings',
  'settings2',
  'settings3',
  'tasks',
  'wrench',
  'update',
  'morehorizontal',
  'restore',
  'copy',
  'thrash',
  'sliders',
  'slidersHorizontal',
  'activate',
  'disable',
  'restorebackup',
  'backup',
  'increase',
  'trash',
  'decrease',
  'arrowleft',
  'arrowright',
  'lock',
  'externallink',
  'cpu',
  'alertok',
  'alertwarning',
  'check',
  'help',
  'chevrondown',
  'dropdown',
  'eyeclosed',
  'pluscircle',
  'eye',
  'arrowdown',
  'arrowup',
  'barchart',
  'calendar',
  'chevronleft',
  'chevronright',
  'unfold',
  'chevronsright',
  'database',
  'dollarsign',
  'downloadcloud',
  'download',
  'edit',
  'edit2',
  'filetext',
  'folder',
  'archive',
  'home',
  'image',
  'installed',
  'menu',
  'messagecircle',
  'minus',
  'morevertical',
  'power',
  'ram',
  'unlock',
  'xcircle',
  'checkcircle',
  'alerterror',
  'wordpress',
  'close',
  'checkboxOn',
  'arrowsSort',
  'okcircle',
  'paginationleft',
  'paginationright',
  'alertwarningfilled',
  'email',
  'lockoutline',
  'clock',
  'mail',
  'twitter',
  'fb',
  'send',
  'plans',
  'stars',
  'alertcircle',
  'wordpressalt',
  'collaborate',
  'arrowRightSm',
  'shareIcon',
  'share2Icon',
  'hourglassIcon',
  'keyIcon',
  'diskspaceIcon',
  'emailaccountsIcon',
  'infiniteIcon',
  'bandwidthIcon',
  'ftpaccountsIcon',
  'mysqldatabasesIcon',
  'subdomainsIcon',
  'addondomainsIcon',
  'circlePlus',
  'fillArrowRight',
  'terminal',
  'message',
  'codex',
  'sparkles',
  'brackets',
  'wind',
  'code',
  'plug',
  'bolt',
  'linuxIcon',
  'windowsIcon',
  'macOsIcon',
  'androidIcon',
  'deviceOtherIcon',
  'chromeIcon',
  'firefoxIcon',
  'operaIcon',
  'edgeIcon',
  'safariIcon',
  'browserOtherIcon',
  'installIcon',
  'starIcon',
  'starFullIcon',
  'starFullPremiumIcon',
  'starEmptyIcon',
  'arrowCornerRightIcon',
  'pluginIcon',
  'globe',
  'proxyOn',
  'proxyOff',
  'infoCircle',
  'preview',
  'previewDetails',
  'wrenchRight',
  'arrowRightUp',
  'modalIcon',
  'merge',
  'moon',
  'sun',
  'facebook',
  'facebookWhite',
  'google',
  'linkedin',
  'apple',
  'microsoft',
  'github',
  'settingsLight',
] as const

describe('icon aliases Phase 1 contract', () => {
  it('$plus with size=16 renders the 17x16 drawing', () => {
    const wrapper = mount(VIcon, {
      props: {
        icon: '$plus',
        size: '16',
      },
      global: {
        plugins: [vuetify],
      },
    })

    expect(wrapper.html()).toContain('viewBox="0 0 17 16"')
  })

  it('$plus with no size renders the 24x24 drawing', () => {
    const wrapper = mount(VIcon, {
      props: {
        icon: '$plus',
      },
      global: {
        plugins: [vuetify],
      },
    })

    expect(wrapper.html()).toContain('viewBox="0 0 24 24"')
  })

  it('$alertTriangle keeps stroke #E71D1D', () => {
    const wrapper = mount(VIcon, {
      props: {
        icon: '$alertTriangle',
      },
      global: {
        plugins: [vuetify],
      },
    })

    expect(wrapper.html()).toContain('stroke="#E71D1D"')
  })
})

// Next-only line icons of the container actions (owner review of Containers): one grid and stroke with `restore` and `filetext`.
const NEXT_ONLY_KEYS = [
  // My Server in the user menu: the Plus/Pro chip drawn in the Feather style of the menu.
  'server',
  'play',
  'pauseLine',
  'downloadLine',
  'trashLine',
  // File manager list.
  'fileLine',
  'filePlus',
  'folderPlus',
  'folderOpen',
  'uploadLine',
  'cut',
  'paste',
  'clipboard',
  'fileAudio',
  'fileVideo',
  'filePdf',
  'fullscreen',
  'levelUp',
  // File manager media modals.
  'save',
  'rotateLeft',
  'rotateRight',
  'flipHorizontal',
  'flipVertical',
  'minusCircle',
  'repeat',
]

describe('icon aliases Phase 2 union', () => {
  it('registers all 169 app-lite keys and the next-only keys as components', () => {
    expect(APP_LITE_KEYS).toHaveLength(169)
    expect(Object.keys(aliases)).toHaveLength(169 + NEXT_ONLY_KEYS.length)
    for (const key of [...APP_LITE_KEYS, ...NEXT_ONLY_KEYS]) {
      expect(aliases).toHaveProperty(key)
      const value = aliases[key as keyof typeof aliases]
      expect(value).toBeTypeOf('object')
      expect(typeof value).not.toBe('string')
    }
  })

  it('dropdown and chevrondown share the same component', () => {
    expect(aliases.dropdown).toBe(aliases.chevrondown)
  })

  it('close is a component, not an MDI string', () => {
    expect(typeof aliases.close).not.toBe('string')
    expect(aliases.close).toBeTypeOf('object')
  })
})
