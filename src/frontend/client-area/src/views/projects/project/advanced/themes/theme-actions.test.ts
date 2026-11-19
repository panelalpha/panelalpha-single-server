import type { InstalledTheme, RepositoryTheme } from '@/entities/project/instance-themes.api'
import { describe, expect, it } from 'vitest'
import { buildActivateModal, buildDeleteModal, buildInstallModal, buildMassDeleteModal, buildMassUpdateModal, buildUpdateModal } from './theme-actions'

const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key)

function theme (overrides: Partial<InstalledTheme> = {}): InstalledTheme {
  return { name: 'twentytwentyfour', title: 'Twenty Twenty-Four', description: '', version: '1.0', status: 'inactive', ...overrides }
}

describe('theme-actions builders', () => {
  it('builds the activate dialog with the primary button, the theme box and no fields', () => {
    const modal = buildActivateModal(t, theme())

    expect(modal.type).toBe('theme-activate')
    expect(modal.props.title).toBe('heading.instance.advanced.theme.modal.activate.title:{"count":1}')
    expect(modal.props.message).toMatch(/^heading\.instance\.advanced\.theme\.modal\.activate\.info:\{"count":1\}$/)
    expect(modal.props.targetBox).toMatch(/^<span class="target-item-box"/)
    expect(modal.props.icon).toBe('$activate')
    expect(modal.props.buttons[0]).toMatchObject({ id: 'submit', label: 'button.activate', color: 'primary' })
    expect(modal.props.buttons[1]).toMatchObject({ id: 'cancel', label: 'button.cancel', type: 'cancel' })
    expect(modal.fields).toEqual([])
    expect(modal.props.confirmRequired).toBe(false)
    expect(modal.width).toBe('560px')
    expect(modal.persistent).toBe(false)
  })

  it('puts the theme box with the gray-lighten2 border in every single dialog', () => {
    for (const modal of [buildActivateModal(t, theme()), buildUpdateModal(t, theme()), buildDeleteModal(t, theme())]) {
      expect(modal.props.targetBox).toContain('class="target-item-box"')
      expect(modal.props.targetBox).toContain('border: 1px solid var(--v-gray-lighten2)')
      expect(modal.props.targetBox).not.toContain('var(--v-gray-lighten3)')
    }
  })

  it('names the theme by its title and falls back to the name when the title is empty', () => {
    expect(buildActivateModal(t, theme()).props.targetBox).toContain('>Twenty Twenty-Four</span>')
    expect(buildActivateModal(t, theme({ title: '' })).props.targetBox).toContain('>twentytwentyfour</span>')
  })

  it('decodes the API entities of the name, then escapes the text, so no markup reaches the box', () => {
    const decoded = buildActivateModal(t, theme({ title: 'Twenty &#8211; Five &amp; Co' })).props.targetBox
    expect(decoded).toContain('>Twenty – Five &amp; Co</span>')

    // `&lt;b&gt;` decodes to the text `<b>`, which the escape turns back into characters.
    const escaped = buildActivateModal(t, theme({ title: 'Fish &amp; Chips &lt;b&gt;' })).props.targetBox
    expect(escaped).toContain('>Fish &amp; Chips &lt;b&gt;</span>')
    expect(escaped).not.toContain('<b>')
  })

  it('drops a markup title to its text (decodeEntities), so the box carries no tag or handler', () => {
    const modal = buildDeleteModal(t, theme({ title: '<img src=x onerror=alert(1)>' }))

    expect(modal.props.targetBox).toContain('class="target-item-box"')
    expect(modal.props.targetBox).not.toContain('<img')
    expect(modal.props.targetBox).not.toContain('onerror')
  })

  it('shows the version the update brings in the update message, escaped', () => {
    const modal = buildUpdateModal(t, theme({ update: 'available', update_version: '<2.0>' }))

    expect(modal.type).toBe('theme-update')
    expect(modal.props.title).toBe('heading.instance.advanced.theme.modal.update.title:{"count":1}')
    expect(modal.props.message).toMatch(/^heading\.instance\.advanced\.theme\.modal\.update\.info\.one:\{"version":"&lt;2\.0&gt;"\}/)
    expect(modal.props.icon).toBe('$update')
    expect(modal.props.buttons[0]).toMatchObject({ id: 'submit', label: 'button.update', color: 'primary' })
  })

  it('builds the delete dialog with the warning icon, the error colour and a required confirm checkbox that gates the button', () => {
    const modal = buildDeleteModal(t, theme())

    expect(modal.type).toBe('theme-delete')
    expect(modal.props.title).toBe('heading.instance.advanced.theme.modal.delete.title:{"count":1}')
    expect(modal.props.message).toMatch(/^heading\.instance\.advanced\.theme\.modal\.delete\.info:\{"count":1\}$/)
    expect(modal.props.targetBox).toMatch(/^<span class="target-item-box"/)
    expect(modal.props.icon).toBe('$alertwarning')
    expect(modal.props.color).toBe('error')
    expect(modal.props.confirmRequired).toBe(true)
    expect(modal.props.buttons[0]).toMatchObject({ id: 'submit', label: 'button.delete', color: 'error' })
    expect(modal.fields).toEqual([
      {
        message: '<b>message.confirmAction</b>',
        label: 'form.confirmDelete.theme:{"count":1}',
        name: 'confirm',
        type: 'checkbox',
        required: true,
      },
    ])
  })
})

describe('theme-actions mass builders', () => {
  it('builds the mass update dialog with one list item per theme that has an update version, and the update icon', () => {
    const modal = buildMassUpdateModal(t, [
      theme({ name: 'astra', version: '4.0', update: 'available', update_version: '4.1' }),
      theme({ name: 'blocksy', version: '2.0' }),
    ])

    expect(modal.type).toBe('theme-mass-update')
    expect(modal.props.title).toBe('heading.instance.advanced.theme.modal.update.title:{"count":2}')
    expect(modal.props.message).toMatch(/^heading\.instance\.advanced\.theme\.modal\.update\.info\.other\.title<ul style="margin-top: 24px">/)
    expect(modal.props.message.match(/<li>/g)).toHaveLength(1)
    expect(modal.props.message).toContain('heading.instance.advanced.theme.modal.update.info.other.content:')
    expect(modal.props.message).toContain(String.raw`"theme":"<b class=\"capitalize\">astra</b>"`)
    expect(modal.props.message).toContain('"updateVersion":"<b>4.1</b>"')
    expect(modal.props.icon).toBe('$update')
    expect(modal.props.buttons[0]).toMatchObject({ id: 'submit', label: 'button.update', color: 'primary' })
    expect(modal.props.confirmRequired).toBe(false)
    expect(modal.fields).toEqual([])
  })

  it('hides the list when no selected theme has an update version, and still lists the selection in the box', () => {
    const modal = buildMassUpdateModal(t, [theme({ name: 'astra' }), theme({ name: 'blocksy' })])

    expect(modal.props.message).toContain('<ul style="display: none"></ul>')
    expect(modal.props.message).not.toContain('<li>')
    expect(modal.props.targetBox).toContain('class="target-item-box flex-column"')
    expect(modal.props.targetBox).toContain('>Twenty Twenty-Four</span>')
  })

  it('escapes the names and versions of the mass update list', () => {
    const modal = buildMassUpdateModal(t, [theme({ name: '<img src=x onerror=alert(1)>', version: '<1>', update_version: '<2>' })])

    expect(modal.props.message).not.toContain('<img')
    expect(modal.props.message).not.toContain('onerror=alert(1)>')
    expect(modal.props.message).toContain('&lt;1&gt;')
    expect(modal.props.message).toContain('&lt;2&gt;')
  })

  it('builds the mass delete dialog with the warning icon, the error colour, the count and a required confirm checkbox', () => {
    const modal = buildMassDeleteModal(t, [theme({ name: 'astra' }), theme({ name: 'blocksy' })])

    expect(modal.type).toBe('theme-mass-delete')
    expect(modal.props.title).toBe('heading.instance.advanced.theme.modal.delete.title:{"count":2}')
    expect(modal.props.message).toMatch(/^heading\.instance\.advanced\.theme\.modal\.delete\.info:\{"count":2\}$/)
    expect(modal.props.targetBox).toMatch(/^<span class="target-item-box flex-column"/)
    expect(modal.props.icon).toBe('$alertwarning')
    expect(modal.props.color).toBe('error')
    expect(modal.props.confirmRequired).toBe(true)
    expect(modal.props.buttons[0]).toMatchObject({ id: 'submit', label: 'button.delete', color: 'error' })
    expect(modal.fields).toEqual([
      {
        message: '<b>message.confirmAction</b>',
        label: 'form.confirmDelete.theme:{"count":2}',
        name: 'confirm',
        type: 'checkbox',
        required: true,
      },
    ])
  })
})

describe('theme-actions install builder', () => {
  function catalogue (overrides: Partial<RepositoryTheme> = {}): RepositoryTheme {
    return { id: 1, slug: 'astra', name: 'Astra', version: '4.0', rating: 90, description: 'A fast theme.', ...overrides }
  }

  it('builds the install dialog with the primary button, no icon and no fields', () => {
    const modal = buildInstallModal(t, catalogue())

    expect(modal.type).toBe('theme-install')
    expect(modal.props.title).toBe('heading.instance.advanced.theme.modal.install.title')
    expect(modal.props.icon).toBe('')
    expect(modal.props.buttons[0]).toMatchObject({ id: 'submit', label: 'button.install', color: 'primary' })
    expect(modal.props.buttons[1]).toMatchObject({ id: 'cancel', label: 'button.cancel', type: 'cancel' })
    expect(modal.props.confirmRequired).toBe(false)
    expect(modal.fields).toEqual([])
    expect(modal.width).toBe('560px')
    expect(modal.persistent).toBe(false)
  })

  it('puts the description into the install text and the name into the grey box', () => {
    const modal = buildInstallModal(t, catalogue())

    expect(modal.props.message).toMatch(/^heading\.instance\.advanced\.theme\.modal\.install\.info:\{"theme":"A fast theme\."\}$/)
    expect(modal.props.targetRatingBox?.labelHtml).toBe('Astra')
    expect(modal.props.targetRatingBox).toMatchObject({ border: 'gray-lighten2', flat: true })
  })

  it('shows the rating out of five in the grey box only when the theme has a rating', () => {
    // The star and the number are rendered by `BasicModal` from `targetRatingBox`.
    expect(buildInstallModal(t, catalogue()).props.targetRatingBox).toMatchObject({ labelHtml: 'Astra', rating: '4.5', percent: 0.9 })
    expect(buildInstallModal(t, catalogue()).props.targetBox).toBeUndefined()
    const plain = buildInstallModal(t, catalogue({ rating: null })).props
    expect(plain.targetRatingBox).toBeUndefined()
    expect(plain.targetBox).toContain('>Astra</span>')
  })

  it('uses the no-description text when the theme has no description', () => {
    const modal = buildInstallModal(t, catalogue({ description: '' }))

    expect(modal.props.message).toContain('"theme":"message.theme.noDescription"')
  })

  it('decodes the entities of the name and the description, drops their markup and escapes the text', () => {
    const modal = buildInstallModal(t, catalogue({ name: 'Ace &#8211; <img src=x>', description: 'Ships &amp; <b>bold</b>' }))

    expect(modal.props.message).toContain('"theme":"Ships &amp; bold"')
    expect(modal.props.targetRatingBox?.labelHtml).toBe('Ace – ')
    expect(modal.props.targetRatingBox?.labelHtml).not.toContain('<img')
    expect(modal.props.message).not.toContain('<b>')
  })
})
