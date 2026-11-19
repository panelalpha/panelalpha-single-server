<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Jobs\Application\ReplaceClassicOnboardingProjectJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ClassicOnboardingGitAttacher;
use PanelAlpha\ClientArea\Projects\ClassicOnboardingState;
use PanelAlpha\ClientArea\Projects\EngineGitSourceAttacher;
use PanelAlpha\ClientArea\Projects\GitSourceAttacher;
use PanelAlpha\ClientArea\Projects\OnboardingDeployService;
use PanelAlpha\ClientArea\Support\VirtualService;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The git source attach is a controller contract with the plain `POST source`
 * {@see EngineGitSourceAttacher} as its default and the classic-onboarding
 * replacement extracted. The deploy-log relations were dynamic relations
 * registered by the legacy provider's boot() (the label relation was one too
 * until it became the model's own). The classic-onboarding replacement is
 * controller code and the seam's default (it delegates to the plain
 * attacher), so the attach is no longer a legacy seam.
 *
 * @see src/Projects/GitSourceAttacher.php
 * @see ../packages/client-area-legacy/src/Models/ApplicationRelations.php
 */
class GitSourceAttacherSeamTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_the_git_source_attacher_contract_is_the_extracted_seam(): void
    {
        $this->assertTrue(interface_exists(GitSourceAttacher::class));
        $reflection = new \ReflectionClass(GitSourceAttacher::class);
        $this->assertStringNotContainsString('@legacy-seam', (string) $reflection->getDocComment());
        // The domain-step hook owns `onboarding_at`.
        $this->assertSame(['attach', 'domainStepCreated'], array_map(static fn (\ReflectionMethod $m): string => $m->getName(), $reflection->getMethods()));
    }

    public function test_the_container_binds_the_classic_onboarding_attacher_by_default(): void
    {
        $this->assertInstanceOf(ClassicOnboardingGitAttacher::class, app(GitSourceAttacher::class));
    }

    public function test_the_engine_attacher_posts_the_plain_source(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->assertFalse(ClassicOnboardingState::isUntouchedOnboardingProject($application));

        // Engine: core/app/Http/Controllers/UserController.php:1045 -> attachSource
        Http::fake(['engine.example.com/api/projects/site1/source' => Http::response(['data' => ['id' => 9, 'status' => 'queued']], 202)]);

        $result = (new EngineGitSourceAttacher)->attach($application, [
            'git_repo' => 'https://github.com/acme/site.git',
            'git_branch' => 'main',
            'git_token' => null,
            'env_vars' => [],
        ], 'user.instance.installation_finished', 'user.instance.installation_failed');

        $this->assertTrue($result->accepted);
        $this->assertSame(9, $result->taskId);
        Http::assertSent(fn ($request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects/site1/source'));
    }

    public function test_the_classic_attacher_replaces_an_untouched_classic_project(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user, ['template' => '']);
        $application->forceFill(['onboarding_at' => now()])->save();
        Http::fake();

        $application = $application->fresh();
        $this->assertTrue(ClassicOnboardingState::isUntouchedOnboardingProject($application));

        $attacher = new ClassicOnboardingGitAttacher(new EngineGitSourceAttacher);
        $result = $attacher->attach($application, [
            'git_repo' => 'https://github.com/acme/site.git',
            'git_branch' => 'main',
            'git_token' => null,
            'env_vars' => [],
        ], 'user.instance.installation_finished', 'user.instance.installation_failed');

        // The replacement job owns the attach; no Engine call happens here. The
        // swap is marked at once (the pending install row used to do
        // this), so a repeated deploy answers the accepted state without a
        // second replacement.
        $this->assertFalse($result->accepted);
        $this->assertNotNull($application->fresh()->replacing_at);
        $this->assertTrue(ClassicOnboardingState::isReplacing($application->fresh()));
        Queue::assertPushed(ReplaceClassicOnboardingProjectJob::class, 1);
        Http::assertNothingSent();

        $again = $attacher->attach($application->fresh(), [
            'git_repo' => 'https://github.com/acme/site.git',
            'git_branch' => 'main',
            'git_token' => null,
            'env_vars' => [],
        ], 'user.instance.installation_finished', 'user.instance.installation_failed');

        $this->assertFalse($again->accepted);
        Queue::assertPushed(ReplaceClassicOnboardingProjectJob::class, 1);
        Http::assertNothingSent();
    }

    public function test_the_onboarding_deploy_uses_the_attacher_seam(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Http::fake();

        $this->app->instance(HostGuard::class, new class implements HostGuard
        {
            public function assertAllowed(string $host): void {}

            public function allows(string $host): bool
            {
                return true;
            }

            public function validatedAddresses(string $host): array
            {
                return [$host];
            }
        });

        $attacher = new W3RecordingGitSourceAttacher;
        $this->app->instance(GitSourceAttacher::class, $attacher);

        app(OnboardingDeployService::class)->deployFromGit($user, [
            'repo_url' => 'https://github.com/acme/site.git',
            'branch' => 'main',
            'domain_id' => $application->id,
        ]);

        $this->assertSame(1, $attacher->calls);
        // The only Engine read is the git-install check on the Engine's deploys
        //The attach itself is the seam's.
        Http::assertNotSent(static fn ($request): bool => ! str_ends_with($request->url(), '/api/projects/site1/deploys'));
    }

    public function test_the_label_relation_is_real_and_no_deploy_log_relation_is_left(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Labels are a Client Area feature, so the controller
        // model declares their relation. The deploy-log relations (legacy's
        // dynamic relations) left with the panel deploy history.
        $this->assertTrue(method_exists(Application::class, 'applicationLabels'));
        $this->assertFalse(method_exists(Application::class, 'deployLogs'));
        $this->assertFalse(method_exists(Application::class, 'latestDeployLog'));
        $this->assertFalse(class_exists('PanelAlpha\\ClientAreaLegacy\\Models\\ApplicationRelations'));

        $application->applicationLabels()->create(['title' => 'Prod', 'color' => '#ff0000']);

        $loaded = Application::query()->with(['applicationLabels'])->findOrFail($application->id);
        $this->assertSame('Prod', $loaded->applicationLabels->first()->title);
        $this->expectException(\Illuminate\Database\Eloquent\RelationNotFoundException::class);
        Application::query()->with('latestDeployLog')->findOrFail($application->id);
    }

    /**
     * The plain domain step hands its project to the seam, and
     * the domain step itself never writes `onboarding_at` (the classic-onboarding
     * attacher does, the controller default).
     */
    public function test_the_plain_domain_step_records_its_marker_through_the_seam(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll; :300 -> projects storeAsync
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            'engine.example.com/api/projects' => Http::response(['data' => ['id' => 55, 'username' => 'shop']], 202),
        ]);

        $attacher = new W3RecordingGitSourceAttacher;
        $this->app->instance(GitSourceAttacher::class, $attacher);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1566
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['domain' => 'shop.example.com'])
            ->assertStatus(202);

        $application = Application::query()->where('engine_username', 'shop')->sole();
        $this->assertSame([[$application->id, null]], $attacher->domainSteps);
        // The recording seam keeps nothing, so nothing else wrote the marker.
        $this->assertNull($application->onboarding_at);
    }

    /**
     * The classic-onboarding attacher (the controller default) marks only the classic project of the plain domain step; the plain
     * attacher marks nothing.
     */
    public function test_only_the_classic_onboarding_attacher_marks_the_plain_domain_step(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $legacy = app(ClassicOnboardingGitAttacher::class);

        (new EngineGitSourceAttacher)->domainStepCreated($application, null);
        $this->assertNull($application->fresh()->onboarding_at);

        $legacy->domainStepCreated($application, 'git');
        $legacy->domainStepCreated($application, 'files');
        $this->assertNull($application->fresh()->onboarding_at);

        $legacy->domainStepCreated($application, null);
        $this->assertNotNull($application->fresh()->onboarding_at);
        $this->assertTrue(ClassicOnboardingState::isUntouchedOnboardingProject($application->fresh()));
    }

    /**
     * @param  array<string, mixed>  $details
     */
    private function application(User $user, array $details = ['template' => 'dind']): Application
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', ['details' => $details]),
        ]])]);

        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        return Application::query()->where('engine_username', 'site1')->firstOrFail();
    }
}

/**
 * Test-only git source attacher: records the call and answers `handled`, so a
 * service that bypassed the seam would reach the Engine.
 */
final class W3RecordingGitSourceAttacher implements GitSourceAttacher
{
    public int $calls = 0;

    /** @var list<array{int, string|null}> */
    public array $domainSteps = [];

    public function domainStepCreated(Application $application, ?string $sourceType): void
    {
        $this->domainSteps[] = [$application->id, $sourceType];
    }

    public function attach(Application $application, array $source, string $finishedType, string $failedType): \PanelAlpha\ClientArea\Projects\GitSourceAttachResult
    {
        $this->calls++;

        return \PanelAlpha\ClientArea\Projects\GitSourceAttachResult::handled();
    }
}
