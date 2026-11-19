<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\ServiceDirectory;
use PanelAlpha\ClientArea\Contracts\ServiceOnboarding;
use PanelAlpha\ClientArea\Jobs\WordPress\InstallWordPressJob;
use PanelAlpha\ClientArea\Projects\OnboardingGate;
use PanelAlpha\ClientArea\Projects\WordPressInstallService;
use PanelAlpha\ClientArea\Services\HostingService;
use PanelAlpha\ClientArea\Support\SimpleServiceOnboarding;
use PanelAlpha\ClientArea\Support\VirtualService;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The branches a paid plan's onboarding opens (the contract is bound by the
 * paid edition; the tests bind a plan that answers differently from Community's
 * `SimpleServiceOnboarding`): a domain left to the plan or the Engine, a
 * blacklist, the advanced install form, blocked themes and project types.
 */
class PlanOnboardingSeamGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * @param  array<string, mixed>  $fields  overrides of the plan's `homeFields()`
     * @param  list<string>  $blockedThemes
     */
    private function bindPlan(
        string $mode = ServiceOnboarding::SIMPLE,
        array $fields = [],
        ?string $generatedDomain = null,
        array $blockedThemes = [],
        bool $allowsDomain = true,
        bool $allowsType = true,
    ): void {
        $this->app->instance(ServiceOnboarding::class, new class($mode, $fields, $generatedDomain, $blockedThemes, $allowsDomain, $allowsType) implements ServiceOnboarding
        {
            private SimpleServiceOnboarding $free;

            /**
             * @param  array<string, mixed>  $fields
             * @param  list<string>  $blockedThemes
             */
            public function __construct(
                private string $mode,
                private array $fields,
                private ?string $generatedDomain,
                private array $blockedThemes,
                private bool $allowsDomain,
                private bool $allowsType,
            ) {
                $this->free = new SimpleServiceOnboarding;
            }

            public function mode(HostingService $service): string
            {
                return $this->mode;
            }

            public function homeFields(HostingService $service): array
            {
                $home = $this->free->homeFields($service);
                foreach ($this->fields as $key => $value) {
                    $home[$key] = is_array($value) && is_array($home[$key] ?? null) ? array_replace_recursive($home[$key], $value) : $value;
                }

                return $home;
            }

            public function blockedThemes(HostingService $service): array
            {
                return $this->blockedThemes;
            }

            public function generatedDomain(HostingService $service, ?string $siteName): ?string
            {
                return $this->generatedDomain;
            }

            public function allowsDomain(HostingService $service, string $domain): bool
            {
                return $this->allowsDomain;
            }

            public function siteName(HostingService $service, ?string $name, array $taken): ?string
            {
                return $name;
            }

            public function allowsProjectType(HostingService $service, string $type): bool
            {
                return $this->allowsType;
            }
        });
    }

    public function test_a_plan_that_generates_the_domain_creates_the_project_on_it(): void
    {
        $this->bindPlan(fields: ['ask_for_domain' => false], generatedDomain: 'generated.example.com');
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll (UserCollection)
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync (202 + TaskResource)
            'engine.example.com/api/projects' => Http::response(['data' => ['id' => 55, 'username' => 'generated']], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1566
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1575
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['name' => 'My Blog'])
            ->assertStatus(202)
            ->assertJsonPath('data.domain', 'generated.example.com');
    }

    public function test_a_plan_that_leaves_the_domain_to_the_engine_creates_the_project_without_one(): void
    {
        $this->bindPlan(fields: ['ask_for_domain' => false], generatedDomain: null);
        $this->configureEngine();
        $finished = $this->engineProject(77, 'myblog', ['domain' => 'myblog.panelalpha.online', 'status' => 'active', 'details' => ['domain' => 'myblog.panelalpha.online']]);
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll (UserCollection)
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync (202 + TaskResource)
            'engine.example.com/api/projects' => Http::response(['data' => ['id' => 77, 'username' => 'myblog', 'details' => ['username' => 'myblog', 'domain' => 'myblog.panelalpha.online']]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (TaskResource)
            'engine.example.com/api/tasks/77' => Http::response(['data' => ['id' => 77, 'status' => 'completed']]),
            // Engine: core/app/Http/Controllers/UserController.php:1310 -> projects show (UserResource)
            'engine.example.com/api/projects/myblog' => Http::response(['data' => $finished]),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['name' => 'My Blog'])
            ->assertStatus(202)
            ->assertJsonPath('data.domain', 'myblog.panelalpha.online');
    }

    public function test_a_plan_blacklist_refuses_the_domain_before_the_engine_is_asked(): void
    {
        $this->bindPlan(allowsDomain: false);
        $this->configureEngine();
        Http::fake();

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1716-1723
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1730-1733 (the error alert)
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['domain' => 'WWW.Shop.example.com'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain');
        Http::assertNothingSent();
    }

    public function test_a_git_domain_step_with_a_bad_repository_address_is_refused(): void
    {
        $this->configureEngine();
        Http::fake();

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1716-1723
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1730-1733 (the error alert)
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['domain' => 'shop.example.com', 'source_type' => 'git', 'repo_url' => 'not a repository'])
            ->assertStatus(422)
            ->assertJsonPath('errors.repo_url.0', 'Invalid repository URL.');
        Http::assertNothingSent();
    }

    public function test_the_theme_browser_leaves_out_the_themes_a_plan_blocks(): void
    {
        $this->bindPlan(blockedThemes: ['twentytwenty']);
        $this->configureEngine();
        Http::fake([
            // External: api.wordpress.org (WordPress.org themes info API)
            'api.wordpress.org/themes/info/*' => Http::response(['info' => ['page' => 1, 'pages' => 1, 'results' => 2], 'themes' => [
                ['slug' => 'twentytwenty', 'name' => 'Twenty Twenty'],
                ['slug' => 'astra', 'name' => 'Astra'],
            ]]),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingStandardFormModal.vue:496-505
        // CA reads: packages/client-area/src/components/onboarding/OnboardingStandardFormModal.vue:496-505
        $response = $this->actingAs(User::factory()->create())
            ->getJson('/api/projects/onboarding/themes?service_id='.VirtualService::ID)
            ->assertOk();

        $this->assertSame(['astra'], array_column($response->json('data'), 'slug'));
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function advancedInstallTypes(): array
    {
        return [
            'a template' => ['template', 'template_id'],
            'a clone' => ['clone', 'install_type'],
        ];
    }

    #[DataProvider('advancedInstallTypes')]
    public function test_the_advanced_install_form_refuses_a_template_and_a_clone(string $type, string $field): void
    {
        Queue::fake();
        $this->bindPlan(mode: ServiceOnboarding::ADVANCED);
        $user = User::factory()->create(['email' => 'owner@example.com']);
        $application = $this->domainStepProject($user);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1756-1765 (+ OnboardingStandardFormModal.vue:496-505)
        $this->actingAs($user)->postJson('/api/projects/install', [
            'service_id' => VirtualService::ID, 'domain_id' => $application->id, 'install_type' => $type,
        ])
            // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1767-1768 (response.data.data)
            ->assertStatus(422)
            ->assertJsonValidationErrors($field);

        Queue::assertNotPushed(InstallWordPressJob::class);
    }

    public function test_the_simple_install_form_ignores_a_template_type(): void
    {
        Queue::fake();
        $this->bindPlan(mode: ServiceOnboarding::SIMPLE);
        $user = User::factory()->create(['email' => 'owner@example.com']);
        $application = $this->domainStepProject($user);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1756-1765 (+ OnboardingStandardFormModal.vue:496-505)
        $this->actingAs($user)->postJson('/api/projects/install', [
            'service_id' => VirtualService::ID, 'domain_id' => $application->id, 'install_type' => 'template',
        ])
            // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1767-1768 (response.data.data)
            ->assertCreated();

        Queue::assertPushed(InstallWordPressJob::class);
    }

    /**
     * @return array<string, array{string, int, ?string}>
     */
    public static function databaseNames(): array
    {
        return [
            'a good name' => ['blog', 201, null],
            'a name that starts with a digit' => ['1blog', 422, WordPressInstallService::DB_NAME_INVALID],
            'a name with a space' => ['my blog', 422, WordPressInstallService::DB_NAME_INVALID],
            'a name past 64 characters with the prefix' => [str_repeat('a', 60), 422, WordPressInstallService::DB_NAME_TOO_LONG],
        ];
    }

    #[DataProvider('databaseNames')]
    public function test_the_advanced_form_checks_the_typed_database_name(string $name, int $status, ?string $error): void
    {
        Queue::fake();
        $this->bindPlan(mode: ServiceOnboarding::ADVANCED, fields: ['standard_fields' => ['database_name' => true]]);
        $user = User::factory()->create(['email' => 'owner@example.com']);
        $application = $this->domainStepProject($user);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1756-1765 (+ OnboardingStandardFormModal.vue:496-505)
        $response = $this->actingAs($user)->postJson('/api/projects/install', [
            'service_id' => VirtualService::ID, 'domain_id' => $application->id, 'db_name' => $name,
        ]);

        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1767-1768 (response.data.data)
        $response->assertStatus($status);
        if ($error === null) {
            $this->assertSame($name, $application->refresh()->wordpressInstall?->params['db_name']);
        } else {
            // CA reads: packages/client-area/src/components/onboarding/OnboardingStandardFormModal.vue:496-505
            $response->assertJsonValidationErrors(['db_name' => $error]);
        }
    }

    public function test_an_install_without_any_admin_email_is_refused(): void
    {
        Queue::fake();
        $user = User::factory()->create(['email' => '']);
        $application = $this->domainStepProject($user);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1756-1765 (+ OnboardingStandardFormModal.vue:496-505)
        $this->actingAs($user)->postJson('/api/projects/install', ['service_id' => VirtualService::ID, 'domain_id' => $application->id])
            // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1767-1768 (response.data.data)
            ->assertStatus(422)
            ->assertJsonValidationErrors('admin_email');
    }

    public function test_a_plan_that_does_not_allow_a_project_type_refuses_it(): void
    {
        $this->bindPlan(allowsType: false);
        try {
            app(OnboardingGate::class)->assertProjectType($this->hostingService(), ServiceOnboarding::TYPE_GIT);
            $this->fail('The plan must refuse the project type.');
        } catch (ValidationException $e) {
            $this->assertNotEmpty($e->errors());
        }
    }

    private function hostingService(): HostingService
    {
        $user = User::factory()->create();
        $service = app(ServiceDirectory::class)->findForUser($user, VirtualService::ID);
        $this->assertNotNull($service);

        return $service;
    }
}
