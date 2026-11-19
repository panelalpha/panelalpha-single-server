// English names of the project log actions (`activityLog.action.<action>`) that the backend does not translate yet.
// The panel records them in `ActivityActionMap.php` and in the controllers
// (`activity_action`), but `translation.json` knows only the actions of the old client area. Without these entries
// the Actions column showed the raw key `activityLog.action.user.instance.git.deploy`.
// The key from the API wins: this is only a `defaultValue`, until the backend adds the translations.
export const INSTANCE_LOG_ACTION_DEFAULTS: Readonly<Record<string, string>> = {
  // Projekt: deploy i pliki
  'user.instance.deploy': 'Initiated Deploy',
  'user.instance.deploy.upload': 'Uploaded Deploy Archive',
  'user.instance.redeploy': 'Initiated Redeploy',
  'user.instance.deploy_cancel': 'Cancelled Deploy',
  'user.instance.deploy_key': 'Generated Deploy Key',
  'user.instance.upload-files': 'Uploaded Files',
  'user.instance.preview-env-example': 'Previewed Env Example',

  // Projekt: Git
  'user.instance.test-git-url': 'Tested Git URL',
  'user.instance.git-branches': 'Listed Git Branches',
  'user.instance.git.connect': 'Connected Git Repository',
  'user.instance.git.disconnect': 'Disconnected Git Repository',
  'user.instance.git.update': 'Changed Git Branch',
  'user.instance.git.deploy': 'Initiated Git Deploy',
  'user.instance.git.deploy_key': 'Generated Git Deploy Key',
  'user.instance.git.deploy_key.delete': 'Deleted Git Deploy Key',
  'user.instance.git.auto_deploy': 'Changed Git Auto Deploy',
  'user.instance.git.credentials': 'Updated Git Credentials',
  'user.instance.git.pull': 'Pulled Git Changes',
  'user.instance.git.push': 'Pushed Git Changes',
  'user.instance.git.revert': 'Reverted Git Changes',
  'user.instance.git.repair': 'Repaired Git Repository',
  'user.instance.git.drift.ignore': 'Ignored Git Drift',

  // Projekt: import WordPressa
  'user.instance.import.test_wordpress_url': 'Tested WordPress URL',
  'user.instance.import.test_wordpress_connection': 'Tested WordPress Connection',
  'user.instance.import.download_plugin': 'Downloaded Import Plugin',
  'user.instance.import.create_domain': 'Created Import Domain',

  // Projekt: DNS, staging, WordPress, logowanie
  'user.instance.dns.enable_alerts': 'Enabled DNS Alerts',
  'user.instance.dns.disable_alerts': 'Disabled DNS Alerts',
  'user.instance.staging.push_to_staging': 'Initiated Pushing Live To Staging',
  'user.instance.wordpress.preview': 'Previewed WordPress',
  'user.instance.create_sso_preview_url': 'Logged In To WP Admin Preview',
  'user.instance.user.create_sso_url': 'Logged In As User',
  'user.instance.user.create_sso_preview_url': 'Logged In As User Preview',
  'user.instance.user.create': 'Created User',
  'user.instance.user.delete': 'Deleted User',
  'user.instance.user.reset_password': 'Reset User Password',

  // Hosting projektu
  'user.hosting.domain.set_php_version': 'Changed PHP Version',
  'user.hosting.domain.set_php_settings': 'Changed PHP Settings',
  'user.hosting.domain.set_as_primary': 'Set Domain As Primary',
  'user.hosting.ssl_certificate.retry': 'Retried SSL Certificate',
  'user.hosting.domain_ssl_settings.update': 'Updated Domain SSL Settings',
  'user.hosting.sftp_account.disconnect_all': 'Disconnected All SFTP Sessions',
  'user.hosting.sftp_account.set_access_type': 'Changed SFTP Access Type',
  'user.hosting.mysql.create_phpmyadmin_sso_url': 'Logged In To phpMyAdmin',
  'user.hosting.mysql.create_phpmyadmin_preview_sso_url': 'Logged In To phpMyAdmin Preview',
  'user.hosting.env_file.update': 'Updated Env File',
  'user.hosting.env_file.update.project': 'Updated Env File',
  'user.hosting.service_container.project_action': 'Ran Container Action',
  'user.hosting.service_container.service_action': 'Ran Container Service Action',
  'user.hosting.proxy_rule.create': 'Created Public URL',
  'user.hosting.proxy_rule.update': 'Updated Public URL',
  'user.hosting.proxy_rule.delete': 'Deleted Public URL',
  'user.service.domain.create': 'Created Service Domain',

  // File manager
  'user.hosting.file_manager.upload': 'Uploaded File',
  'user.hosting.file_manager.delete': 'Deleted File',
  'user.hosting.file_manager.paste': 'Pasted File',
  'user.hosting.file_manager.rename': 'Renamed File',
  'user.hosting.file_manager.create-directory': 'Created Directory',
  'user.hosting.file_manager.create-file': 'Created File',
  'user.hosting.file_manager.update-file': 'Updated File',
  'user.hosting.file_manager.zip': 'Compressed Files',
  'user.hosting.file_manager.unzip': 'Extracted Archive',

  // Sharing (edition-pro)
  'user.instance.shared_access.list': 'Listed Shared Access',
  'user.instance.shared_access.list_invitation_suggestions': 'Listed Invitation Suggestions',
}

/** `user.instance.git-branches` → `User Instance Git Branches` (an unknown action with no translation and no entry above). */
export function prettifyAction (action: string): string {
  return action
    .replaceAll(/[._-]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
