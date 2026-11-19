import type { Translate } from '@/shared/ui/modal/action-modal'
import type { ActionModal } from '@/entities/project/action-modal'
import type { InstalledTheme, RepositoryTheme } from '@/entities/project/instance-themes.api'
import { targetItemBox, targetItemRatingBox, targetListBox } from '@/entities/project/target-item-box'
import { decodeEntities } from '@/shared/format/decode-entities'
import { escapeHtml } from '@/shared/format/escape-html'
import { cancelButton, MODAL_WIDTH } from '@/shared/ui/modal/action-modal'

// The single-theme dialogs. Each one shows the theme in a grey box under the message (`target-item-box` with the `gray-lighten2` border).
// The name comes from the API into `v-html`, so it is decoded and escaped here.

function themeLabel (theme: InstalledTheme): string {
  return escapeHtml(decodeEntities(theme.title || theme.name))
}

function themeLabels (themes: InstalledTheme[]): string[] {
  return themes.map(theme => themeLabel(theme))
}

/**
 * No icon. The message is `install.info`, with the catalogue description in its `{{theme}}`
 * (or the no-description text), and the theme name in the grey box. Legacy put the description in raw; here it is decoded and escaped.
 * The box shows the star and the rating out of five when the theme has one (`targetRatingBox`).
 */
export function buildInstallModal (t: Translate, theme: RepositoryTheme): ActionModal {
  const description = escapeHtml(decodeEntities(theme.description || t('message.theme.noDescription')))
  const name = escapeHtml(decodeEntities(theme.name))
  return {
    type: 'theme-install',
    props: {
      title: t('heading.instance.advanced.theme.modal.install.title'),
      message: t('heading.instance.advanced.theme.modal.install.info', { theme: description }),
      // With a rating the box carries the star and the number (`BasicModal`).
      ...(theme.rating
        ? { targetRatingBox: targetItemRatingBox(name, theme.rating, 'gray-lighten2', true) }
        : { targetBox: targetItemBox(name, '', 'gray-lighten2', true) }),
      icon: '',
      buttons: [{ id: 'submit', label: t('button.install'), color: 'primary' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

export function buildActivateModal (t: Translate, theme: InstalledTheme): ActionModal {
  return {
    type: 'theme-activate',
    props: {
      title: t('heading.instance.advanced.theme.modal.activate.title', { count: 1 }),
      message: t('heading.instance.advanced.theme.modal.activate.info', { count: 1 }),
      targetBox: targetItemBox(themeLabel(theme), '', 'gray-lighten2', true),
      icon: '$activate',
      buttons: [{ id: 'submit', label: t('button.activate'), color: 'primary' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

/** The message names the version the update brings (`info.one`). */
export function buildUpdateModal (t: Translate, theme: InstalledTheme): ActionModal {
  return {
    type: 'theme-update',
    props: {
      title: t('heading.instance.advanced.theme.modal.update.title', { count: 1 }),
      message: t('heading.instance.advanced.theme.modal.update.info.one', { version: escapeHtml(String(theme.update_version ?? '')) }),
      targetBox: targetItemBox(themeLabel(theme), '', 'gray-lighten2', true),
      icon: '$update',
      buttons: [{ id: 'submit', label: t('button.update'), color: 'primary' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

/**
 * The `$alertwarning` icon, the theme box under the message and a required confirm
 * checkbox that gates the delete button (`BasicModal.buttonState`, fed by the host's `confirmed`).
 */
export function buildDeleteModal (t: Translate, theme: InstalledTheme): ActionModal {
  return {
    type: 'theme-delete',
    props: {
      title: t('heading.instance.advanced.theme.modal.delete.title', { count: 1 }),
      message: t('heading.instance.advanced.theme.modal.delete.info', { count: 1 }),
      targetBox: targetItemBox(themeLabel(theme), '', 'gray-lighten2', true),
      icon: '$alertwarning',
      color: 'error',
      buttons: [{ id: 'submit', label: t('button.delete'), color: 'error' }, cancelButton(t)],
      confirmRequired: true,
    },
    fields: [
      {
        message: `<b>${t('message.confirmAction')}</b>`,
        label: t('form.confirmDelete.theme', { count: 1 }),
        name: 'confirm',
        type: 'checkbox',
        required: true,
      },
    ],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

// MASS DIALOGS (the selection of the Themes screen). The count is the number of the selected themes.

/**
 * One `<li>` per selected theme that has an update version
 * (`heading.instance.advanced.theme.modal.update.info.other.content`). Names and versions are escaped, the `<b>` wrappers stay as legacy
 * wrote them. The box lists every selected theme, as legacy did.
 */
export function buildMassUpdateModal (t: Translate, themes: InstalledTheme[]): ActionModal {
  const count = themes.length
  const rows = themes
    .filter(theme => theme.update_version)
    .map(theme => `<li>${t('heading.instance.advanced.theme.modal.update.info.other.content', {
      theme: `<b class="capitalize">${escapeHtml(theme.name)}</b>`,
      version: `<b>${escapeHtml(String(theme.version))}</b>`,
      updateVersion: `<b>${escapeHtml(String(theme.update_version))}</b>`,
    })}</li>`)
    .join('')

  return {
    type: 'theme-mass-update',
    props: {
      title: t('heading.instance.advanced.theme.modal.update.title', { count }),
      message: `${t('heading.instance.advanced.theme.modal.update.info.other.title')}`
        + `<ul style="${rows ? 'margin-top: 24px' : 'display: none'}">${rows}</ul>`,
      targetBox: targetListBox(themeLabels(themes), 'gray-lighten2', true),
      icon: '$update',
      buttons: [{ id: 'submit', label: t('button.update'), color: 'primary' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

/**
 * The selected themes in the box and the same required confirm checkbox as the
 * single delete, with the count.
 */
export function buildMassDeleteModal (t: Translate, themes: InstalledTheme[]): ActionModal {
  const count = themes.length
  return {
    type: 'theme-mass-delete',
    props: {
      title: t('heading.instance.advanced.theme.modal.delete.title', { count }),
      message: `${t('heading.instance.advanced.theme.modal.delete.info', { count })}`,
      targetBox: targetListBox(themeLabels(themes), 'gray-lighten2', true),
      icon: '$alertwarning',
      color: 'error',
      buttons: [{ id: 'submit', label: t('button.delete'), color: 'error' }, cancelButton(t)],
      confirmRequired: true,
    },
    fields: [
      {
        message: `<b>${t('message.confirmAction')}</b>`,
        label: t('form.confirmDelete.theme', { count }),
        name: 'confirm',
        type: 'checkbox',
        required: true,
      },
    ],
    width: MODAL_WIDTH,
    persistent: false,
  }
}
