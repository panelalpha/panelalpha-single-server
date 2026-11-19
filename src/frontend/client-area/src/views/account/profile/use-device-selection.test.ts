import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { deviceId, useDeviceSelection } from './use-device-selection'

function device (overrides: Record<string, unknown>) {
  return ({
    ip_address: '1.1.1.1',
    browser: 'Chrome',
    device: 'Mac',
    last_login: '',
    current_device: false,
    session_id: null,
    device_id: null,
    ...overrides,
  }) as Parameters<typeof deviceId>[0]
}

describe('deviceId', () => {
  it('is device_id, else name', () => {
    expect(deviceId(device({ device_id: 'd1', name: 'n1' }))).toBe('d1')
    expect(deviceId(device({ device_id: null, name: 'n1' }))).toBe('n1')
    expect(deviceId(device({ device_id: '', name: 'n1' }))).toBe('n1')
  })
})

describe('useDeviceSelection', () => {
  const items = () => ref([device({ device_id: 'a' }), device({ device_id: 'b' }), device({ device_id: null, name: 'c' })])

  it('toggles one item', () => {
    const list = items()
    const selection = useDeviceSelection(list)

    selection.handleItemCheck(list.value[0]!)
    expect(selection.checkedItems.value).toEqual(['a'])

    selection.handleItemCheck(list.value[0]!)
    expect(selection.checkedItems.value).toEqual([])
  })

  it('select all checks every item once, including one without a device_id', () => {
    const list = items()
    const selection = useDeviceSelection(list)
    selection.handleItemCheck(list.value[1]!)

    selection.handleSelectAll(true)

    expect(selection.checkedItems.value).toEqual(['b', 'a', 'c'])
  })

  it('unselect all clears only the items of the list', () => {
    const list = items()
    const selection = useDeviceSelection(list)
    selection.handleSelectAll(true)

    selection.handleSelectAll(false)

    expect(selection.checkedItems.value).toEqual([])
  })

  it('clear empties the selection', () => {
    const list = items()
    const selection = useDeviceSelection(list)
    selection.handleSelectAll(true)

    selection.clear()

    expect(selection.checkedItems.value).toEqual([])
  })

  it('never selects the current device: not by click, not by select all', () => {
    const list = ref([device({ device_id: 'a' }), device({ device_id: 'cur', current_device: true, session_id: 's' })])
    const selection = useDeviceSelection(list)

    selection.handleItemCheck(list.value[1]!)
    expect(selection.checkedItems.value).toEqual([])

    selection.handleSelectAll(true)
    expect(selection.checkedItems.value).toEqual(['a'])
  })
})
