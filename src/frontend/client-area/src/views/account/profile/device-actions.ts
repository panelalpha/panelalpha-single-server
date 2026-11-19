// The modals and the outcome of each request.
import type { Device } from './account.api'
import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
import type { ModalCheckboxField } from '@/shared/ui/modal/basic-modal.types'
import { escapeHtml } from '@/shared/format/escape-html'
import { cancelButton } from '@/shared/ui/modal/action-modal'

type Translate = (key: string, options?: Record<string, unknown>) => string

export type DeviceModalKind = 'forget' | 'mass-forget' | 'logout'

export interface DeviceModal {
  kind: DeviceModalKind
  title: string
  /** Trusted HTML (`v-html` in the modal): the ip is escaped. */
  message: string
  color: 'error'
  icon: '$alertwarning'
  /** The required `confirm` checkbox, rendered in the modal's form. */
  confirmField: ModalCheckboxField
  buttons: ModalButton[]
  /** The devices the action runs on (one for forget and logout). */
  devices: Device[]
}

/** The `<b>ip</b>` of the modal copy; the ip comes from the API, so it is escaped. */
function boldIp (device: Device): string {
  return `<b>${escapeHtml(device.ip_address)}</b>`
}

function confirmField (t: Translate, labelKey: string, count?: number): ModalCheckboxField {
  return {
    type: 'checkbox',
    name: 'confirm',
    required: true,
    message: `<b>${t('message.confirmAction')}</b>`,
    label: t(labelKey, count === undefined ? undefined : { count }),
  }
}

/** Legacy `resetModal` buttons: the action first, then Cancel (`customClass: cancel-btn`). */
function buttons (t: Translate, id: string, label: string): ModalButton[] {
  return [
    { id, label, color: 'error' },
    cancelButton(t),
  ]
}

export function forgetDeviceOptions (t: Translate, device: Device): DeviceModal {
  return {
    kind: 'forget',
    title: t('heading.accountPage.modal.device.forget.title', { count: 1 }),
    message: t('heading.accountPage.modal.device.forget.info', { count: 1, ip: boldIp(device) }),
    color: 'error',
    icon: '$alertwarning',
    confirmField: confirmField(t, 'form.confirmDelete.forgetDevice', 1),
    buttons: buttons(t, 'forget', t('button.device.forget', { count: 1 })),
    devices: [device],
  }
}

/** The mass copy has no ip: the plural `info` ignores it. */
export function massForgetOptions (t: Translate, devices: Device[]): DeviceModal {
  const count = devices.length
  return {
    kind: 'mass-forget',
    title: t('heading.accountPage.modal.device.forget.title', { count }),
    message: t('heading.accountPage.modal.device.forget.info', { count }),
    color: 'error',
    icon: '$alertwarning',
    confirmField: confirmField(t, 'form.confirmDelete.forgetDevice', count),
    buttons: buttons(t, 'forget', t('button.device.forget', { count })),
    devices,
  }
}

export function logoutDeviceOptions (t: Translate, device: Device): DeviceModal {
  return {
    kind: 'logout',
    title: t('heading.accountPage.modal.device.logout.title'),
    message: t('heading.accountPage.modal.device.logout.info', { ip: boldIp(device) }),
    color: 'error',
    icon: '$alertwarning',
    confirmField: confirmField(t, 'form.confirmDelete.logoutDevice'),
    buttons: buttons(t, 'logout', t('button.logout')),
    devices: [device],
  }
}

/** Legacy: a 200 reloads the list; any other success (204 for the current device) ends the session. */
export function deviceActionOutcome (status: number): 'reload' | 'login' {
  return status === 200 ? 'reload' : 'login'
}

/** Legacy mass forget: only a 204 among the answers ends the session; everything else reloads. */
export function massForgetOutcome (statuses: number[]): 'reload' | 'login' {
  return statuses.includes(204) ? 'login' : 'reload'
}

/** Legacy hard-coded copy of a successful logout (not an i18n key). */
export const LOGOUT_SUCCESS_MESSAGE = 'Device has been logged off'
