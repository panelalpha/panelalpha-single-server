import type { Device } from './account.api'
import { type Ref, ref } from 'vue'

/** Selection key of a device: `device_id`, else `name` (a device without an id only exists as a session). */
export function deviceId (device: Device): string | undefined {
  return device.device_id || device.name
}

/** The current device cannot be selected: it would log the user out of this very session. */
export function isDeviceSelectable (device: Device): boolean {
  return !device.current_device
}

export function useDeviceSelection (items: Ref<Device[]>) {
  const checkedItems = ref<Array<string | undefined>>([])

  function handleItemCheck (device: Device): void {
    if (!isDeviceSelectable(device)) {
      return
    }
    const id = deviceId(device)
    const index = checkedItems.value.indexOf(id)
    if (index === -1) {
      checkedItems.value.push(id)
    } else {
      checkedItems.value.splice(index, 1)
    }
  }

  /** Check every item that is not yet, or uncheck every one that is. */
  function handleSelectAll (checked: boolean): void {
    for (const device of items.value) {
      if (checkedItems.value.includes(deviceId(device)) !== checked) {
        handleItemCheck(device)
      }
    }
  }

  /** Legacy never clears the selection after a mass forget (deviation: it is cleared). */
  function clear (): void {
    checkedItems.value = []
  }

  return { checkedItems, handleItemCheck, handleSelectAll, clear }
}
