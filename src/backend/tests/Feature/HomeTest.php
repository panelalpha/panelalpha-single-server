<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * @see packages/client-area/src/store/store.js (the /home payload)
 * @see packages/api/app/Http/Controllers/AuthController.php:831-962 (old home(), appendix A)
 */
class HomeTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * Community has no billing and no sign-up, so the Client Area hides
     * the Billing and Services pages and the sign-up link (the controller's
     * `NoHomeBillingFlags`; the paid product answers its background-billing
     * settings, packages/edition-pro/tests/ClientArea/UserBillingTest).
     */
    public function test_free_offers_no_billing_and_no_sign_up(): void
    {
        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        // CA reads: packages/client-area/src/views/Register.vue:395 (registration_enabled), packages/client-area/src/components/modal/RegistrationTermsModal.vue:50-52 (the terms), packages/client-area/src/apis/Auth.js:66 (recaptcha_site_key)
        $this->getJson('/api/home')
            ->assertOk()
            ->assertJsonPath('app.registration_enabled', false)
            ->assertJsonPath('app.registration_tos', null)
            ->assertJsonPath('app.recaptcha_site_key', null)
            ->assertJsonPath('app.from_control_panel_registration', ['tos' => null]);

        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        // CA reads: packages/client-area/src/views/Billing.vue:222 (billing_enabled)
        $this->actingAs(User::factory()->create())->getJson('/api/home')
            ->assertOk()
            ->assertJsonPath('app.billing_enabled', false)
            ->assertJsonPath('app.registration_enabled', false);
    }

    /**
     * Community has no resellers, so a user is never one (the
     * controller's `NoHomeResellerBranding`: the Client Area shows no Reseller
     * Area) and the panel keeps its own name and theme, with no
     * `default_theme`; the paid product answers the reseller settings,
     * packages/edition-pro/tests/ClientArea/ResellerAreaTest.
     */
    public function test_community_has_no_reseller_area(): void
    {
        Setting::set('userapp.name', 'Acme Panel');

        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        // CA reads: packages/client-area/src/App.vue:106-113 (isUserReseller), packages/client-area/src/components/navbar/NavbarTopNavigation.vue:78-85 (the Reseller Area tab), packages/client-area/src/components/styleManager/StyleManagerMenu.vue:325-326 (default_theme)
        $this->actingAs(User::factory()->create())->getJson('/api/home')
            ->assertOk()
            ->assertJsonPath('user.reseller_settings', null)
            ->assertJsonPath('app.name', 'Acme Panel')
            ->assertJsonPath('app.theme.colors.base', '#07C07E')
            ->assertJsonMissingPath('app.default_theme');
    }

    /**
     * Community has no plans and no admin catalog,
     * so every service keeps the simple onboarding – the wizard opens no theme
     * step and no advanced form (the controller's `SimpleServiceOnboarding`) –
     * and the five catalog routes are not served;
     * the paid product answers the plan's onboarding and the admin's catalog,
     * packages/edition-pro/tests/ClientArea/OnboardingCatalogTest.
     */
    public function test_free_offers_the_simple_onboarding_without_the_admin_catalog(): void
    {
        $user = User::factory()->create();

        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        // CA reads: packages/client-area/src/mixins/Onboarding/SelectedServiceMixin.js:19-62 (the mode and the theme step), packages/client-area/src/store/store.js:13-28
        $this->actingAs($user)->getJson('/api/home')
            ->assertOk()
            ->assertJsonPath('user.services.0.install_method', 'simple')
            ->assertJsonPath('user.services.0.onboarding_mode', 'simple')
            ->assertJsonPath('user.services.0.choose_theme', false)
            ->assertJsonPath('user.services.0.standard_fields', array_fill_keys(['language', 'database_name', 'database_prefix', 'admin_username', 'admin_email', 'admin_password'], false))
            ->assertJsonPath('user.services.0.plan_default_theme', null)
            ->assertJsonPath('user.services.0.quick_allow_to_choose_themes', false)
            ->assertJsonPath('user.services.0.is_installed_from_template', false)
            ->assertJsonPath('user.services.0.standard_force_template', false);

        foreach ([
            '/api/projects/onboarding/theme-categories',
            '/api/projects/onboarding/1/themes-from-category',
            '/api/projects/onboarding/recommended-themes',
            '/api/projects/onboarding/theme/1/screenshot',
            '/api/instances/onboarding/theme/1/screenshot',
            '/api/projects/wordpress-templates',
        ] as $url) {
            // CA: packages/client-area/src/components/onboarding/OnboardingChooseTemplateModal.vue:439 (the theme step, closed in Community)
            $this->actingAs($user)->getJson($url)->assertNotFound();
        }
    }

    /**
     * Community has no plan, so the rest of the onboarding block keeps today's values – the domain step
     * asks for a domain (a free subdomain of the Engine's sites base among the choices), every project type, no
     * site-name step, no forced install – and no DNS server takes part in the domain verification
     * (`SimpleServiceOnboarding`, `NoServiceDnsEmail`). The DNS help the domain dialogs show is the single server's
     * own (the A record and the `www` CNAME, verified by the A record); the paid answer is the plan's
     * (packages/edition-pro/tests/ClientArea/PlanOnboardingTest).
     */
    public function test_community_keeps_its_onboarding_steps_and_has_no_dns_server(): void
    {
        $user = User::factory()->create();

        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        // CA reads: packages/client-area/src/mixins/Onboarding/SelectedServiceMixin.js:75-102, packages/client-area/src/App.vue:207 (force_install), packages/client-area/src/components/onboarding/OnboardingDomainInstantVerificationModal.vue:154-160 (dns_server)
        $this->actingAs($user)->getJson('/api/home')
            ->assertOk()
            ->assertJsonPath('user.services.0.ask_for_domain', true)
            ->assertJsonPath('user.services.0.ask_for_site_name', false)
            ->assertJsonPath('user.services.0.ask_for_wordpress_version', true)
            ->assertJsonPath('user.services.0.force_install', false)
            ->assertJsonPath('user.services.0.onboarding', [
                'installation_type' => ['wordpress' => true, 'git' => true, 'files' => true, 'go' => true, 'migrations' => true],
                'user_configurable_options' => [],
                'super_quick_post_installation_action' => 'none',
                'super_quick_ask_for_site_name' => false,
                'ask_for_site_name' => false,
                'super_quick_redirect_delay_after_site_creation' => 0,
                'server_allow_domain_transfer' => false,
                'domain_transfer_enabled' => false,
                'can_select_reseller_user' => false,
                'eager_domain_dns_verification_enabled' => false,
                'dns_settings' => [
                    'domain_verification' => 'none',
                    'valid_cname_addresses' => [],
                    'verification_methods' => ['resolve_a_record'],
                    'verification_mode' => 'any',
                    'display_options' => ['a_records'],
                ],
                'domains_blacklist' => [],
                'subdomain_bases' => ['panelalpha.online'],
                'account_config' => ['memory_limit' => 2048],
            ])
            ->assertJsonPath('user.services.0.dns_server', ['enabled' => false, 'nameservers' => []]);
    }

    public function test_guest_home_returns_compatible_app_payload(): void
    {
        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        $response = $this->getJson('/api/home');

        // CA reads: packages/client-area/src/apis/Auth.js:50 (the CA boots the store from the /home payload)
        $response
            ->assertOk()
            ->assertJsonStructure([
                'app' => [
                    'name',
                    'default_language',
                    'languages',
                    'language_flags',
                    'registration_enabled',
                    'integrations' => [
                        'auth',
                    ],
                    'single_server' => [
                        'active',
                    ],
                    'theme' => [
                        'colors',
                        'style',
                        'logo',
                        'darkLogo',
                        'favicon',
                    ],
                ],
            ])
            ->assertJsonMissingPath('user')
            // Single-server default name (Appendix A); set userapp.name to change it.
            ->assertJsonPath('app.name', 'My Server')
            ->assertJsonPath('app.single_server.active', true);
    }

    /**
     * A visitor who is not signed in gets what the SPA shell, the
     * login and sign-up pages and the first-run wizard read, nothing about
     * the Engine, its tasks and imports, the Hub pairing or the MCP URL. The
     * old panel answered its whole `app` block to anyone
     * (packages/api/app/Http/Controllers/AuthController.php:831-877).
     */
    public function test_guest_home_holds_only_what_the_pages_before_sign_in_read(): void
    {
        $this->configureEngine();

        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        $response = $this->getJson('/api/home');

        // CA reads: packages/client-area/src/views/Login.vue:218-223 (support_link), packages/client-area/src/views/Login.vue:545 (integrations.auth), packages/client-area/src/views/Login.vue:548 (hub_login), packages/client-area/src/views/Login.vue:551 (registration_enabled)
        $response->assertOk()
            ->assertJsonPath('app.hub_login', false)
            ->assertJsonPath('app.integrations', ['auth' => []])
            ->assertJsonPath('app.single_server', ['active' => true]);
        $this->assertSame([
            'name',
            'default_language',
            'default_date_format',
            'support_link',
            'languages',
            'language_flags',
            'custom_js_header',
            'custom_js_footer',
            'custom_css',
            'registration_enabled',
            'registration_tos',
            'recaptcha_site_key',
            'from_control_panel_registration',
            'integrations',
            'community_panel',
            'single_server',
            'hub_login',
            'theme',
            'setup_required',
            'setup_blocked',
        ], array_keys($response->json('app')));
    }

    /**
     * The signed-in user gets the rest of the `app` block.
     */
    public function test_authenticated_home_adds_the_engine_hub_and_integration_fields(): void
    {
        $this->configureEngine();
        $this->actingAs(User::factory()->create());

        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        $this->getJson('/api/home')
            ->assertOk()
            // CA reads: packages/client-area/src/components/navbar/AdminAreaDropdown.vue:130-134 (has_running_tasks, has_uncompleted_imports), packages/client-area/src/components/navbar/UserInfoDropdown.vue:208 (hub_paired)
            ->assertJsonPath('app.single_server', [
                'active' => true,
                'server_id' => null,
                'has_running_tasks' => false,
                'has_uncompleted_imports' => false,
            ])
            ->assertJsonPath('app.hub_login', false)
            ->assertJsonPath('app.hub_paired', false)
            ->assertJsonPath('app.mcp_url', 'https://engine.example.com/mcp')
            ->assertJsonPath('app.integrations', [
                'auth' => [],
                'report_provider_enabled' => true,
                'preview_site_provider_enabled' => false,
                'atarim_enabled' => false,
            ])
            ->assertJsonPath('app.billing_enabled', false)
            ->assertJsonPath('app.beta_mode', false)
            ->assertJsonPath('app.page_speed_enabled', false)
            ->assertJsonStructure(['app' => ['documentation_link', 'order_custom_ssl_certificate_link'], 'user']);
    }

    /**
     * The archive dialogs ("Upload new version", the status-issue upload, the
     * files wizard) refuse a file over the panel's upload limit before the
     * browser sends it, so the answer carries the bytes entrypoint.sh also
     * writes into PHP's `upload_max_filesize` and nginx's
     * `client_max_body_size` (the config key the file manager reports too).
     */
    public function test_home_carries_the_panel_upload_limit_to_signed_in_users(): void
    {
        config(['client-area.upload_max_bytes' => 5242880]);
        $this->actingAs(User::factory()->create());

        // CA: packages/client-area/src/apis/Auth.js:50
        $this->getJson('/api/home')
            ->assertOk()
            // CA reads: packages/client-area/src/apis/Auth.js:50 (app.upload_max_bytes, the upload dialogs' limit)
            ->assertJsonPath('app.upload_max_bytes', 5242880);
    }

    /** A guest reads no upload limit: the dialogs live behind the sign-in. */
    public function test_guest_home_carries_no_upload_limit(): void
    {
        // CA: packages/client-area/src/apis/Auth.js:50
        $this->getJson('/api/home')
            ->assertOk()
            // CA reads: packages/client-area/src/router/setupGuard.js:8 (the guest app block stops at setup_required)
            ->assertJsonMissingPath('app.upload_max_bytes');
    }

    /**
     * A guest's `/home` asks nothing of the Engine and, besides the
     * settings map (loaded here by configureEngine()), reads only whether a
     * user exists (the wizard's `setup_required`): no applications, sync
     * state, tasks or imports.
     */
    public function test_guest_home_runs_one_query_and_no_engine_call(): void
    {
        $this->configureEngine();
        Http::fake();

        $queries = [];
        DB::listen(function ($query) use (&$queries) {
            $queries[] = $query->sql;
        });

        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        $this->getJson('/api/home')->assertOk();

        Http::assertNothingSent();
        $this->assertSame([
            'select exists(select * from "users") as "exists"',
        ], $queries);
    }

    public function test_guest_home_flags_setup_required_while_there_is_no_user(): void
    {
        // CA: packages/client-area/src/apis/Auth.js:50
        $this->getJson('/api/home')
            ->assertOk()
            // CA reads: packages/client-area/src/router/setupGuard.js:8 (app.setup_required)
            ->assertJsonPath('app.setup_required', true);
    }

    public function test_guest_home_keeps_the_wizard_closed_after_a_failed_first_user_creation(): void
    {
        $this->markFirstUserCreationFailed();

        // CA: packages/client-area/src/apis/Auth.js:50
        $response = $this->getJson('/api/home');
        $response->assertOk();
        // CA reads: packages/client-area/src/router/setupGuard.js:8 (app.setup_required)
        $response->assertJsonPath('app.setup_required', false);
        // The login page shows the repair notice (src/frontend/client-area/src/views/auth/LoginView.vue).
        $this->assertTrue($response->json('app.setup_blocked'));
    }

    public function test_guest_home_is_not_blocked_after_the_operator_created_the_account(): void
    {
        $this->markFirstUserCreationFailed();
        User::factory()->create();

        // CA: packages/client-area/src/apis/Auth.js:50
        $response = $this->getJson('/api/home');
        $response->assertOk();
        $this->assertFalse($response->json('app.setup_blocked'));
    }

    public function test_guest_home_does_not_flag_setup_once_a_user_exists(): void
    {
        User::factory()->create();

        // CA: packages/client-area/src/apis/Auth.js:50
        $this->getJson('/api/home')
            ->assertOk()
            // CA reads: packages/client-area/src/router/setupGuard.js:8 (app.setup_required)
            ->assertJsonPath('app.setup_required', false);
    }

    /**
     * The Community panel (community in single-user mode): the Client Area
     * shows its Tasks and Settings pages and hides the Admin Area link and the
     * "Full server management" button (`app.community_panel`).
     */
    public function test_home_marks_the_community_panel_for_guests_and_users(): void
    {
        // CA: packages/client-area/src/apis/Auth.js:50
        $this->getJson('/api/home')
            ->assertOk()
            // CA reads: packages/client-area/src/router/setupGuard.js:20 (app.community_panel)
            ->assertJsonPath('app.community_panel', true);

        $this->actingAs(User::factory()->create());
        // CA: packages/client-area/src/apis/Auth.js:50
        $this->getJson('/api/home')
            ->assertOk()
            // CA reads: packages/client-area/src/components/navbar/UserInfoDropdown.vue:203 (app.community_panel)
            ->assertJsonPath('app.community_panel', true);
    }

    /**
     * Outside single-user mode the Community pages answer 404, so the Client Area
     * must not offer them.
     */
    public function test_home_is_not_the_community_panel_outside_single_user_mode(): void
    {
        $this->bindMultiUserEdition([]);

        // CA: packages/client-area/src/apis/Auth.js:50
        $this->getJson('/api/home')
            ->assertOk()
            // CA reads: packages/client-area/src/router/setupGuard.js:20 (app.community_panel)
            ->assertJsonPath('app.community_panel', false);
    }

    public function test_authenticated_home_never_flags_setup(): void
    {
        $this->actingAs(User::factory()->create());

        // CA: packages/client-area/src/apis/Auth.js:50
        $this->getJson('/api/home')
            ->assertOk()
            // CA reads: packages/client-area/src/router/setupGuard.js:8 (app.setup_required)
            ->assertJsonPath('app.setup_required', false);
    }

    /**
     * The marker the entrypoint writes when the first-user variables could not
     * create the account (config default `storage_path('first-user-creation-failed')`).
     */
    private function markFirstUserCreationFailed(): void
    {
        $marker = storage_path('framework/testing/first-user-failed-'.bin2hex(random_bytes(4)));
        config(['community.first_user_failed_marker' => $marker]);
        file_put_contents($marker, '');
        $this->beforeApplicationDestroyed(fn () => @unlink($marker));
    }

    /**
     * @return array<string, array{?string, string}>
     */
    public static function dateFormats(): array
    {
        return [
            'nothing stored' => [null, 'YYYY-MM-DD'],
            'legacy php format' => ['Y-m-d', 'YYYY-MM-DD'],
            'a valid option' => ['DD.MM.YYYY', 'DD.MM.YYYY'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('dateFormats')]
    public function test_home_serves_a_valid_moment_style_date_format(?string $stored, string $expected): void
    {
        if ($stored !== null) {
            Setting::set('userapp.default-date-format', $stored);
        }

        // CA: packages/client-area/src/apis/Auth.js:50
        $this->getJson('/api/home')
            ->assertOk()
            // CA reads: packages/client-area/src/apis/Auth.js:50 (the store keeps app.default_date_format from /home)
            ->assertJsonPath('app.default_date_format', $expected);
    }
}
