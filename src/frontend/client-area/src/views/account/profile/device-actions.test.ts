import { describe, expect, it } from 'vitest'
import {
  deviceActionOutcome,
  forgetDeviceOptions,
  LOGOUT_SUCCESS_MESSAGE,
  logoutDeviceOptions,
  massForgetOptions,
  massForgetOutcome,
} from './device-actions'

const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key)

function device (ip: string, id = 'd1') {
  return {
    ip_address: ip,
    browser: 'Chrome',
    device: 'Mac',
    last_login: '',
    current_device: false,
    session_id: 's1',
    device_id: id,
  }
}

describe('forgetDeviceOptions', () => {
  it('counts one device, names its ip in bold and needs the confirm checkbox', () => {
    const modal = forgetDeviceOptions(t, device('1.2.3.4'))

    expect(modal.title).toBe('heading.accountPage.modal.device.forget.title:{"count":1}')
    expect(modal.message).toBe('heading.accountPage.modal.device.forget.info:{"count":1,"ip":"<b>1.2.3.4</b>"}')
    expect(modal.color).toBe('error')
    expect(modal.icon).toBe('$alertwarning')
    expect(modal.confirmField).toMatchObject({
      type: 'checkbox',
      name: 'confirm',
      required: true,
      message: '<b>message.confirmAction</b>',
      label: 'form.confirmDelete.forgetDevice:{"count":1}',
    })
    expect(modal.buttons).toEqual([
      { id: 'forget', label: 'button.device.forget:{"count":1}', color: 'error' },
      { id: 'cancel', label: 'button.cancel', type: 'cancel', color: 'normal', customClass: 'cancel-btn' },
    ])
  })

  it('escapes the ip it puts into the html message', () => {
    const modal = forgetDeviceOptions(t, device('<img src=x onerror=alert(1)>'))

    expect(modal.message).toContain('<b>&lt;img src=x onerror=alert(1)&gt;</b>')
    expect(modal.message).not.toContain('<img')
  })
})

describe('massForgetOptions', () => {
  it('counts the devices and carries no ip', () => {
    const devices = [device('1.1.1.1', 'a'), device('2.2.2.2', 'b')]
    const modal = massForgetOptions(t, devices)

    expect(modal.title).toBe('heading.accountPage.modal.device.forget.title:{"count":2}')
    expect(modal.message).toBe('heading.accountPage.modal.device.forget.info:{"count":2}')
    expect(modal.confirmField.label).toBe('form.confirmDelete.forgetDevice:{"count":2}')
    expect(modal.buttons[0]!.label).toBe('button.device.forget:{"count":2}')
    expect(modal.devices).toBe(devices)
  })
})

describe('logoutDeviceOptions', () => {
  it('uses the logout copy, a plain confirm label and the Log out button', () => {
    const modal = logoutDeviceOptions(t, device('9.9.9.9'))

    expect(modal.title).toBe('heading.accountPage.modal.device.logout.title')
    expect(modal.message).toBe('heading.accountPage.modal.device.logout.info:{"ip":"<b>9.9.9.9</b>"}')
    expect(modal.confirmField.label).toBe('form.confirmDelete.logoutDevice')
    expect(modal.buttons[0]).toEqual({ id: 'logout', label: 'button.logout', color: 'error' })
  })
})

describe('outcomes', () => {
  it('a 200 reloads, any other success ends the session', () => {
    expect(deviceActionOutcome(200)).toBe('reload')
    expect(deviceActionOutcome(204)).toBe('login')
    expect(deviceActionOutcome(201)).toBe('login')
  })

  it('mass forget ends the session only when an answer is a 204', () => {
    expect(massForgetOutcome([200, 200])).toBe('reload')
    expect(massForgetOutcome([200, 204])).toBe('login')
    expect(massForgetOutcome([201])).toBe('reload')
  })

  it('keeps the hard-coded logout alert text', () => {
    expect(LOGOUT_SUCCESS_MESSAGE).toBe('Device has been logged off')
  })
})
