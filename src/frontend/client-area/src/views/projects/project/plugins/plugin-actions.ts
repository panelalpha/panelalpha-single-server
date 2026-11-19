import type { Translate } from '@/shared/ui/modal/action-modal'
import type { ActionModal } from '@/entities/project/action-modal'
import type { InstalledPlugin, RepositoryPlugin } from '@/entities/project/instance-plugins.api'
import { targetItemBox, targetItemRatingBox, targetListBox } from '@/entities/project/target-item-box'
import { decodeEntities } from '@/shared/format/decode-entities'
import { escapeHtml } from '@/shared/format/escape-html'
import { cancelButton, MODAL_WIDTH } from '@/shared/ui/modal/action-modal'

// The single-plugin dialogs and the mass ones of the selection (`plugin-mass-*`).
// The dialog markup is `BasicModal`; the names and versions from the API go into its `v-html` message, so they are escaped here.

function pluginLabel (plugin: InstalledPlugin): string {
  return escapeHtml(plugin.title || plugin.name)
}

function pluginLabels (plugins: InstalledPlugin[]): string[] {
  return plugins.map(plugin => pluginLabel(plugin))
}

export function buildActivateModal (t: Translate, _plugin: InstalledPlugin): ActionModal {
  return {
    type: 'plugin-activate',
    props: {
      title: t('heading.instance.plugin.activate.title', { count: 1 }),
      message: t('heading.instance.plugin.activate.info', { count: 1 }),
      icon: '$activate',
      buttons: [{ id: 'submit', label: t('button.activate'), color: 'primary' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

/**
 * The short description as the message, and the plugin name in a grey box with
 * its rating. The rating is the kit star and the number (`targetRatingBox`, rendered by `BasicModal`; the `targetBox` HTML cannot carry a component).
 * Legacy put both catalogue values in `v-html` raw; here their entities are decoded first and the text is escaped, so `&#8211;` shows as
 * a dash and markup does not run.
 */
export function buildInstallModal (t: Translate, plugin: RepositoryPlugin): ActionModal {
  const name = escapeHtml(decodeEntities(plugin.name))
  return {
    type: 'plugin-install',
    props: {
      title: t('heading.instance.plugin.install.title'),
      message: `${escapeHtml(decodeEntities(plugin.short_description ?? ''))}`,
      // The box is outside the message paragraph, as in legacy.
      // With a rating, `BasicModal` renders the box itself, with the kit star before the number.
      ...(plugin.rating
        ? { targetRatingBox: targetItemRatingBox(name, plugin.rating) }
        : { targetBox: targetItemBox(name) }),
      icon: '$restorebackup',
      buttons: [{ id: 'submit', label: t('button.install'), color: 'primary' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

export function buildDeactivateModal (t: Translate, _plugin: InstalledPlugin): ActionModal {
  return {
    type: 'plugin-deactivate',
    props: {
      title: t('heading.instance.plugin.deactivate.title', { count: 1 }),
      message: t('heading.instance.plugin.deactivate.message', { count: 1 }),
      icon: '$alertwarning',
      color: 'error',
      buttons: [{ id: 'submit', label: t('button.deactivate'), color: 'error' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

/** The message names the version the update brings. */
export function buildUpdateModal (t: Translate, plugin: InstalledPlugin): ActionModal {
  return {
    type: 'plugin-update',
    props: {
      title: t('heading.instance.plugin.update.title', { count: 1 }),
      message: t('heading.instance.plugin.update.message_one', { count: 1, version: escapeHtml(String(plugin.update_version ?? '')) }),
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
 * The plugin box under the message and a required confirm checkbox that
 * gates the delete button (`BasicModal.buttonState`, fed by the host's `confirmed`).
 */
export function buildDeleteModal (t: Translate, plugin: InstalledPlugin): ActionModal {
  return {
    type: 'plugin-delete',
    props: {
      title: t('heading.instance.plugin.delete.title', { count: 1 }),
      message: `${t('heading.instance.plugin.delete.message', { count: 1 })}`,
      // The name box is the legacy custom slot after the message, not part of the `<p>` (as the install and mass update dialogs).
      targetBox: targetItemBox(pluginLabel(plugin)),
      icon: '$alertwarning',
      color: 'error',
      buttons: [{ id: 'submit', label: t('button.delete'), color: 'error' }, cancelButton(t)],
      confirmRequired: true,
    },
    fields: [
      {
        message: `<b>${t('message.confirmAction')}</b>`,
        label: t('form.confirmDelete.plugin', { count: 1 }),
        name: 'confirm',
        type: 'checkbox',
        required: true,
      },
    ],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

// MASS DIALOGS (the selection of the Plugins screen). The count is the number of the selected plugins.

export function buildMassActivateModal (t: Translate, plugins: InstalledPlugin[]): ActionModal {
  const count = plugins.length
  return {
    type: 'plugin-mass-activate',
    props: {
      title: t('heading.instance.plugin.activate.title', { count }),
      message: t('heading.instance.plugin.activate.info', { count }),
      icon: '$activate',
      buttons: [{ id: 'submit', label: t('button.activate'), color: 'primary' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

/**
 * The mass dialog uses the `$disable` icon (the single one
 * `$alertwarning`) and lists the selected plugins in the box (`modalOptions.item = items`).
 */
export function buildMassDeactivateModal (t: Translate, plugins: InstalledPlugin[]): ActionModal {
  const count = plugins.length
  return {
    type: 'plugin-mass-deactivate',
    props: {
      title: t('heading.instance.plugin.deactivate.title', { count }),
      message: `${t('heading.instance.plugin.deactivate.message', { count })}${targetListBox(pluginLabels(plugins))}`,
      icon: '$disable',
      color: 'error',
      buttons: [{ id: 'submit', label: t('button.deactivate'), color: 'error' }, cancelButton(t)],
      confirmRequired: false,
    },
    fields: [],
    width: MODAL_WIDTH,
    persistent: false,
  }
}

/**
 * One `<li>` per selected plugin that has an update with a version
 * (`heading.instance.plugin.update.message.content`). Names and versions are escaped, the `<b>` wrappers stay as legacy wrote them. The
 * box lists the plugins that have an update (`modalOptions.item = items.filter(update == 'available')`).
 */
export function buildMassUpdateModal (t: Translate, plugins: InstalledPlugin[]): ActionModal {
  const count = plugins.length
  const rows = plugins
    .filter(plugin => plugin.update === 'available' && plugin.update_version)
    .map(plugin => `<li>${t('heading.instance.plugin.update.message.content', {
      plugin: `<b class="capitalize">${escapeHtml(plugin.name)}</b>`,
      version: `<b>${escapeHtml(String(plugin.version))}</b>`,
      updateVersion: `<b>${escapeHtml(String(plugin.update_version))}</b>`,
    })}</li>`)
    .join('')

  return {
    type: 'plugin-mass-update',
    props: {
      title: t('heading.instance.plugin.update.title', { count }),
      // Inline `style` in the HTML of the `v-html` of BasicModal (as above): 1:1 with legacy (`margin-top: 24px` / `display: none`), no colours.
      message: `${t('heading.instance.plugin.update.message.title', { count })}`
        + `<ul style="${rows ? 'margin-top: 24px' : 'display: none'}">${rows}</ul>`,
      // The name box is the custom slot after the message in legacy (`modalOptions.item`), not part of the `<p>` (as the install dialog).
      targetBox: targetListBox(pluginLabels(plugins.filter(plugin => plugin.update === 'available'))),
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
 * The selected plugins in the box (`modalOptions.item = items`) and the
 * same confirm checkbox as the single delete, with the count.
 */
export function buildMassDeleteModal (t: Translate, plugins: InstalledPlugin[]): ActionModal {
  const count = plugins.length
  return {
    type: 'plugin-mass-delete',
    props: {
      title: t('heading.instance.plugin.delete.title', { count }),
      message: `${t('heading.instance.plugin.delete.message', { count })}`,
      targetBox: targetListBox(pluginLabels(plugins)),
      icon: '$alertwarning',
      color: 'error',
      buttons: [{ id: 'submit', label: t('button.delete'), color: 'error' }, cancelButton(t)],
      confirmRequired: true,
    },
    fields: [
      {
        message: `<b>${t('message.confirmAction')}</b>`,
        label: t('form.confirmDelete.plugin', { count }),
        name: 'confirm',
        type: 'checkbox',
        required: true,
      },
    ],
    width: MODAL_WIDTH,
    persistent: false,
  }
}
