<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\EngineSyncState;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The /home payload the Client Area boots from.
 *
 * The hosting pages and onboarding are dead until user.services[] carries one
 * virtual service and has_hosting_access is true.
 * @see packages/client-area/src/store/store.js (the /home payload the CA boots on)
 * @see packages/api/app/Http/Controllers/AuthController.php:831-962 (old home(), appendix A)
 */
class HomeServicePayloadTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_guest_home_keeps_working_without_engine(): void
    {
        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        // CA reads: packages/client-area/src/apis/Auth.js:50 (the CA boots the store from the /home payload)
        $this->getJson('/api/home')
            ->assertOk()
            ->assertJsonMissingPath('user')
            ->assertJsonPath('app.hub_login', false)
            // A signed-in menu's reminder.
            ->assertJsonMissingPath('app.hub_paired')
            ->assertJsonPath('app.single_server.active', true);
    }

    public function test_authenticated_home_exposes_single_virtual_service_and_hosting_access(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response(['data' => [
                $this->engineProject(10, 'site1', [
                    'config' => ['ip_addresses' => ['ipv4' => [TestNetwork::public(10)]]],
                    'details' => ['homedir' => '/home/site1'],
                ]),
                $this->engineProject(11, 'site1stg', ['staging_of' => 'site1']),
            ]]),
        ]);

        $user = User::factory()->create([
            'email' => 'user@example.com',
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
            'company_name' => 'Example Ltd',
            'language' => 'en',
            'dark_mode' => true,
            // A confirmed 2FA secret is what makes hasEnabledTwoFactorAuthentication() true
            // (Fortify TwoFactorAuthenticatable.php:21; confirm => true in config/fortify.php).
            'two_factor_secret' => 'SECRET',
            'two_factor_confirmed_at' => now(),
            'password_change_required' => true,
        ]);

        // /home reads the local mirror only; the scheduler/other reads fill it.
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        $response = $this->actingAs($user)->getJson('/api/home');

        // CA reads: packages/client-area/src/apis/Auth.js:50 (the CA boots the store from the /home payload)
        $response
            ->assertOk()
            ->assertJsonPath('user.has_hosting_access', true)
            ->assertJsonPath('user.first_name', 'Ada')
            ->assertJsonPath('user.last_name', 'Lovelace')
            ->assertJsonPath('user.company_name', 'Example Ltd')
            // CA reads: packages/client-area/src/views/Account.vue:504 (two_factor_auth_enabled)
            ->assertJsonPath('user.two_factor_auth_enabled', true)
            // CA reads: packages/client-area/src/views/Login.vue:624 (password_change_required)
            ->assertJsonPath('user.password_change_required', true)
            ->assertJsonPath('user.password_generated', false)
            // CA reads: packages/client-area/src/views/Login.vue:636 (two_factor_auth_required; Community has no forced window)
            ->assertJsonPath('user.two_factor_auth_required', false)
            ->assertJsonPath('user.dark_mode', true)
            ->assertJsonPath('user.is_ss_default', true)
            ->assertJsonPath('user.reseller_settings', null)
            ->assertJsonPath('app.theme.style.darkMode', true)
            ->assertJsonCount(1, 'user.services')
            ->assertJsonPath('user.services.0.id', 1)
            ->assertJsonPath('user.services.0.plan_name', 'Default')
            ->assertJsonPath('user.services.0.status', 'active')
            ->assertJsonPath('user.services.0.is_trial', false)
            ->assertJsonPath('user.services.0.install_method', 'simple')
            ->assertJsonPath('user.services.0.onboarding_mode', 'simple')
            // instance_count counts active live projects, not stagings.
            ->assertJsonPath('user.services.0.instance_count', 1)
            // The hosting account id is the local applications.id (the CA id).
            ->assertJsonPath('user.services.0.hosting_accounts.0.id', Application::query()->where('engine_username', 'site1')->value('id'))
            ->assertJsonPath('user.services.0.hosting_accounts.0.domain', 'site1.example.com')
            ->assertJsonPath('user.services.0.hosting_accounts.0.ipv4_addresses.0', TestNetwork::public(10))
            ->assertJsonPath('user.services.0.onboarding.installation_type.wordpress', true)
            // WordPress import through the Engine since 2.2.0.
            ->assertJsonPath('user.services.0.onboarding.installation_type.migrations', true)
            ->assertJsonPath('user.services.0.onboarding.can_select_reseller_user', false)
            ->assertJsonPath('user.services.0.onboarding.subdomain_bases.0', 'panelalpha.online')
            ->assertJsonPath('user.services.0.dns_server.enabled', false)
            // Community has no plans, so no upgrade link (CA: views/Billing.vue:215-220).
            ->assertJsonPath('user.services.0.plan_upgrade_link', null)
            ->assertJsonPath('user.services.0.hosting_server.ip_v4_addresses.0', TestNetwork::public(10));

        $service = $response->json('user.services.0');
        foreach ([
            'id', 'plan_id', 'plan_name', 'instance_limit', 'instance_count',
            'hosting_accounts', 'install_method', 'onboarding_mode', 'ask_for_domain',
            'ask_for_site_name', 'ask_for_wordpress_version', 'force_install', 'choose_theme',
            'standard_fields', 'status', 'plan_upgrade_link', 'plan_default_theme',
            'quick_allow_to_choose_themes', 'is_installed_from_template', 'standard_force_template',
            'onboarding', 'dns_server', 'hosting_server', 'is_trial', 'trial_expiry_at',
        ] as $key) {
            $this->assertArrayHasKey($key, $service);
        }

        foreach ([
            'installation_type', 'user_configurable_options',
            'super_quick_post_installation_action', 'super_quick_ask_for_site_name',
            'ask_for_site_name', 'super_quick_redirect_delay_after_site_creation',
            'server_allow_domain_transfer', 'domain_transfer_enabled',
            'can_select_reseller_user', 'eager_domain_dns_verification_enabled',
            'dns_settings', 'domains_blacklist', 'subdomain_bases', 'account_config',
        ] as $key) {
            $this->assertArrayHasKey($key, $service['onboarding']);
        }
    }

    public function test_home_still_loads_when_engine_is_not_configured(): void
    {
        $user = User::factory()->create();

        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        // CA reads: packages/client-area/src/apis/Auth.js:50 (the CA boots the store from the /home payload)
        $this->actingAs($user)
            ->getJson('/api/home')
            ->assertOk()
            ->assertJsonPath('user.has_hosting_access', true)
            ->assertJsonCount(1, 'user.services');
    }

    public function test_home_dispatches_the_sync_only_when_never_synced(): void
    {
        $this->configureEngine();
        \Illuminate\Support\Facades\Queue::fake();
        $user = User::factory()->create();

        // No successful sync recorded -> queue one (never inline).
        // CA: packages/client-area/src/apis/Auth.js:50
        $this->actingAs($user)->getJson('/api/home')->assertOk();
        \Illuminate\Support\Facades\Queue::assertPushed(\PanelAlpha\ClientArea\Jobs\Sync\SyncEnginesJob::class);
    }

    public function test_home_does_not_dispatch_the_sync_when_a_sync_was_recorded(): void
    {
        $this->configureEngine();
        // The persistent per-Engine marker a successful sync writes, even with
        // zero projects on the Engine.
        EngineSyncState::query()->create([
            'engine_id' => 1,
            'synced_at' => now(),
        ]);
        \Illuminate\Support\Facades\Queue::fake();
        $user = User::factory()->create();

        // CA: packages/client-area/src/apis/Auth.js:50
        $this->actingAs($user)->getJson('/api/home')->assertOk();
        \Illuminate\Support\Facades\Queue::assertNotPushed(\PanelAlpha\ClientArea\Jobs\Sync\SyncEnginesJob::class);
    }

    public function test_a_row_with_synced_at_alone_is_not_a_completed_sync(): void
    {
        $this->configureEngine();
        Application::create([
            'engine_id' => 1,
            'engine_username' => 'site1',
            'domain' => 'site1.example.com',
            'status' => 'active',
            'synced_at' => now(),
        ]);
        \Illuminate\Support\Facades\Queue::fake();
        $user = User::factory()->create();

        // A mirror row (inserted by mirror(), say) is not a completed sync.
        // CA: packages/client-area/src/apis/Auth.js:50
        $this->actingAs($user)->getJson('/api/home')->assertOk();
        \Illuminate\Support\Facades\Queue::assertPushed(\PanelAlpha\ClientArea\Jobs\Sync\SyncEnginesJob::class);
    }

    public function test_home_still_serves_the_mirror_when_the_engine_is_down(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();

        // The scheduler/other reads filled the mirror earlier.
        Application::create([
            'engine_id' => 1,
            'engine_project_id' => 10,
            'engine_username' => 'site1',
            'name' => 'Site1',
            'domain' => 'site1.example.com',
            'status' => 'active',
            'engine_payload' => $this->engineProject(10, 'site1', [
                'config' => ['ip_addresses' => ['ipv4' => [TestNetwork::public(10)]]],
            ]),
            'synced_at' => now(),
        ]);

        // Engine unreachable for everything.
        Http::fake(['*' => Http::failedConnection()]);

        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        // CA reads: packages/client-area/src/apis/Auth.js:50 (the CA boots the store from the /home payload)
        $this->actingAs($user)
            ->getJson('/api/home')
            ->assertOk()
            ->assertJsonPath('user.services.0.hosting_accounts.0.domain', 'site1.example.com');

        // /home never tried to refresh the project mirror on the request path.
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/projects/all'));
    }

    public function test_home_reports_a_running_engine_task_from_the_cache(): void
    {
        $this->configureEngine();
// Engine: core/app/Http/Controllers/TaskController.php:91 -> TaskController::index
        Http::fake(['engine.example.com/api/tasks*' => Http::response(['data' => [
            ['id' => 55, 'status' => 'running'],
        ]])]);

        app(\App\Support\EngineRunningTasks::class)->refresh();

        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        // CA reads: packages/client-area/src/components/navbar/UserInfoDropdown.vue:214 (app.single_server.has_running_tasks)
        $this->actingAs(User::factory()->create())->getJson('/api/home')
            ->assertOk()
            ->assertJsonPath('app.single_server.has_running_tasks', true);
    }
}
