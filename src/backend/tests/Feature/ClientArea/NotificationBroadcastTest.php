<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Events\BroadcastNotificationCreated;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use PanelAlpha\ClientArea\Events\DeployLogUpdated;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The notifications and broadcast events the Client Area
 * listens to on `private-user.{gravatar_hash}`.
 * @see packages/client-area/src/components/navbar/NotificationsManager.vue:10
 */
class NotificationBroadcastTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function application(User $user): Application
    {
        return $this->syncedApplication($user);
    }

    public function test_notification_broadcast_type_and_payload_match_the_ca(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $notification = new ApplicationNotification($application, 'user.instance.redeploy_finished');
        $payload = $notification->toArray($user);

        $this->assertSame('user.instance.redeploy_finished', $notification->broadcastType());
        $this->assertSame('user.instance.redeploy_finished', $payload['type']);
        $this->assertFalse($payload['is_error']);
        $this->assertTrue($payload['enabled']);
        $this->assertSame($application->id, $payload['instance']['id']);
    }

    public function test_failure_html_text_carries_the_engine_message(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $notification = new ApplicationNotification(
            $application,
            'user.instance.redeploy_failed',
            payload: ['message' => 'The build failed <b>badly</b>'],
            isError: true,
        );

        $payload = $notification->toArray($user);

        // The CA renders html_text with v-html; the text comes from the package
        // translations with the project name, and the Engine message is escaped
        // and appended.
        $this->assertStringContainsString('Redeployment of Site1 failed.', $payload['html_text']);
        $this->assertStringContainsString('The build failed &lt;b&gt;badly&lt;/b&gt;', $payload['html_text']);
        $this->assertStringNotContainsString('<b>', $payload['html_text']);

        // The database channel stores the CA type, not the class name.
        $this->assertSame('user.instance.redeploy_failed', $notification->databaseType($user));
    }

    public function test_failure_html_text_falls_back_to_the_engine_username(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['name' => null])->save();

        $notification = new ApplicationNotification($application, 'user.instance.redeploy_finished');

        // The Engine has not named the mirror row yet: the username is the old
        // CA's stand-in for the project name.
        $this->assertStringContainsString(
            'Redeployment of '.$application->engine_username.' finished.',
            $notification->toArray($user)['html_text'],
        );
    }

    /**
     * The CA renders `html_text` with `v-html`
     * (`NotificationsManager.vue:11`, `SuccessAlert.vue:19`), so the project
     * name – user input – and the Engine failure message must arrive escaped.
     */
    #[DataProvider('notificationTypesWithUserInput')]
    public function test_html_text_escapes_every_placeholder(string $type, array $payload, bool $isError): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['name' => '<img src=x onerror=alert(1)>'])->save();

        $notification = new ApplicationNotification($application, $type, payload: $payload, isError: $isError);
        $html = $notification->toArray($user)['html_text'];

        $this->assertStringNotContainsString('<img', $html);
        $this->assertStringContainsString('&lt;img src=x onerror=alert(1)&gt;', $html);
        $this->assertStringNotContainsString('<script>', $html);
    }

    /**
     * @return array<string, array{string, array<string, mixed>, bool}>
     */
    public static function notificationTypesWithUserInput(): array
    {
        return [
            'success type' => ['user.instance.redeploy_finished', [], false],
            'failure type' => [
                'user.instance.redeploy_failed',
                ['message' => '<script>alert(1)</script>'],
                true,
            ],
        ];
    }

    public function test_a_missing_translation_logs_and_falls_back_to_the_type_key(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Log::spy();

        // No humanised string is built from the type any more:
        // the guard test lists every type, so this is a production-only path –
        // log it and let the CA render the raw type key.
        $notification = new ApplicationNotification($application, 'user.instance.not_a_real_type');
        $this->assertSame('user.instance.not_a_real_type', $notification->toArray($user)['html_text']);

        Log::shouldHaveReceived('warning')->once();
    }

    public function test_a_type_naming_a_translation_group_falls_back_to_the_type_key(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // `notifications.user` is a translation group, so trans() returns an
        // array, not a string; a non-string key must fall back to the raw type
        // (the CA renders it) instead of a TypeError in htmlText().
        Log::spy();

        $payload = (new ApplicationNotification($application, 'user'))->toArray($user);
        $this->assertSame('user', $payload['html_text']);

        $withMessage = (new ApplicationNotification($application, 'user', payload: ['message' => 'boom']))->toArray($user);
        $this->assertSame('user boom', $withMessage['html_text']);

        Log::shouldHaveReceived('warning')->twice();
    }

    public function test_every_notification_type_has_translated_text_with_the_project_name(): void
    {
        // Every type the panel sends has a `lang/en/notifications.php`
        // entry rendered with `:name`; the CA shows `html_text` and falls back to
        // the raw type otherwise. The list is generated from the source, not
        // curated.
        $types = $this->notificationTypesFromSource();
        $this->assertNotEmpty($types, 'No notification types found in the source.');

        $missing = [];
        foreach ($types as $type) {
            $text = trans('client-area::notifications.'.$type, ['name' => 'My Project']);
            if (! is_string($text) || $text === 'client-area::notifications.'.$type) {
                $missing[] = $type;
            } elseif (! str_contains($text, 'My Project')) {
                $missing[] = $type.' (without :name)';
            }
        }

        $this->assertSame([], $missing, 'Notification types without translated text: '.implode(', ', $missing));
    }

    /**
     * Every `user.*_finished|failed` string in the package and host app, so a
     * new notification type cannot ship an untranslated `html_text`.
     *
     * @return list<string>
     */
    private function notificationTypesFromSource(): array
    {
        $roots = [
            base_path('../packages/client-area/src'),
            // Legacy code fires notification types too once it owns jobs.
            base_path('../packages/client-area-legacy/src'),
            base_path('app'),
        ];

        $types = [];
        foreach ($roots as $root) {
            if (! is_dir($root)) {
                continue;
            }
            $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root));
            foreach ($files as $file) {
                if (! $file->isFile() || $file->getExtension() !== 'php') {
                    continue;
                }
                $contents = (string) file_get_contents($file->getPathname());
                if (preg_match_all("/'((?:user|admin)\.[a-z0-9_.]+_(?:finished|failed))'/", $contents, $m) > 0) {
                    foreach ($m[1] as $type) {
                        $types[$type] = true;
                    }
                }
            }
        }

        return array_keys($types);
    }

    public function test_sub_resource_notification_carries_its_own_key(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $notification = new ApplicationNotification(
            $application,
            'user.instance.backup.create_finished',
            payload: ['backup' => ['id' => 7, 'status' => 'completed']],
            includeInstance: false,
        );

        $payload = $notification->toArray($user);

        $this->assertArrayNotHasKey('instance', $payload);
        $this->assertSame(7, $payload['backup']['id']);
    }

    /**
     * A fully loaded live project plus its staging: the worst case for a
     * broadcast (the staging embeds its parent, which embeds the staging
     * again), matching the live run that produced 31.8 KB for
     * `create_staging_finished`.
     *
     * @return array{Application, Application}
     */
    private function fullyLoadedStaging(User $user): array
    {
        // Engine: core/app/Http/Resources/UserResource.php:24 (details is the
        // whole Engine details map, exposed verbatim by the presenter).
        $details = [
            'git_repo' => 'https://github.com/acme/site1.git',
            'git_branch' => 'main',
            'template' => 'dind',
            'app_port' => 8080,
            'document_root' => 'site1.example.com/public_html',
            'dns_alerts_enabled' => true,
            'async_status' => ['staging' => 'completed', 'push' => 'running', 'source' => 'git'],
            'site_git' => ['repo_url' => 'https://github.com/acme/site1.git'],
            'git_commit' => str_repeat('a', 40),
            'git_delivery_url' => 'https://engine.example.com/deploy-hooks/'.str_repeat('b', 48),
            'env_file_path' => 'project/.env',
            'wordpress_version' => '6.7.1',
            'plugins' => array_fill(0, 40, ['name' => 'plugin', 'version' => '1.0.0']),
        ];

        $parent = $this->syncedApplication($user, 'site1', [
            'details' => $details,
            'config' => ['ip_addresses' => ['ipv4' => [TestNetwork::public(10)]]],
        ]);
        $parent->applicationLabels()->create(['title' => 'Prod', 'color' => '#ff0000']);
        $parent->forceFill([
            'git_source' => 'https://github.com/acme/site1.git',
            'git_last_commit_hash' => str_repeat('c', 40),
        ])->save();

        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $parent->id,
            'engine_payload' => ['details' => $details],
        ]);
        $staging->applicationLabels()->create(['title' => 'Stage', 'color' => '#00ff00']);

        return [$parent, $staging];
    }

    /**
     * Every notification's broadcast copy fits the ~10 KB
     * Pusher/Reverb cap even for a fully loaded staging (in the live run broadcast
     * jobs of 24–33 KB stayed in `failed_jobs`).
     */
    public function test_every_notification_broadcast_payload_stays_under_the_limit(): void
    {
        $user = User::factory()->create();
        [, $staging] = $this->fullyLoadedStaging($user);

        $over = [];
        foreach ($this->notificationTypesFromSource() as $type) {
            $payload = (new ApplicationNotification($staging, $type))->toBroadcast($user);
            $bytes = strlen((string) json_encode($payload));
            if ($bytes >= 10240) {
                $over[] = $type.' ('.$bytes.' B)';
            }
        }

        $this->assertSame([], $over, 'Broadcast payloads over 10 KB: '.implode(', ', $over));
    }

    /**
     * The slim broadcast still carries every key the CA's Echo
     * handlers and `instanceResource` read, so the live update renders.
     *
     * @see packages/client-area/src/apis/Instances.js:94-260
     * @see packages/client-area/src/views/instance/index.vue:168-205
     */
    public function test_the_broadcast_instance_keeps_the_keys_the_ca_reads(): void
    {
        $user = User::factory()->create();
        [$parent, $staging] = $this->fullyLoadedStaging($user);

        $payload = (new ApplicationNotification($staging, 'user.instance.create_staging_finished'))->toBroadcast($user);
        $instance = $payload['instance'];

        // Every whitelisted key must survive the slim
        // presenter, so removing one from BROADCAST_KEYS cannot silently drop a
        // CA-read field (the earlier test only checked a hand-picked subset).
        $broadcastKeys = (new \ReflectionClass(\PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter::class))
            ->getReflectionConstant('BROADCAST_KEYS');
        $this->assertNotFalse($broadcastKeys);
        foreach ((array) $broadcastKeys->getValue() as $key) {
            $this->assertArrayHasKey((string) $key, $instance, "The broadcast instance is missing whitelisted key [{$key}].");
        }

        foreach (['id', 'type', 'name', 'domain', 'url', 'staging', 'version', 'status', 'created_at', 'async_status', 'server_account_id', 'server_settings', 'ssl_order_status', 'privileges', 'labels'] as $key) {
            $this->assertArrayHasKey($key, $instance, "The broadcast instance is missing CA-read key [{$key}].");
        }

        // The handlers read these exact values (instance/index.vue:163,190 and
        // Instances.vue:383).
        $this->assertSame($staging->id, $instance['id']);
        $this->assertSame($parent->id, $instance['staging']);
        $this->assertSame('https://'.$staging->domain, $instance['url']);
        $this->assertFalse($instance['server_settings']['uses_own_backup_system']);

        // A staging still carries a slim parent, so the retry modal can open
        // (CreateStagingModal reads parent plan_settings).
        $this->assertSame($parent->id, $instance['parent_app']['id']);
        $this->assertArrayHasKey('plan_settings', $instance['parent_app']);
        $this->assertNull($instance['parent_app']['parent_app']);
    }

    /**
     * The database channel keeps the full instance, not the slim
     * websocket copy. `/api/notifications` re-serves the stored payload, so a
     * page reload must still see `details`/`server_account_details` and the
     * nested `staging_apps`.
     */
    public function test_the_database_copy_keeps_the_full_instance(): void
    {
        $user = User::factory()->create();
        [$parent] = $this->fullyLoadedStaging($user);

        $payload = (new ApplicationNotification($parent, 'user.instance.redeploy_finished'))->toArray($user);
        $instance = $payload['instance'];

        // `presentSlim` empties these; `toArray` must not.
        $this->assertNotEmpty($instance['details']);
        // The copy on the account is the Engine's map plus the keys the panel derives from it and from the project.
        $copied = $instance['server_account_details'];
        // The phpMyAdmin SSO host is derived from the project's domain, not copied from the Engine's map.
        $this->assertSame('site1.example.com', $copied['mysql_php_my_admin_sso_host']);
        unset($copied['mysql_php_my_admin_sso_host']);
        $this->assertSame(
            $copied,
            array_merge($instance['details'], array_intersect_key(
                $copied,
                array_flip(['homedir', 'mysql_db_prefix', 'ip_address', 'username']),
            )),
        );
        foreach (['homedir', 'mysql_db_prefix', 'ip_address', 'username'] as $key) {
            $this->assertArrayHasKey($key, $instance['server_account_details']);
        }
        $this->assertNotEmpty($instance['staging_apps']);

        // The socket copy is the slim one, so the two genuinely differ.
        $broadcast = (new ApplicationNotification($parent, 'user.instance.redeploy_finished'))->toBroadcast($user);
        $this->assertSame([], $broadcast['instance']['details']);
        $this->assertSame([], $broadcast['instance']['staging_apps']);
    }

    public function test_sending_a_notification_dispatches_a_broadcast_event(): void    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Event::fake([BroadcastNotificationCreated::class]);
        $user->notify(new ApplicationNotification($application, 'user.instance.installation_finished'));

        Event::assertDispatched(
            BroadcastNotificationCreated::class,
            fn (BroadcastNotificationCreated $event) => $event->broadcastType() === 'user.instance.installation_finished',
        );
    }

    public function test_notification_is_also_stored_in_the_database_channel(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        \Illuminate\Support\Facades\Notification::fake();
        $user->notify(new ApplicationNotification($application, 'user.instance.redeploy_finished'));

        \Illuminate\Support\Facades\Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $notification) => in_array('database', $notification->via($user), true),
        );
    }

    public function test_community_has_no_notification_templates(): void
    {
        $user = User::factory()->create();
        $notification = new ApplicationNotification($this->application($user), 'user.instance.redeploy_failed', ['message' => 'Disk full'], true);

        // The controller's `NoNotificationTemplates` (the paid Admin Area binds
        // its template store, NTF-2): the bell copy, the own text, no email.
        $this->assertInstanceOf(\PanelAlpha\ClientArea\Support\NoNotificationTemplates::class, app(\PanelAlpha\ClientArea\Contracts\NotificationTemplates::class));
        $this->assertSame(['broadcast', 'database'], $notification->via($user));
        $data = $notification->toArray($user);
        $this->assertTrue($data['enabled']);
        $this->assertStringStartsWith('Redeployment of ', $data['html_text']);
        $this->assertStringEndsWith(' failed. Disk full', $data['html_text']);
    }

    public function test_broadcast_events_target_the_user_channel(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $channel = 'private-user.'.$user->gravatarHash();

        $deployLog = new DeployLogUpdated($application, 'running', baseOffset: 5, lines: [
            ['ts' => 1, 'level' => 'info', 'msg' => 'Building'],
        ], nextOffset: 6);

        $this->assertSame($channel, (string) $deployLog->broadcastOn()[0]);
        $this->assertSame($application->id, $deployLog->broadcastWith()['application_id']);
        $this->assertSame(5, $deployLog->broadcastWith()['base_offset']);
        $this->assertSame('running', $deployLog->broadcastWith()['status']);

        // The CA subscribes with Echo's default `App\Events` namespace, so the
        // legacy names are kept through broadcastAs().
        $this->assertSame('App\\Events\\DeployLogUpdated', $deployLog->broadcastAs());
        // CA reads: packages/client-area/src/apis/Auth.js:477-479 (`.listen('DeployLogUpdated', n => emit('deploy-log-updated', n))`)
        $this->assertSame(['application_id', 'status', 'base_offset', 'lines', 'next_offset', 'stage', 'stages'], array_keys($deployLog->broadcastWith()));
    }
}
