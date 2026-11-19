import type { InstalledPlugin, RepositoryPlugin } from '@/entities/project/instance-plugins.api'
import { describe, expect, it } from 'vitest'
import {
  buildActivateModal,
  buildDeactivateModal,
  buildDeleteModal,
  buildInstallModal,
  buildMassActivateModal,
  buildMassDeactivateModal,
  buildMassDeleteModal,
  buildMassUpdateModal,
  buildUpdateModal,
} from './plugin-actions'

const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key)

function plugin (overrides: Partial<InstalledPlugin> = {}): InstalledPlugin {
  return { name: 'akismet', title: 'Akismet', description: '', version: '1.0.0', status: 'inactive', ...overrides }
}

describe('plugin-actions builders', () => {
  it('builds the activate dialog with the primary button and no fields', () => {
    const modal = buildActivateModal(t, plugin())

    expect(modal.type).toBe('plugin-activate')
    expect(modal.props.title).toBe('heading.instance.plugin.activate.title:{"count":1}')
    expect(modal.props.message).toBe('heading.instance.plugin.activate.info:{"count":1}')
    expect(modal.props.icon).toBe('$activate')
    expect(modal.props.buttons[0]).toMatchObject({ id: 'submit', label: 'button.activate', color: 'primary' })
    expect(modal.props.buttons[1]).toMatchObject({ id: 'cancel', label: 'button.cancel', type: 'cancel' })
    expect(modal.fields).toEqual([])
    expect(modal.props.confirmRequired).toBe(false)
    expect(modal.width).toBe('560px')
    expect(modal.persistent).toBe(false)
  })

  it('builds the deactivate dialog in the error colour with the warning icon', () => {
    const modal = buildDeactivateModal(t, plugin())

    expect(modal.type).toBe('plugin-deactivate')
    expect(modal.props.color).toBe('error')
    expect(modal.props.icon).toBe('$alertwarning')
    expect(modal.props.title).toBe('heading.instance.plugin.deactivate.title:{"count":1}')
    expect(modal.props.message).toBe('heading.instance.plugin.deactivate.message:{"count":1}')
    expect(modal.props.buttons[0]).toMatchObject({ label: 'button.deactivate', color: 'error' })
  })

  it('passes the update version into the update message, escaped', () => {
    const modal = buildUpdateModal(t, plugin({ update_version: '<2.0>' }))

    expect(modal.type).toBe('plugin-update')
    expect(modal.props.message).toBe('heading.instance.plugin.update.message_one:{"count":1,"version":"&lt;2.0&gt;"}')
    expect(modal.props.buttons[0]).toMatchObject({ label: 'button.update', color: 'primary' })
  })

  it('builds the delete dialog with a required confirm checkbox that gates the button', () => {
    const modal = buildDeleteModal(t, plugin({ title: 'Akismet' }))

    expect(modal.type).toBe('plugin-delete')
    expect(modal.props.confirmRequired).toBe(true)
    expect(modal.props.buttons[0]).toMatchObject({ label: 'button.delete', color: 'error' })
    expect(modal.fields).toEqual([
      {
        message: '<b>message.confirmAction</b>',
        label: 'form.confirmDelete.plugin:{"count":1}',
        name: 'confirm',
        type: 'checkbox',
        required: true,
      },
    ])
  })

  it('puts the plugin name in the target box of the delete message and escapes it', () => {
    const modal = buildDeleteModal(t, plugin({ title: '<img src=x onerror=alert(1)>' }))

    expect(modal.props.targetBox).toContain('class="target-item-box"')
    expect(modal.props.targetBox).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(modal.props.targetBox).not.toContain('<img')
  })

  it('falls back to the plugin slug in the target box when the title is empty', () => {
    const modal = buildDeleteModal(t, plugin({ title: '', name: 'hello-dolly' }))

    expect(modal.props.targetBox).toContain('>hello-dolly</span>')
  })
})

describe('plugin-actions install builder', () => {
  const catalogue = (overrides: Partial<RepositoryPlugin> = {}): RepositoryPlugin => ({
    id: 1,
    type: 'plugin',
    name: 'Akismet',
    slug: 'akismet',
    version: '5.0',
    short_description: 'Spam <i>filter</i>',
    status: 'publish',
    tested: '6.5',
    rating: 90,
    active_installs: 1000,
    last_updated: '2026-01-01',
    ...overrides,
  })

  it('builds the install dialog with the restore icon, the escaped short description and the plugin box', () => {
    const modal = buildInstallModal(t, catalogue())

    expect(modal.type).toBe('plugin-install')
    expect(modal.props.title).toBe('heading.instance.plugin.install.title')
    expect(modal.props.icon).toBe('$restorebackup')
    expect(modal.props.message).toContain('Spam filter')
    expect(modal.props.message).not.toContain('<i>')
    // The box is its own element after the message (`targetBox`, the legacy `custom` slot), not inside the message paragraph.
    expect(modal.props.message).not.toContain('target-item-box')
    // With a rating the box is `targetRatingBox` (rendered by `BasicModal` with the kit star), not `targetBox` HTML.
    expect(modal.props.targetBox).toBeUndefined()
    expect(modal.props.targetRatingBox).toMatchObject({ labelHtml: 'Akismet', rating: '4.5', percent: 0.9 })
    expect(modal.props.targetRatingBox).toMatchObject({ border: 'gray-lighten3', flat: false })
    expect(modal.props.buttons[0]).toMatchObject({ id: 'submit', label: 'button.install', color: 'primary' })
  })

  it('keeps the plain box without the rating when the plugin has none', () => {
    const modal = buildInstallModal(t, catalogue({ rating: 0 }))

    expect(modal.props.targetRatingBox).toBeUndefined()
    expect(modal.props.targetBox).toContain('class="target-item-box"')
    expect(modal.props.targetBox).toContain('>Akismet<')
  })

  it('decodes the catalogue entities before escaping, so they are not shown literally (legacy rendered them)', () => {
    const modal = buildInstallModal(t, catalogue({ name: 'Yoast SEO &#8211; Tools', short_description: 'Fast &amp; light' }))

    expect(modal.props.message).toContain('Fast &amp; light')
    expect(modal.props.message).not.toContain('&amp;amp;')
    expect(modal.props.targetRatingBox?.labelHtml).toBe('Yoast SEO – Tools')
  })
})

describe('plugin-actions mass builders', () => {
  it('counts the selection in the mass activate and deactivate dialogs (deactivate uses the $disable icon)', () => {
    const plugins = [plugin(), plugin({ name: 'b' })]

    const activate = buildMassActivateModal(t, plugins)
    expect(activate.type).toBe('plugin-mass-activate')
    expect(activate.props.title).toBe('heading.instance.plugin.activate.title:{"count":2}')
    expect(activate.props.buttons[0]).toMatchObject({ id: 'submit', label: 'button.activate', color: 'primary' })

    const deactivate = buildMassDeactivateModal(t, plugins)
    expect(deactivate.type).toBe('plugin-mass-deactivate')
    expect(deactivate.props.icon).toBe('$disable')
    expect(deactivate.props.color).toBe('error')
    expect(deactivate.props.message).toMatch(/^heading\.instance\.plugin\.deactivate\.message:\{"count":2\}<span class="target-item-box flex-column"/)
    expect(activate.props.message).not.toContain('target-item-box')
  })

  it('lists the selected plugins in the box of the mass deactivate and delete dialogs, escaped, title before slug', () => {
    const plugins = [plugin({ title: '<b>Akismet</b>' }), plugin({ name: 'hello-dolly', title: '' })]

    for (const modal of [buildMassDeactivateModal(t, plugins), buildMassDeleteModal(t, plugins)]) {
      const source = modal.props.targetBox ?? modal.props.message
      const box = source.match(/<span class="target-item-box flex-column".*<\/span>$/)?.[0] ?? ''
      const rows = box.match(/<span class="text-gray-darken-1" style="display: flex[^"]*">.*?<\/span>/g) ?? []
      expect(rows).toEqual([
        '<span class="text-gray-darken-1" style="display: flex; margin-bottom: 12px">&lt;b&gt;Akismet&lt;/b&gt;</span>',
        '<span class="text-gray-darken-1" style="display: flex">hello-dolly</span>',
      ])
    }
  })

  it('lists only the plugins with an update in the box of the mass update dialog', () => {
    const modal = buildMassUpdateModal(t, [
      plugin({ title: 'With update', update: 'available', update_version: '2.0' }),
      plugin({ name: 'quiet', title: 'Quiet', update: null }),
    ])

    const box = modal.props.targetBox ?? ''
    expect(box).toContain('With update')
    expect(box).not.toContain('Quiet')
  })

  it('lists every selected plugin that has an update, with its name escaped, and keeps the count key of the title', () => {
    const modal = buildMassUpdateModal(t, [
      plugin({ name: '<img onerror=x>', version: '1.0', update: 'available', update_version: '2.0' }),
      plugin({ name: 'quiet', update: null }),
      plugin({ name: 'no-version', update: 'available', update_version: null }),
    ])

    expect(modal.type).toBe('plugin-mass-update')
    expect(modal.props.title).toBe('heading.instance.plugin.update.title:{"count":3}')
    expect(modal.props.message).toContain('heading.instance.plugin.update.message.title:{"count":3}')
    const items = modal.props.message.match(/<li>.*?<\/li>/g) ?? []
    expect(items).toHaveLength(1)
    expect(items[0]).toContain('&lt;img onerror=x&gt;')
    expect(items[0]).not.toContain('<img')
    expect(items[0]).toContain('<b>1.0</b>')
    expect(items[0]).toContain('<b>2.0</b>')
    expect(modal.props.message).toContain('<ul style="margin-top: 24px">')
  })

  it('hides the list when no selected plugin has an update', () => {
    const modal = buildMassUpdateModal(t, [plugin()])

    expect(modal.props.message).toContain('<ul style="display: none"></ul>')
  })

  it('builds the mass delete dialog with the required confirm checkbox and the count', () => {
    const modal = buildMassDeleteModal(t, [plugin(), plugin({ name: 'b' })])

    expect(modal.type).toBe('plugin-mass-delete')
    expect(modal.props.confirmRequired).toBe(true)
    expect(modal.fields).toEqual([
      expect.objectContaining({ name: 'confirm', type: 'checkbox', required: true, label: 'form.confirmDelete.plugin:{"count":2}' }),
    ])
    expect(modal.props.buttons[0]).toMatchObject({ id: 'submit', label: 'button.delete', color: 'error' })
  })
})
