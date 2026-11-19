import type { HomeResponse } from '@/shared/session/session.api'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { useTrialExpiredModal } from './trial-expired-modal'

const NOW = new Date('2026-10-05T12:00:00Z')
function home (expiry: string | null): HomeResponse {
  return ({
    app: {},
    user: {
      services: expiry
        ? [{ id: 1, status: 'active', is_trial: true, trial_expiry_at: expiry }]
        : [],
    },
  }) as unknown as HomeResponse
}

const EXPIRED = '2026-10-01T12:00:00Z'

function setup () {
  const source = ref<HomeResponse | null>(null)
  let opened!: ReturnType<typeof useTrialExpiredModal>
  const wrapper = mount(defineComponent({
    setup () {
      opened = useTrialExpiredModal(source, () => NOW)
      return () => null
    },
  }))
  return { source, opened: () => opened.value, close: () => {
    opened.value = false
  }, wrapper }
}

describe('useTrialExpiredModal', () => {
  it('opens on the first /home hydration with an expired trial', async () => {
    const { source, opened } = setup()
    expect(opened()).toBe(false)
    source.value = home(EXPIRED)
    await nextTick()
    expect(opened()).toBe(true)
  })

  it('does not open for a running trial or without a trial', async () => {
    const running = setup()
    running.source.value = home('2026-10-20T12:00:00Z')
    await nextTick()
    expect(running.opened()).toBe(false)

    const none = setup()
    none.source.value = home(null)
    await nextTick()
    expect(none.opened()).toBe(false)
  })

  it('does not open on a second hydration (sign-in after a cold start without a trial)', async () => {
    const { source, opened } = setup()
    source.value = home(null)
    await nextTick()
    source.value = home(EXPIRED)
    await nextTick()
    expect(opened()).toBe(false)
  })

  it('does not reopen after it was closed and /home hydrates again', async () => {
    const { source, opened, close } = setup()
    source.value = home(EXPIRED)
    await nextTick()
    expect(opened()).toBe(true)
    close()
    source.value = home(EXPIRED)
    await nextTick()
    expect(opened()).toBe(false)
  })
})
