import { describe, expect, it } from 'vitest'
import { toastKeyOf } from '@/entities/hub/hub-connection'
import { CONNECTED_ACCOUNT_DEFAULT, DISCONNECT_SET_PASSWORD_DEFAULT, DISCONNECT_WARNING_DEFAULT, HUB_TOAST_DEFAULTS, UNREACHABLE_DEFAULT } from './hub-copy'

const BARE_PANELALPHA = /PanelAlpha(?! Hub)/

describe('hub-copy', () => {
  it('every toast key of a complete answer has a default text that never says a bare PanelAlpha', () => {
    for (const status of ['denied', 'expired', 'pending'] as const) {
      const text = HUB_TOAST_DEFAULTS[toastKeyOf(status)]
      expect(text).toBeTruthy()
      expect(text).not.toMatch(BARE_PANELALPHA)
    }
  })

  it('the shared defaults say PanelAlpha Hub', () => {
    for (const text of [CONNECTED_ACCOUNT_DEFAULT, DISCONNECT_SET_PASSWORD_DEFAULT, DISCONNECT_WARNING_DEFAULT, UNREACHABLE_DEFAULT]) {
      expect(text).not.toMatch(BARE_PANELALPHA)
    }
  })
})
