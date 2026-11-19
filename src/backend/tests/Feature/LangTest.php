<?php

namespace Tests\Feature;

use PanelAlpha\ClientArea\Access\Privileges;
use PanelAlpha\Community\Http\Requests\SettingsUrlRequest;
use Tests\TestCase;

/**
 * @see packages/api/routes/api.php (old /{lang}/translation.json, user.app.lang)
 * @see packages/client-area/src/router/fetchData.js (translation load)
 */
class LangTest extends TestCase
{
    public function test_english_translation_json_is_served_with_single_server_overlay(): void
    {
        // CA: packages/client-area/src/i18n.js:80 (`axios.get(`${apiUrl}/${lang}/translation.json`)`)
        $response = $this->getJson('/api/en/translation.json');

        // CA reads: packages/client-area/src/i18n.js:80 (the CA loads the translation bundle into i18next)
        $response
            ->assertOk()
            ->assertJsonPath('heading.onboarding.zipDeploy.title', 'Upload your project')
            ->assertJsonStructure([
                'heading',
                'notification',
                'form',
            ]);
    }

    /**
     * The keys the old panel's bundle had and v1's copy missed (live check on
     * test-host.example.com, 2026-10-16: a paired Community panel showed the raw
     * `button.signInWithPanelAlpha`): the Hub login button and its invalid-link
     * page, the paid edition's Admin Area dropdown and the activity entry of a
     * Hub sign-in. Texts from packages/api/resources/lang/en/clientarea/translation.json.
     *
     * Each key is its nesting in the bundle (a segment may itself contain a
     * dot, as i18next resolves `heading.hubLoginPage.invalid`).
     *
     * @return array<string, array{list<string>, string}>
     */
    public static function hubAndPaidKeys(): array
    {
        return [
            // CA reads: packages/client-area/src/views/Login.vue:387
            'Hub login button' => [['button', 'signInWithPanelAlpha'], 'Sign in with PanelAlpha'],
            // CA reads: packages/client-area/src/views/HubLogin.vue:30
            'Hub invalid link' => [['heading', 'hubLoginPage.invalid'], 'This login link is not valid any more. Log in again from PanelAlpha.'],
            'Full server management' => [['button', 'fullServerManagement'], 'Full Server Management'],
            'Admin Area dropdown' => [['appSingleServer', 'adminAreaDropdown', 'goTo'], 'Go to Admin Area'],
            'Admin Area dropdown tasks' => [['appSingleServer', 'adminAreaDropdown', 'tasks'], 'Tasks'],
            'Hub sign-in activity' => [['activityLog', 'action', 'user.login_from_hub'], 'Logged In From PanelAlpha'],
            // client-area-next (native file manager, first-run wizard, chunk error alert): keys the new client area reads.
            'File manager button' => [['button', 'fileManager.upload'], 'Upload'],
            'File manager message' => [['message', 'fileManager.uploaded'], 'All files uploaded!'],
            'Wizard step label' => [['setup', 'wizard.steps.signIn'], 'Sign in'],
            'Page load failed alert' => [['message', 'alertManager', 'pageLoadFailed'], 'We could not load this page. Check your internet connection and refresh the page. If the problem stays, the application may have been updated: refreshing loads the new version.'],
            // Log tables (Logs page): column headers.
            'Log table time header' => [['table', 'header', 'time'], 'Time'],
            'Log table level header' => [['table', 'header', 'level'], 'Level'],
            'Log table message header' => [['table', 'header', 'message'], 'Message'],
            'Log table stage header' => [['table', 'header', 'stage'], 'Stage'],
            'Log table request header' => [['table', 'header', 'request'], 'Request'],
            // Containers page: the confirmation of an action that stops or recreates containers.
            'Containers restart confirmation' => [['heading', 'hosting', 'containers.confirm.restart.title'], 'Restart all containers?'],
            'Containers stop confirmation' => [['heading', 'hosting', 'containers.confirm.stop.title'], 'Stop all containers?'],
            'Containers pull confirmation' => [['heading', 'hosting', 'containers.confirm.pull.title'], 'Pull images and redeploy?'],
            'Container stop confirmation' => [['heading', 'hosting', 'containers.confirm.serviceStop.title'], 'Stop {{service}}?'],
            'Container restart confirmation' => [['heading', 'hosting', 'containers.confirm.serviceRestart.title'], 'Restart {{service}}?'],
            'Public URL remove confirmation' => [['heading', 'hosting', 'containers.confirm.removeUrl.title'], 'Remove the public URL?'],
            // Cron jobs of a container project: the service a job runs in.
            'Cron service label' => [['form', 'label', 'service'], 'Service'],
            'Cron service column' => [['table', 'header', 'service'], 'Service'],
            'Cron service tooltip' => [['tooltip', 'add_cron_job.service'], 'Select the container service the command runs in. A run is skipped while that service is not running.'],
            // Cron jobs of a container project without containers: Add is disabled with the reason.
            'Cron no services message' => [['message', 'hosting', 'cron', 'noServices'], 'This project has no container services yet. Deploy or start the project, then add a cron job.'],
            // Two-Factor Authentication: the backup codes could not be loaded after the code was confirmed (My Account modal).
            'Two-Factor recovery codes message' => [['message', 'account', '2fa', 'recoveryCodesFailed'], 'Two-Factor Authentication is on, but your backup codes could not be loaded. Try again; if it keeps failing, turn Two-Factor Authentication off and on again to get a new set.'],
            'SSL certificate card subtitle' => [['heading', 'instance', 'advanced.security.certificate.subtitle'], 'The SSL certificate this domain uses.'],
            'Max length validation' => [['form', 'validation', 'maxLength'], '{{field}} must be at most {{length}} characters long'],
            'FTP add modal title' => [['heading', 'hosting', 'ftp.modal.add.title'], 'Add FTP Account'],
            'SFTP add modal title' => [['heading', 'hosting', 'sftp.modal.add.title'], 'Add SFTP Account'],
            'SSH add modal title' => [['heading', 'hosting', 'ssh.modal.add.title'], 'Add SSH Account'],
            'Database add modal title' => [['heading', 'hosting', 'databases.modal.database.add.title'], 'Add Database'],
            'Env file page title' => [['title', 'env-file'], '{{- app_name}}: {{instance_name}} - Environment Variables'],
            'Connect AI token step' => [['heading', 'connectAi', 'instructions.replaceToken'], 'Replace YOUR_TOKEN with your token. If you do not have one, use Create Token above.'],
            'Git deploy subtitle' => [['heading', 'onboarding', 'gitDeploy', 'subtitle'], 'Connect a repository to create a project'],
            'No installation type info' => [['heading', 'onboarding', 'noInstallationType.info'], 'You cannot install a project at this time. Please contact support for more details.'],
            'Empty project list subtitle' => [['message', 'emptyTable', 'instances.subtitle'], 'No projects available. Please create a project to start building your website.'],
            'Git connect subtitle' => [['heading', 'instance', 'advanced.git.connect.subtitle'], 'Link this project to a Git repository (GitHub, GitLab, or Bitbucket).'],
            'Details card name label' => [['heading', 'instance', 'advanced.siteDetails.card.site.siteName'], 'Project Name'],
            'Onboarding site name label stays' => [['form', 'label', 'siteName'], 'Site Name'],
            'Files deploy subtitle' => [['heading', 'onboarding', 'zipDeploy', 'subtitle'], 'Upload one .zip or .tar.gz archive with your project files.'],
            'Files deploy drop zone title' => [['heading', 'onboarding', 'zipDeploy', 'dropZone', 'title'], 'Drop your project archive here'],
            'Files deploy drop zone hint' => [['heading', 'onboarding', 'zipDeploy', 'dropZone', 'hint'], 'or click to browse (.zip or .tar.gz), up to {{size}}'],
            'Files deploy invalid type' => [['heading', 'onboarding', 'zipDeploy', 'file', 'invalidType'], 'Allowed file types: .zip, .tar.gz'],
            'Files deploy one archive' => [['heading', 'onboarding', 'zipDeploy', 'file', 'maxSelections'], 'Add only one archive.'],
            'Files deploy empty' => [['heading', 'onboarding', 'zipDeploy', 'file', 'empty'], 'Please add a .zip or .tar.gz archive.'],
            'Files deploy read failed' => [['heading', 'onboarding', 'zipDeploy', 'file', 'readFailed'], 'Could not read the dropped file.'],
            'Files deploy upload hint' => [['heading', 'onboarding', 'zipDeploy', 'whatCanIUpload', 'backup', 'title'], 'An archive of your project'],
            // The deploy steps of a files project: the `cloning` stage unpacks the archive, there is no repository to clone.
            'Files deploy step label' => [['deployLogs', 'step', 'files'], 'Unpacking your files'],
            'Project list drop overlay' => [['heading', 'instance', 'dropOverlay', 'title'], 'Drop an archive with your application and launch!'],
            'Create project button' => [['button', 'website.create'], 'Create Project'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('hubAndPaidKeys')]
    /**
     * @param  list<string>  $segments
     */
    public function test_the_hub_login_and_paid_navigation_labels_are_served(array $segments, string $text): void
    {
        // CA: packages/client-area/src/i18n.js:80
        $bundle = $this->getJson('/api/en/translation.json')
            ->assertOk()
            ->json();

        // CA reads: packages/client-area/src/i18n.js:80 (the CA loads the translation bundle into i18next)
        $value = $bundle;
        foreach ($segments as $segment) {
            $value = is_array($value) ? ($value[$segment] ?? null) : null;
        }
        $this->assertSame($text, $value);
    }

    /**
     * The confirmation dialogs that read as a sentence ("are you sure that you want to ...") and the note under a
     * webserver log file the panel cannot preview.
     *
     * @return array<string, array{list<string>, string}>
     */
    public static function confirmationTexts(): array
    {
        return [
            // CA reads: src/views/account/profile/TwoFactorAuthDisableConfirmation.vue:8-15
            'Two-factor disable' => [['heading', 'accountPage', 'modal.disable2fa.info'], 'Are you sure that you want to disable Two-Factor Authentication?'],
            'Defensive mode' => [['heading', 'instance', 'advanced.edge-cache.modal.defensive-mode.info'], 'Are you sure that you want to enable Defensive Mode for {{value}}?'],
            'SFTP disconnect all' => [['heading', 'hosting', 'sftp.modal.disconnect.message'], 'Are you sure that you want to disconnect all SFTP users?'],
            'SSH disconnect all' => [['heading', 'hosting', 'ssh.modal.disconnect.message'], 'Are you sure that you want to disconnect all SSH users?'],
            // CA reads: src/views/projects/project/advanced/logs/LogsView.vue:409-410
            'Webserver log file download' => [['message', 'emptyTable', 'webserverLogs.downloadDescription'], 'Please download the log file to view its contents.'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('confirmationTexts')]
    /**
     * @param  list<string>  $segments
     */
    public function test_the_confirmation_dialogs_read_as_sentences(array $segments, string $text): void
    {
        // CA: packages/client-area/src/i18n.js:80 (the CA loads the translation bundle into i18next)
        $bundle = $this->getJson('/api/en/translation.json')
            ->assertOk()
            ->json();

        $value = $bundle;
        foreach ($segments as $segment) {
            $value = is_array($value) ? ($value[$segment] ?? null) : null;
        }
        $this->assertSame($text, $value);
    }

    /**
     * The Remove dialog of the Plugins screen is titled Delete, not like the Deactivate one.
     *
     * @see src/frontend/client-area/src/views/projects/project/plugins/plugin-actions.ts (buildDeleteModal, buildMassDeleteModal)
     */
    public function test_the_plugin_delete_dialogs_are_titled_delete(): void
    {
        // CA: packages/client-area/src/i18n.js:80
        $instance = $this->getJson('/api/en/translation.json')
            ->assertOk()
            ->json('heading.instance');

        $this->assertSame('Delete Plugin', $instance['plugin.delete.title_one']);
        $this->assertSame('Delete Plugins', $instance['plugin.delete.title_other']);
        $this->assertNotSame($instance['plugin.deactivate.title_one'], $instance['plugin.delete.title_one']);
    }

    /**
     * The Engine's copy task carries `details.action: "copy"` and `job_type: App\\Jobs\\CopyProject`; the Tasks view names it after the
     * action, so the bundle needs a name for it like for the other actions.
     *
     * @see src/frontend/client-area/src/views/account/tasks/tasks-table.ts (TASK_ACTIONS)
     */
    public function test_the_copy_task_action_has_a_name(): void
    {
        // CA: packages/client-area/src/i18n.js:80
        $actions = $this->getJson('/api/en/translation.json')
            ->assertOk()
            ->json('tasks.actions');

        $this->assertSame('Copy project', $actions['copy']);
    }

    public function test_the_engine_housekeeping_task_actions_have_names(): void
    {
        // CA: packages/client-area/src/i18n.js:80
        $actions = $this->getJson('/api/en/translation.json')
            ->assertOk()
            ->json('tasks.actions');

        $this->assertSame('Publish base image', $actions['operator_image_publish']);
        $this->assertSame('Refresh base image', $actions['operator_image_refresh']);
        $this->assertSame('Remove base image', $actions['operator_image_remove']);
        $this->assertSame('Build repository cache', $actions['build_cache_build']);
    }

    public function test_the_cancel_installation_dialog_talks_about_the_installation(): void
    {
        // CA: packages/client-area/src/i18n.js:80
        $instance = $this->getJson('/api/en/translation.json')
            ->assertOk()
            ->json('heading.instance');

        // CA reads: src/frontend/client-area/src/entities/project/ui/CancelInstallationDialog.vue (a dialog that is not an import)
        $this->assertSame('Cancel Installation', $instance['modal.cancelInstanceInstallation.title']);
        $this->assertStringNotContainsStringIgnoringCase('import', $instance['modal.cancelInstanceInstallation.desc']);
        $this->assertStringNotContainsStringIgnoringCase('import', $instance['modal.cancelInstanceInstallation.checkbox']);
        $this->assertStringContainsString('cancel the installation', $instance['modal.cancelInstanceInstallation.checkbox']);
    }

    public function test_unknown_language_returns_validation_error(): void
    {
        // CA: packages/client-area/src/i18n.js:80
        $this->getJson('/api/zz/translation.json')->assertStatus(422);
    }

    /**
     * The account dialog of a page titled SSH or SFTP reads its field tooltips as `tooltip.add_<pageType>_account.<field>`
     * and `tooltip.edit_<pageType>_account.<field>`; only the SFTP and FTP variants were served, so the SSH page's dialog
     * showed the raw key as a tooltip.
     */
    public function test_the_account_dialogs_name_their_fields_for_both_ssh_and_sftp(): void
    {
        // CA: packages/client-area/src/i18n.js:80 (the CA loads the bundle into i18next)
        $tooltip = $this->getJson('/api/en/translation.json')
            ->assertOk()
            ->json('tooltip');

        // CA reads: src/frontend/client-area/src/views/hosting/sftp/sftp-modals.ts:87-108,130-144
        $keys = [];
        foreach (['ssh', 'sftp'] as $pageType) {
            foreach (['username', 'type', 'password', 'public_key'] as $field) {
                $keys[] = "add_{$pageType}_account.{$field}";
            }
            foreach (['password', 'public_key'] as $field) {
                $keys[] = "edit_{$pageType}_account.{$field}";
            }
        }

        $missing = array_values(array_filter(
            $keys,
            fn (string $key): bool => ! is_string($tooltip[$key] ?? null) || $tooltip[$key] === '',
        ));

        $this->assertSame([], $missing, 'The account dialog shows these keys as raw tooltips.');
    }

    /**
     * The custom privileges screen of the share dialog labels every privilege of the list it gets with
     * `privileges.list.<privilege>`; a privilege without a label was shown as its raw key.
     */
    public function test_every_privilege_the_panel_names_has_a_label(): void
    {
        // CA: packages/client-area/src/i18n.js:80 (the CA loads the bundle into i18next)
        $labels = $this->getJson('/api/en/translation.json')
            ->assertOk()
            ->json('privileges.list');

        // `Privileges::SERVICE` (`service.create_instance`) is a right to create and install, never a label in the list.
        // CA reads: src/frontend/client-area/src/entities/privileges/list-privileges.ts:138 (`privileges.list.<key>`)
        $privileges = [...Privileges::GENERAL, ...Privileges::WORDPRESS, ...Privileges::HOSTING];

        $missing = array_values(array_filter(
            $privileges,
            fn (string $name): bool => ! is_string($labels[$name] ?? null) || $labels[$name] === '',
        ));

        $this->assertSame([], $missing, 'The custom privileges screen shows these privileges as raw keys.');
    }

    public function test_the_application_url_sentences_are_the_ones_the_backend_answers(): void
    {
        // CA: packages/client-area/src/i18n.js:80
        $validation = $this->getJson('/api/en/translation.json')
            ->assertOk()
            ->json('settings.validation');

        // The rules of the legacy modal (`UrlChangeModal.vue:86-151`) showed these texts; the SPA's urlRules show them now.
        $this->assertSame(SettingsUrlRequest::NOT_AN_ORIGIN, $validation['url'] ?? null);
        $this->assertSame(SettingsUrlRequest::BAD_PORT, $validation['port'] ?? null);
        $this->assertSame(SettingsUrlRequest::NOT_HTTPS, $validation['urlHttps'] ?? null);
    }
}
