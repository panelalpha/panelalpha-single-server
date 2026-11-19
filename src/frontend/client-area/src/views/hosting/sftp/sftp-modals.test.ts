import type { HostingServerAccount } from '@/views/hosting/hosting.types'
import { describe, expect, it } from 'vitest'
import { modalFieldName } from '@/views/hosting/ftp/ftp-modals'
import { accessSftpModal, addSftpModal, deleteSftpModal, disconnectSftpModal, editSftpModal, infoSftpModal, toggleAuthFields } from './sftp-modals'

const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key)

const panelalpha = { id: 11, domain: 'one.example.com', server_type: 'panelalpha', username: 'example' } as HostingServerAccount
const wpCloud = { id: 11, domain: 'one.example.com', server_type: 'wp-cloud', username: 'example', details: { remote_id: 'example-wpc' } } as HostingServerAccount

describe('addSftpModal', () => {
  it('opens with the username prefixed by the PanelAlpha account name', () => {
    const modal = addSftpModal(t, { pageType: 'sftp', serverAccount: panelalpha })

    expect(modal.title).toBe('heading.hosting.sftp.modal.add.title')
    expect(modal.icon).toBe('$plus')
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['add', 'button.sftp.add', 'primary'],
      ['cancel', 'button.cancel', 'normal'],
    ])
    expect(modal.fields.map(field => [field.type, modalFieldName(field)])).toEqual([
      ['text', 'username'],
      ['select', 'type'],
      ['generatePassword', 'password'],
      ['text', 'public_key'],
    ])
    expect(modal.fields[0]).toMatchObject({ prefix: 'example_' })
  })

  it('prefixes WP Cloud accounts with the remote id', () => {
    const modal = addSftpModal(t, { pageType: 'ssh', serverAccount: wpCloud })

    expect(modal.fields[0]).toMatchObject({ prefix: 'example-wpc-' })
    expect(modal.title).toBe('heading.hosting.ssh.modal.add.title')
    expect(modal.buttons[0]).toMatchObject({ label: 'button.ssh.add' })
  })

  it('prefixes with the username in a project, also for WP Cloud accounts', () => {
    const modal = addSftpModal(t, { pageType: 'sftp', serverAccount: wpCloud, variant: 'project' })

    expect(modal.fields[0]).toMatchObject({ prefix: 'example_' })
  })

  it('offers the password and SSH key methods, the public key hidden and the tooltips as keys', () => {
    const modal = addSftpModal(t, { pageType: 'ssh', serverAccount: wpCloud })

    expect(modal.fields[1]).toMatchObject({
      required: true,
      options: [{ label: 'form.option.password', value: 'password' }, { label: 'form.option.sshKey', value: 'public_key' }],
      tooltip: 'tooltip.add_ssh_account.type',
    })
    expect(modal.fields[2]).toMatchObject({ tooltip: 'tooltip.add_ssh_account.password' })
    expect(modal.fields[3]).toMatchObject({ hidden: true, tooltip: 'tooltip.add_ssh_account.public_key' })
  })

  it('seeds every key of the payload so Add sends the same four keys as legacy', () => {
    const modal = addSftpModal(t, { pageType: 'sftp', serverAccount: panelalpha })

    expect(modal.initialValues).toEqual({ username: null, type: 'password', password: null, public_key: null })
  })
})

describe('editSftpModal', () => {
  it('names the account in the message and escapes it', () => {
    const modal = editSftpModal(t, { pageType: 'sftp', item: { user: '<i>example_deploy</i>' } })

    expect(modal.icon).toBe('$edit')
    expect(modal.title).toBe('heading.hosting.sftp.modal.update.title')
    expect(modal.message).toBe('<b>heading.hosting.sftp.modal.update.info:</b> &lt;i&gt;example_deploy&lt;/i&gt;')
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['update', 'button.update', 'primary'],
      ['cancel', 'button.cancel', 'normal'],
    ])
  })

  it('has the method, password and public key fields with the add tooltip for the method and the edit ones for the rest', () => {
    const modal = editSftpModal(t, { pageType: 'ssh', item: { user: 'example_deploy' } })

    expect(modal.fields.map(field => [field.type, modalFieldName(field)])).toEqual([
      ['select', 'type'],
      ['generatePassword', 'password'],
      ['text', 'public_key'],
    ])
    expect(modal.fields[0]).toMatchObject({ tooltip: 'tooltip.add_ssh_account.type' })
    expect(modal.fields[1]).toMatchObject({ tooltip: 'tooltip.edit_ssh_account.password' })
    expect(modal.fields[2]).toMatchObject({ tooltip: 'tooltip.edit_ssh_account.public_key', hidden: true })
  })

  it('seeds the payload with the three keys of an update', () => {
    const modal = editSftpModal(t, { pageType: 'sftp', item: { user: 'example_deploy' } })

    expect(modal.initialValues).toEqual({ type: 'password', password: null, public_key: null })
  })
})

describe('infoSftpModal', () => {
  it('lists username, host and port, escaping every API value, and has only Cancel', () => {
    const modal = infoSftpModal(t, {
      pageType: 'sftp',
      item: { user: '<i>example_deploy</i>' },
      info: { host: 'sftp.example.com', port: 2222 },
    })

    expect(modal.kind).toBe('info')
    expect(modal.icon).toBe('$help')
    expect(modal.title).toBe(String.raw`heading.hosting.sftp.modal.show.title:{"user":"<span class=\"text-break-long\">&lt;i&gt;example_deploy&lt;/i&gt;</span>"}`)
    expect(modal.message).toBe(
      '<ul>'
      + '<li><strong class="d-inline-block">heading.hosting.sftp.modal.show.info.username:</strong> <span class="d-inline-block">&lt;i&gt;example_deploy&lt;/i&gt;</span></li>'
      + '<li><strong class="d-inline-block">heading.hosting.sftp.modal.show.info.host:</strong> <span class="d-inline-block">sftp.example.com</span></li>'
      + '<li><strong class="d-inline-block">heading.hosting.sftp.modal.show.info.port:</strong> <span class="d-inline-block">2222</span></li>'
      + '</ul>',
    )
    expect(modal.buttons.map(button => button.id)).toEqual(['cancel'])
    expect(modal.fields).toEqual([])
  })

  it('escapes a host that carries markup', () => {
    const modal = infoSftpModal(t, {
      pageType: 'ssh',
      item: { user: 'example_deploy' },
      info: { host: '"><script>', port: 22 },
    })

    expect(modal.message).toContain('<span class="d-inline-block">&quot;&gt;&lt;script&gt;</span>')
  })
})

describe('deleteSftpModal', () => {
  it('is an error modal with a required confirm checkbox labelled by the page type, and Delete and Cancel', () => {
    const modal = deleteSftpModal(t, { pageType: 'ssh' })

    expect(modal.kind).toBe('delete')
    expect(modal.color).toBe('error')
    expect(modal.icon).toBe('$alertwarning')
    expect(modal.title).toBe('heading.hosting.ssh.modal.delete.title')
    expect(modal.fields).toEqual([{
      type: 'checkbox',
      label: 'form.confirmDelete.ssh',
      name: 'confirm',
      message: '<b>message.confirmAction</b>',
      required: true,
    }])
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['delete', 'button.delete', 'error'],
      ['cancel', 'button.cancel', 'normal'],
    ])
  })
})

describe('toggleAuthFields', () => {
  it('shows the password for the password method and the public key otherwise, in both directions', () => {
    const { fields } = addSftpModal(t, { pageType: 'sftp', serverAccount: panelalpha })
    const hiddenOf = (name: string) => fields.find(field => modalFieldName(field) === name)?.hidden

    toggleAuthFields(fields, 'public_key')
    expect(hiddenOf('password')).toBe(true)
    expect(hiddenOf('public_key')).toBe(false)

    toggleAuthFields(fields, 'password')
    expect(hiddenOf('password')).toBe(false)
    expect(hiddenOf('public_key')).toBe(true)
  })
})

describe('disconnectSftpModal', () => {
  it('is a primary modal with the logout icon, the message, Disconnect all and Cancel, and no fields', () => {
    const modal = disconnectSftpModal(t, { pageType: 'ssh' })

    expect(modal.kind).toBe('disconnect')
    expect(modal.color).toBe('primary')
    expect(modal.icon).toBe('$logout')
    expect(modal.title).toBe('heading.hosting.ssh.modal.disconnect.title')
    expect(modal.message).toBe('heading.hosting.ssh.modal.disconnect.message')
    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['disconnect', 'button.disconnect.all', 'primary'],
      ['cancel', 'button.cancel', 'normal'],
    ])
    expect(modal.fields).toEqual([])
    expect(modal.initialValues).toEqual({})
  })
})

describe('accessSftpModal', () => {
  it('seeds the access select with the current access type', () => {
    const modal = accessSftpModal(t, { pageType: 'ssh', accessType: 'ssh' })

    expect(modal.kind).toBe('access')
    expect(modal.color).toBe('primary')
    expect(modal.icon).toBe('$settings')
    expect(modal.title).toBe('heading.hosting.ssh.modal.manageSSH.title')
    expect(modal.message).toBe('heading.hosting.ssh.modal.manageSSH.message')
    expect(modal.initialValues).toEqual({ access_type: 'ssh' })
  })

  it('offers SSH and SFTP in that order, not required, with the page tooltip', () => {
    const modal = accessSftpModal(t, { pageType: 'ssh', accessType: 'sftp' })

    expect(modal.fields).toEqual([{
      type: 'select',
      label: 'heading.hosting.ssh.modal.manageSSH.field',
      name: 'access_type',
      tooltip: 'tooltip.hosting.ssh.accessMethod',
      options: [
        { label: 'general.ssh', value: 'ssh' },
        { label: 'general.sftp', value: 'sftp' },
      ],
    }])
    expect(modal.fields[0]).not.toHaveProperty('required')
    expect(modal.initialValues).toEqual({ access_type: 'sftp' })
  })

  it('has the set-access button first and Cancel after it', () => {
    const modal = accessSftpModal(t, { pageType: 'sftp', accessType: null })

    expect(modal.buttons.map(button => [button.id, button.label, button.color])).toEqual([
      ['setAccessMethod', 'button.setAccessMethod', 'primary'],
      ['cancel', 'button.cancel', 'normal'],
    ])
    expect(modal.initialValues).toEqual({ access_type: null })
  })
})
