import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { emit, off, on, resetAppEvents, useAppEvent } from './app-events'

afterEach(resetAppEvents)

describe('app-events', () => {
  it('delivers the typed payload to every handler of the event', () => {
    const first = vi.fn()
    const second = vi.fn()
    on('app-ready-to-render', first)
    on('app-ready-to-render', second)

    emit('app-ready-to-render', false)

    expect(first).toHaveBeenCalledWith(false)
    expect(second).toHaveBeenCalledWith(false)
  })

  it('emits payload-less events without arguments', () => {
    const handler = vi.fn()
    on('start-installation-process', handler)

    emit('start-installation-process')

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not call handlers of other events', () => {
    const handler = vi.fn()
    on('after-login', handler)

    emit('start-installation-process')

    expect(handler).not.toHaveBeenCalled()
  })

  it('on() returns an unsubscribe function and off() removes a handler', () => {
    const a = vi.fn()
    const b = vi.fn()
    const stopA = on('after-login', a)
    on('after-login', b)

    stopA()
    off('after-login', b)
    emit('after-login')

    expect(a).not.toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()
  })

  it('lets a handler unsubscribe itself during delivery', () => {
    const calls: string[] = []
    const stop = on('after-login', () => {
      calls.push('once')
      stop()
    })
    on('after-login', () => calls.push('other'))

    emit('after-login')
    emit('after-login')

    expect(calls).toEqual(['once', 'other', 'other'])
  })

  it('useAppEvent unsubscribes when the scope is disposed', () => {
    const handler = vi.fn()
    const scope = effectScope()
    scope.run(() => useAppEvent('instance-item-changed', handler))

    emit('instance-item-changed', { id: 1 })
    scope.stop()
    emit('instance-item-changed', { id: 2 })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ id: 1 })
  })

  it('a handler that re-subscribes itself during delivery runs once per emit', () => {
    let calls = 0
    const handler = () => {
      calls++
      off('after-login', handler)
      on('after-login', handler)
    }
    on('after-login', handler)

    emit('after-login')

    expect(calls).toBe(1)
  })

  it('carries the instance list events', () => {
    const reload = vi.fn()
    const deleted = vi.fn()
    const created = vi.fn()
    const updated = vi.fn()
    const first = vi.fn()
    const retry = vi.fn()
    const drop = vi.fn()
    on('instances-list-reload', reload)
    on('instance-deleted', deleted)
    on('instance-created', created)
    on('instance-updated', updated)
    on('manage-first-instance', first)
    on('instance-retry-install', retry)
    on('start-files-drop-install', drop)

    emit('instances-list-reload')
    emit('instance-deleted', [{ id: 1 }, { id: 2 }])
    emit('instance-created', { id: 3 })
    emit('instance-updated', { id: 4 })
    emit('manage-first-instance')
    emit('instance-retry-install', { id: 5 })
    emit('start-files-drop-install', { uploadItems: [] })

    expect(reload).toHaveBeenCalledTimes(1)
    expect(deleted).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }])
    expect(created).toHaveBeenCalledWith({ id: 3 })
    expect(updated).toHaveBeenCalledWith({ id: 4 })
    expect(first).toHaveBeenCalledTimes(1)
    expect(retry).toHaveBeenCalledWith({ id: 5 })
    expect(drop).toHaveBeenCalledWith({ uploadItems: [] })
  })
})
