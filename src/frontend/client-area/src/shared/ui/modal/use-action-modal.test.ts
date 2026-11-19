import type { ActionModal } from './action-modal'
import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useActionModal } from './use-action-modal'

vi.mock('@/shared/ui/modal/body-scroll-lock', () => ({ useBodyScrollLock: vi.fn() }))

function modal (type: string, values?: Record<string, unknown>, persistent = false): ActionModal {
  return {
    type: type as ActionModal['type'],
    props: { title: type, message: '', icon: '', buttons: [], confirmRequired: false },
    fields: [],
    width: '560px',
    persistent,
    values,
  }
}

function create<T> (handlers: Parameters<typeof useActionModal<T>>[0]) {
  const scope = effectScope()
  return scope.run(() => useActionModal<T>(handlers))!
}

describe('useActionModal', () => {
  it('opens with the values of the modal and closes on close', async () => {
    const api = create({})

    api.open(modal('clear-cache', { version: '6.0' }), null)
    expect(api.modalOpen.value).toBe(true)
    expect(api.modal.value?.type).toBe('clear-cache')
    expect(api.values.value).toEqual({ version: '6.0' })

    await api.onButton('close')
    expect(api.modalOpen.value).toBe(false)
  })

  it('re-creates the dialog on every open', () => {
    const api = create({})
    const before = api.render.value

    api.open(modal('update'), null)
    api.open(modal('update'), null)

    expect(api.render.value).toBe(before + 2)
  })

  it('cancel closes without calling a handler', async () => {
    const run = vi.fn()
    const api = create({ update: { run } })
    api.open(modal('update'), null)

    await api.onButton('cancel')

    expect(run).not.toHaveBeenCalled()
    expect(api.modalOpen.value).toBe(false)
  })

  it('dispatches the button to the handler of the modal type, with a copy of the values and the target', async () => {
    const run = vi.fn()
    const api = create<{ id: number }>({ 'update': { run }, 'clear-cache': { run: vi.fn() } })
    const values = { version: '6.0' }
    api.open(modal('update', values), { id: 7 })

    await api.onButton('submit')

    expect(run).toHaveBeenCalledTimes(1)
    const [passed, ctx] = run.mock.calls[0]!
    expect(passed).toEqual({ version: '6.0' })
    expect(passed).not.toBe(api.values.value)
    expect(ctx.target).toEqual({ id: 7 })
  })

  it('is busy and persistent while a handler runs, then released', async () => {
    let finish: () => void = () => undefined
    const run = vi.fn(() => new Promise<void>(resolve => {
      finish = resolve
    }))
    const api = create({ update: { run } })
    api.open(modal('update'), null)

    const pending = api.onButton('submit')
    expect(api.submitting.value).toBe(true)
    expect(api.persistent.value).toBe(true)

    finish()
    await pending
    expect(api.submitting.value).toBe(false)
    expect(api.persistent.value).toBe(false)
  })

  it('does not go busy for a handler with busy: false (legacy suspend)', async () => {
    const run = vi.fn()
    const api = create({ suspend: { run, busy: false } })
    api.open(modal('suspend', undefined, true), null)

    await api.onButton('submit')

    expect(run).toHaveBeenCalledTimes(1)
    expect(api.submitting.value).toBe(false)
    expect(api.persistent.value).toBe(true)
  })

  it('a handler opens the next step by ctx.open, which keeps the target when none is given', async () => {
    const seen: unknown[] = []
    const api = create<{ id: number }>({
      'copy': {
        run: (_values, ctx) => {
          ctx.open(modal('copy-options', { service_id: 2 }))
        },
      },
      'copy-options': {
        run: (_values, ctx) => {
          seen.push(ctx.target)
          ctx.close()
        },
      },
    })
    api.open(modal('copy'), { id: 3 })

    await api.onButton('submit')
    expect(api.modal.value?.type).toBe('copy-options')
    expect(api.modalOpen.value).toBe(true)

    await api.onButton('submit')
    expect(seen).toEqual([{ id: 3 }])
    expect(api.modalOpen.value).toBe(false)
  })

  it('passes null as the target for the mass actions of the selection', async () => {
    const run = vi.fn()
    const api = create<{ id: number }>({ 'mass-delete': { run } })
    api.open(modal('mass-delete'), null)

    await api.onButton('submit')

    expect(run.mock.calls[0]![1].target).toBeNull()
  })

  it('passes the id of the clicked button to the handler', async () => {
    const run = vi.fn()
    const api = create({ 'git-pull-dirty': { run } })
    api.open(modal('git-pull-dirty'), null)

    await api.onButton('force')

    expect(run.mock.calls[0]![1].button).toBe('force')
  })

  it('in active loading mode spins only the clicked button while the request runs, then clears it', async () => {
    let during: Array<{ id: string, loading?: boolean }> = []
    let finish: () => void = () => undefined
    const api = create({
      'git-pull-dirty': {
        run: () => new Promise<void>(resolve => {
          during = api.modal.value!.props.buttons.map(button => ({ id: button.id, loading: button.loading }))
          finish = resolve
        }),
      },
    })
    const active: ActionModal = modal('git-pull-dirty')
    active.props.loadingMode = 'active'
    active.props.buttons = [
      { id: 'revert', label: 'Revert', color: 'error' },
      { id: 'force', label: 'Force', color: 'primary' },
      { id: 'cancel', label: 'Cancel', color: 'normal', type: 'cancel' },
    ]
    api.open(active, null)

    // The handler runs synchronously up to its first await, so the buttons are read while the request is pending.
    const pending = api.onButton('force')
    expect(during).toEqual([
      { id: 'revert', loading: undefined },
      { id: 'force', loading: true },
      { id: 'cancel', loading: undefined },
    ])

    finish()
    await pending
    expect(api.modal.value!.props.buttons.every(button => !button.loading)).toBe(true)
  })

  it('leaves the buttons alone outside the active loading mode', async () => {
    let during: boolean | undefined
    const api = create({
      update: {
        run: async () => {
          during = api.modal.value!.props.buttons[0]!.loading
        },
      },
    })
    const plain = modal('update')
    plain.props.buttons = [{ id: 'submit', label: 'Save', color: 'primary' }]
    api.open(plain, null)

    await api.onButton('submit')

    expect(during).toBeUndefined()
  })

  it('does nothing for a type without a handler', async () => {
    const api = create({})
    api.open(modal('push-loading'), null)

    await api.onButton('submit')

    expect(api.submitting.value).toBe(false)
    expect(api.modalOpen.value).toBe(true)
  })
})
