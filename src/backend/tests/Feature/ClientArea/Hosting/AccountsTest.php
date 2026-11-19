<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Hosting\ServerAccountService;
use PanelAlpha\ClientArea\Http\Requests\Hosting\SshPublicKey;
use PanelAlpha\ClientArea\Models\Application;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * FTP, SFTP and cron hosting pages for a server account.
 * @see packages/client-area/src/views/hosting/Ftp.vue, Sftp.vue:259, Cron.vue:559 – the CA call sites
 * @see Engine core/routes/api.php:196-229 (ftp-accounts, sftp-accounts, mysql, cron-jobs)
 */
class AccountsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const ED25519 = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIP3QxPVdr6PFJJLrHFArwsK7aL+X0LIqY5OJlb0QorOf alice@example.com';

    private const RSA_1024 = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAgQDIwmp7rNNDDVPDEf8r6SBVQxDMTsn1KpuA1VHbLUxArpZWaUFIVmerWBO10DYhYuZkioEYAMW/47PJojKnY6pjc3A+rAt9Q8E5+Gv6WGeCr4VjsDaJbV4uut4Ml8KzgFZLk27uFUVOjgRGum8V3llsY/S2S3sNuxsF3enYXyxu+Q== weak';

    private const RSA_2048 = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC9r8wjJrGI4RkX8tah6w0xYAKFbBNttagbYEQpVIXDRuYSO+2Nfam1jQW5CcRQSymQ7Ozo3eUNgqAuMtb6sarvJDVjIEr9qDOyXIq2ah8g0PWOaaLw3hbPDuT9uNzihy1g6P92yRpCzHcZ5scnIrmdNzvEVh3WBcv3VgNZTSfVwb2CEJ24QQiPQnmNqET9yK8s0+JvQI2f/BCG8Bfsu+DWx0dstlCHw3cntSY6jkeoJFLuxieSv0Y3GOo1B5J8SAmrAnG1ngDCyuT+B5eRZWus4Yf8XPMy/lYUKFAvJ9vWnckg/LI0UhqbJaNKOCDGhaZR99rNYjarIjWbW+3jm3Ft ok';

    private const ECDSA = 'ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBKkualXfbOH+PZGODJT3WWjeLpnA/SdlDVfX5KFdlp6jkWVmcSJCbiyDK+ocZy/D5Ez9X6KDH3+UKvAhPKHFJEs= ec';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    /**
     * @param  array<string, mixed>  $project  overrides for the Engine project
     */
    private function application(User $user, array $project = []): Application
    {
        return $this->syncedApplication($user, 'site1', $project);
    }

    public function test_ftp_accounts_list_maps_quota_and_usage_meta(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FtpAccountController.php:31 -> ftp-accounts index
        Http::fake(['engine.example.com/api/projects/site1/ftp-accounts' => Http::response(['data' => [
            ['user' => 'site1@site1.example.com', 'directory' => '/', 'disk_usage_mb' => 12, 'details' => ['unlimited_quota' => false, 'quota' => 100]],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Ftp.vue:625
            ->getJson("/api/server-accounts/{$application->id}/ftp-accounts")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Ftp.vue:626
            ->assertJsonPath('data.0.user', 'site1@site1.example.com')
// CA reads: packages/client-area/src/views/hosting/Ftp.vue:626
            ->assertJsonPath('data.0.diskused', 12)
// CA reads: packages/client-area/src/views/hosting/Ftp.vue:626
            ->assertJsonPath('data.0.diskquota', 100)
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingFtpTable.vue:83
            ->assertJsonPath('data.0.actions.0', 'edit_password')
// CA reads: packages/client-area/src/views/hosting/Ftp.vue:626
            ->assertJsonPath('meta.usage', true);
    }

    public function test_create_update_and_delete_ftp_account(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FtpAccountController.php:73 -> ftp-accounts store/update/destroy
        Http::fake(['engine.example.com/api/projects/site1/ftp-accounts*' => Http::response(['data' => ['user' => 'site1@site1.example.com']])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Ftp.vue:378
            ->postJson("/api/server-accounts/{$application->id}/ftp-accounts", [
                'user' => 'site1',
                'domain' => 'site1.example.com',
                'password' => 'Secret-Password1!',
            ])
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Ftp.vue:382
            ->assertJson(['success' => true]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Ftp.vue:531
            ->putJson("/api/server-accounts/{$application->id}/ftp-accounts/site1@site1.example.com", ['password' => 'New-Password1!'])
            ->assertOk();

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Ftp.vue:589
            ->deleteJson("/api/server-accounts/{$application->id}/ftp-accounts/site1@site1.example.com")
            ->assertOk();
    }

    public function test_sftp_accounts_list_reports_sftp_access_type(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/SftpAccountController.php:34 -> sftp-accounts index
        Http::fake(['engine.example.com/api/projects/site1/sftp-accounts' => Http::response(['data' => [
            ['username' => 'site1_deploy', 'auth_method' => 'password'],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:259
            ->getJson("/api/server-accounts/{$application->id}/sftp-accounts")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:263
            ->assertJsonPath('data.0.user', 'site1_deploy')
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:271
            ->assertJsonPath('meta.access_type', 'sftp')
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:261
            ->assertJsonPath('meta.actions.0', 'edit_password');
    }

    public function test_disconnect_all_ends_the_project_sftp_sessions(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/SftpAccountController.php:269 -> sftp-accounts/kill-sessions, {data:{killed}}
        Http::fake(['engine.example.com/api/projects/site1/sftp-accounts/kill-sessions' => Http::response(['data' => ['killed' => 2]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:628
            ->postJson("/api/server-accounts/{$application->id}/sftp-accounts/disconnect-all")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:633 (`addAlert` success; the body is ignored)
            ->assertJson(['success' => true]);

        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/projects/site1/sftp-accounts/kill-sessions'));
    }

    public function test_set_access_type_stays_refused(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Defensive (not an Engine shape): the access type has no Engine endpoint
        // yet and calls nothing on the Engine.
        Http::fake(['engine.example.com/*' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:693
            ->postJson("/api/server-accounts/{$application->id}/sftp-accounts/set-access-type", ['access_type' => 'ssh'])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:700 (`Api.getErrorMessage(error)`)
            ->assertJsonPath('errors.0.0', ServerAccountService::SFTP_ACCESS_TYPE_REFUSAL);

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/sftp-accounts/'));
    }

    public function test_set_access_type_still_validates_the_value(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The old SftpAccountController::setAccessType rule; an invalid value is
        // a field error, not the gap refusal.
        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:693
            ->postJson("/api/server-accounts/{$application->id}/sftp-accounts/set-access-type", ['access_type' => 'shell'])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:700 (`Api.getErrorMessage(error)`)
            ->assertJsonValidationErrors(['access_type']);
    }

    public function test_cron_jobs_list_create_update_delete(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/CronJobController.php:35 -> cron-jobs index/create/update/delete
        Http::fake(['engine.example.com/api/projects/site1/cron-jobs*' => Http::response(['data' => [
            ['hash' => 'abc123', 'command' => '/usr/bin/php cron.php', 'minute' => '0', 'hour' => '*', 'day_of_month' => '*', 'month' => '*', 'day_of_week' => '*'],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Cron.vue:703
            ->getJson("/api/server-accounts/{$application->id}/cron-jobs")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Cron.vue:609
            ->assertJsonPath('data.0.line', 'abc123')
// CA reads: packages/client-area/src/views/hosting/Cron.vue:704
            ->assertJsonPath('data.0.command', '/usr/bin/php cron.php');

        $payload = [
            'command' => '/usr/bin/php cron.php',
            'minute' => '0',
            'hour' => '*',
            'day_of_month' => '*',
            'month' => '*',
            'day_of_week' => '*',
        ];

// CA: packages/client-area/src/views/hosting/Cron.vue:559
        $this->actingAs($user)->postJson("/api/server-accounts/{$application->id}/cron-jobs", $payload)->assertOk();
// CA: packages/client-area/src/views/hosting/Cron.vue:608
        $this->actingAs($user)->putJson("/api/server-accounts/{$application->id}/cron-jobs/abc123", $payload)->assertOk();
// CA: packages/client-area/src/views/hosting/Cron.vue:667
        $this->actingAs($user)->deleteJson("/api/server-accounts/{$application->id}/cron-jobs/abc123")->assertOk();
    }

    /**
     * A PHP hosting job names no service: `service` is null in the list,
     * `meta.services` is null (no containers call), and a null `service` the
     * dialog sends is not forwarded, as the Engine refuses the field there.
     */
    public function test_php_hosting_cron_jobs_name_no_service(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/CronJobController.php:35 -> index/store (`service` null on PHP hosting)
        Http::fake(['engine.example.com/api/projects/site1/cron-jobs*' => Http::response(['data' => [
            ['hash' => 'abc123', 'command' => '/usr/bin/php cron.php', 'service' => null, 'minute' => '0', 'hour' => '*', 'day_of_month' => '*', 'month' => '*', 'day_of_week' => '*'],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Cron.vue:703 (same route; `meta.services` is read only by client-area-next)
            ->getJson("/api/server-accounts/{$application->id}/cron-jobs")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Cron.vue:704 (the job row; `service` is client-area-next's)
            ->assertJsonPath('data.0.service', null)
            ->assertJsonPath('meta.services', null);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Cron.vue:559 (same route; `service` is sent only by client-area-next)
            ->postJson("/api/server-accounts/{$application->id}/cron-jobs", [
                'command' => '/usr/bin/php cron.php', 'service' => null,
                'minute' => '0', 'hour' => '*', 'day_of_month' => '*', 'month' => '*', 'day_of_week' => '*',
            ])
            ->assertOk();

        Http::assertSent(fn ($request): bool => $request->method() === 'POST' && ! array_key_exists('service', $request->data()));
        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), '/containers'));
    }

    /**
     * A container project's job runs in one Compose service (Engine 2.3.0):
     * the list carries each job's `service` and `meta.services` (the
     * project's services once each, from `GET E:/containers`), and create and
     * update forward the chosen one.
     */
    public function test_container_project_cron_jobs_run_in_a_service(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/CronJobController.php:35 -> index/store/update (`service` on a container project)
            'engine.example.com/api/projects/site1/cron-jobs*' => Http::response(['data' => [
                ['hash' => 'abc123', 'command' => 'php artisan schedule:run', 'service' => 'app', 'minute' => '*', 'hour' => '*', 'day_of_month' => '*', 'month' => '*', 'day_of_week' => '*'],
            ]]),
            // Engine: core/app/Http/Controllers/User/ContainerController.php:82 -> index (one row per container, `Service` per compose service)
            'engine.example.com/api/projects/site1/containers' => Http::response(['data' => [
                ['Service' => 'app', 'State' => 'running'],
                ['Service' => 'worker', 'State' => 'running'],
                ['Service' => 'worker', 'State' => 'running'],
                ['Service' => 'db', 'State' => 'exited'],
            ]]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Cron.vue:703 (same route; `meta.services` is read only by client-area-next)
            ->getJson("/api/server-accounts/{$application->id}/cron-jobs")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Cron.vue:704 (the job row; `service` is client-area-next's)
            ->assertJsonPath('data.0.service', 'app')
            ->assertJsonPath('meta.services', ['app', 'worker', 'db']);

        $payload = [
            'command' => 'php artisan schedule:run',
            'service' => 'worker',
            'minute' => '*',
            'hour' => '*',
            'day_of_month' => '*',
            'month' => '*',
            'day_of_week' => '*',
        ];

// CA: packages/client-area/src/views/hosting/Cron.vue:559 (same route; `service` is sent only by client-area-next)
        $this->actingAs($user)->postJson("/api/server-accounts/{$application->id}/cron-jobs", $payload)->assertOk();
// CA: packages/client-area/src/views/hosting/Cron.vue:608 (same route; `service` is sent only by client-area-next)
        $this->actingAs($user)->putJson("/api/server-accounts/{$application->id}/cron-jobs/abc123", $payload)->assertOk();

        Http::assertSent(fn ($request): bool => $request->method() === 'POST' && str_ends_with($request->url(), '/cron-jobs') && $request['service'] === 'worker');
        Http::assertSent(fn ($request): bool => $request->method() === 'PUT' && str_ends_with($request->url(), '/cron-jobs/abc123') && $request['service'] === 'worker');
    }

    public function test_cron_job_service_must_be_a_compose_service_name(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Cron.vue:559 (same route; `service` is sent only by client-area-next)
            ->postJson("/api/server-accounts/{$application->id}/cron-jobs", [
                'command' => 'true', 'service' => 'app; rm -rf /',
                'minute' => '*', 'hour' => '*', 'day_of_month' => '*', 'month' => '*', 'day_of_week' => '*',
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Cron.vue:572 (`Api.getErrorMessage(error)`)
            ->assertJsonValidationErrors(['service']);

        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), '/cron-jobs'));
    }

    public function test_create_sftp_account_requires_the_chosen_credential(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: `views/hosting/Sftp.vue:363` posts the form; the auth `type`
        // selects the credential field (Sftp.vue:219,341). Engine:
        // core/app/Http/Requests/SftpAccountStoreRequest.php:31-33. Password policy
        // (letters + mixed case + numbers + symbols).
        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:362
            ->postJson("/api/server-accounts/{$application->id}/sftp-accounts", [
                'username' => 'alice',
                'type' => 'password',
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:378
            ->assertJsonValidationErrors('password');

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:362
            ->postJson("/api/server-accounts/{$application->id}/sftp-accounts", [
                'username' => 'alice',
                'type' => 'public_key',
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:378
            ->assertJsonValidationErrors('public_key');

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:362
            ->postJson("/api/server-accounts/{$application->id}/sftp-accounts", [
                'username' => 'alice',
                'type' => 'password',
                'password' => 'password123',
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:378
            ->assertJsonValidationErrors('password');

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/sftp-accounts'));
    }

    /**
     * The password policy (`Password::defaults()`) names each thing a password
     * lacks, under `errors.password`: a long lowercase-only password gets the
     * mixed-case, symbol and number messages and nothing else (owner report,
     * 2026-11-06). The messages name the field themselves, so client-area-next
     * shows them without a `password:` prefix.
     */
    public function test_sftp_password_errors_name_what_the_password_lacks(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:362
            ->postJson("/api/server-accounts/{$application->id}/sftp-accounts", [
                'username' => 'alice',
                'type' => 'password',
                'password' => 'lowercaseonly',
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:378
            ->assertJsonPath('errors.password', [
                'The password field must contain at least one uppercase and one lowercase letter.',
                'The password field must contain at least one symbol.',
                'The password field must contain at least one number.',
            ]);

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/sftp-accounts'));
    }

    public function test_create_sftp_account_sends_only_the_chosen_credential(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/SftpAccountController.php:83 -> sftp-accounts store
        Http::fake(['engine.example.com/api/projects/site1/sftp-accounts' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:362
            ->postJson("/api/server-accounts/{$application->id}/sftp-accounts", [
                'username' => 'alice',
                'type' => 'public_key',
                // A stale weak password must not be validated when the key is
                // the credential in use (old request nulled it).
                'password' => '123',
                'public_key' => self::ED25519,
            ])
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:366
            ->assertJsonPath('success', true);

        // Engine: SftpAccountStoreRequest auth_method + the chosen credential
        // (core/app/Http/Requests/SftpAccountStoreRequest.php:31-33).
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/sftp-accounts')
            && $request['auth_method'] === 'public_key'
            && $request['public_key'] === self::ED25519
            && ($request['password'] ?? null) === null);
    }

    /**
     * @return array<string, array{string, bool}>
     */
    public static function publicKeys(): array
    {
        return [
            'ed25519' => [self::ED25519, true],
            'ecdsa p-256' => [self::ECDSA, true],
            'rsa 2048' => [self::RSA_2048, true],
            'rsa 1024' => [self::RSA_1024, false],
            'not a key' => ['hello world', false],
            'a type the blob does not hold' => ['ssh-rsa '.explode(' ', self::ED25519)[1], false],
            'bad base64' => ['ssh-ed25519 !!!notbase64', false],
            'two lines' => [self::ED25519."\n".self::ED25519, false],
            'an unsupported type' => ['ssh-dss '.explode(' ', self::ED25519)[1], false],
        ];
    }

    #[DataProvider('publicKeys')]
    public function test_create_sftp_account_checks_the_public_key(string $key, bool $accepted): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // Engine: core/app/Http/Controllers/User/SftpAccountController.php:83 -> sftp-accounts store
        Http::fake(['engine.example.com/api/projects/site1/sftp-accounts' => Http::response(['data' => []])]);

        $response = $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:362
            ->postJson("/api/server-accounts/{$application->id}/sftp-accounts", [
                'username' => 'alice',
                'type' => 'public_key',
                'public_key' => $key,
            ]);

        if ($accepted) {
            $response->assertOk();

            return;
        }
// CA reads: packages/client-area/src/apis/Api.js:73 (errors group loop)
        $response->assertStatus(422)->assertJsonValidationErrors(['public_key' => SshPublicKey::MESSAGE]);
        Http::assertNothingSent();
    }

    public function test_create_sftp_account_ignores_the_unused_public_key(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/SftpAccountController.php:83 -> sftp-accounts store
        Http::fake(['engine.example.com/api/projects/site1/sftp-accounts' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:362
            ->postJson("/api/server-accounts/{$application->id}/sftp-accounts", [
                'username' => 'alice',
                'type' => 'password',
                'password' => 'Str0ng!Passw0rd',
                // Over the `public_key` max:4096 rule but ignored because the
                // chosen type is `password` (exclude_unless:type,public_key).
                'public_key' => str_repeat('x', 5000),
            ])
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:366
            ->assertJsonPath('success', true);

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/sftp-accounts')
            && $request['auth_method'] === 'password'
            && ($request['public_key'] ?? null) === null);
    }

    public function test_update_sftp_account_requires_the_chosen_credential(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Requests/SftpAccountUpdateRequest.php:21-23.
        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:521
            ->putJson("/api/server-accounts/{$application->id}/sftp-accounts/alice@site1.example.com", [
                'type' => 'password',
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:536
            ->assertJsonValidationErrors('password');

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:521
            ->putJson("/api/server-accounts/{$application->id}/sftp-accounts/alice@site1.example.com", [
                'type' => 'public_key',
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:536
            ->assertJsonValidationErrors('public_key');

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/sftp-accounts/alice@site1.example.com'));
    }

    public function test_update_sftp_account_ignores_the_unused_credential_and_enforces_the_chosen_one(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/SftpAccountController.php:157 -> sftp-accounts update
        Http::fake(['engine.example.com/api/projects/site1/sftp-accounts/*' => Http::response(['data' => []])]);

        // A stale weak password on a public_key update is ignored, exactly as
        // the old request nulled it.
        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:521
            ->putJson("/api/server-accounts/{$application->id}/sftp-accounts/alice@site1.example.com", [
                'type' => 'public_key',
                'password' => '123',
                'public_key' => self::ED25519,
            ])
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:525
            ->assertJsonPath('success', true);

        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_contains($request->url(), '/sftp-accounts/')
            && $request['auth_method'] === 'public_key'
            && ($request['password'] ?? null) === null
            && $request['public_key'] === self::ED25519);

        // The credential actually in use still follows the password policy
        // (a mutant survived before this test).
        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:521
            ->putJson("/api/server-accounts/{$application->id}/sftp-accounts/alice@site1.example.com", [
                'type' => 'password',
                'password' => 'password123',
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:536
            ->assertJsonValidationErrors('password');
    }

    public function test_update_sftp_account_ignores_the_unused_public_key(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/SftpAccountController.php:157 -> sftp-accounts update
        Http::fake(['engine.example.com/api/projects/site1/sftp-accounts/*' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:521
            ->putJson("/api/server-accounts/{$application->id}/sftp-accounts/alice@site1.example.com", [
                'type' => 'password',
                'password' => 'Str0ng!Passw0rd',
                // Over max:4096, ignored for a password update
                // (exclude_unless:type,public_key).
                'public_key' => str_repeat('x', 5000),
            ])
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:525
            ->assertJsonPath('success', true);

        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_contains($request->url(), '/sftp-accounts/')
            && $request['auth_method'] === 'password'
            && ($request['public_key'] ?? null) === null);
    }

    public function test_ftp_server_info_reports_the_host_and_port(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Panel-side constant, as the old Account/FtpAccounts.php:55 serverInfo
        // (the Engine reports no FTP port).
        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Ftp.vue:410
            ->getJson("/api/server-accounts/{$application->id}/ftp-accounts/server-info")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Ftp.vue:434
            ->assertJsonPath('data.host', 'site1.example.com')
// CA reads: packages/client-area/src/views/hosting/Ftp.vue:435
            ->assertJsonPath('data.port', 21);
    }

    public function test_sftp_server_info_reports_the_host_and_port(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Panel-side constant, as the old Account/SftpAccounts.php:96 serverInfo
        // (the Engine reports no SFTP port either).
        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:394
            ->getJson("/api/server-accounts/{$application->id}/sftp-accounts/server-info")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:429
            ->assertJsonPath('data.host', 'site1.example.com')
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:433
            ->assertJsonPath('data.port', 2222);
    }

    public function test_server_info_names_the_server_address_for_a_proxy_served_domain(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user, [
            'domain' => 'site1.panelalpha.online',
            'domain_names' => ['site1.panelalpha.online'],
            'config' => ['ip_addresses' => ['ipv4' => [TestNetwork::public(7)]]],
        ]);

        // The proxy serves the web ports of a panelalpha.online name only.
        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Ftp.vue:410
            ->getJson("/api/server-accounts/{$application->id}/ftp-accounts/server-info")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Ftp.vue:434
            ->assertJsonPath('data.host', TestNetwork::public(7))
            ->assertJsonPath('data.port', 21);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:394
            ->getJson("/api/server-accounts/{$application->id}/sftp-accounts/server-info")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:429
            ->assertJsonPath('data.host', TestNetwork::public(7))
            ->assertJsonPath('data.port', 2222);
    }

    public function test_server_info_keeps_a_domain_the_server_serves_itself(): void
    {
        $user = User::factory()->create();
        $domain = 'site1.'.str_replace('.', '-', TestNetwork::public(7)).'.panelalpha.direct';
        $application = $this->application($user, [
            'domain' => $domain,
            'domain_names' => [$domain],
            'config' => ['ip_addresses' => ['ipv4' => [TestNetwork::public(7)]]],
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Ftp.vue:410
            ->getJson("/api/server-accounts/{$application->id}/ftp-accounts/server-info")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Ftp.vue:434
            ->assertJsonPath('data.host', $domain);
    }

    public function test_delete_sftp_account_calls_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/SftpAccountController.php:203 -> sftp-accounts destroy
        Http::fake(['engine.example.com/api/projects/site1/sftp-accounts/*' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Sftp.vue:580
            ->deleteJson("/api/server-accounts/{$application->id}/sftp-accounts/alice@site1.example.com")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Sftp.vue:590
            ->assertJsonPath('success', true);

        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/sftp-accounts/alice%40site1.example.com'));
    }

    public function test_cron_jobs_require_authentication(): void
    {
// CA: packages/client-area/src/views/hosting/Cron.vue:703
        $this->getJson('/api/server-accounts/1/cron-jobs')->assertUnauthorized();
// CA: packages/client-area/src/views/hosting/Ftp.vue:625
        $this->getJson('/api/server-accounts/1/ftp-accounts')->assertUnauthorized();
// CA: packages/client-area/src/views/hosting/Sftp.vue:259
        $this->getJson('/api/server-accounts/1/sftp-accounts')->assertUnauthorized();
    }
}
