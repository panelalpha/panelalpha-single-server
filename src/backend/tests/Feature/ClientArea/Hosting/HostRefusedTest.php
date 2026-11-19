<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Sleep;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\VirtualService;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Jobs\Application\AttachGitSourceJob;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The Engine refuses to fetch a user URL whose host resolves to
 * an internal address (since Engine `6466e2711`) with a 422 whose
 * `problems[].code` is `host_refused`. The panel answers it with exactly the
 * old-style message of its own `HostGuard`/`DnsHostGuard` refusal (`host`:
 * "The host cannot be reached from the panel."), whichever caller passed the
 * URL – the Engine text names the internal address. The panel guard stays as
 * defence in depth: here it passes (the host resolves publicly for the panel)
 * and the Engine refuses (it resolves internally for the Engine, e.g. split DNS
 * or a rebinding answer).
 *
 * One test per caller shape:
 * - the onboarding repository test (`OnboardingService::testGitUrl`): the same
 *   `error_message` the guard's refusal gives (the branches read and the
 *   `.env.example` preview keep the generic text);
 * - an Engine 422 that reaches the CA (the central mapping in
 *   `Support\EngineErrors`): the onboarding git create (`POST E:/projects`), the
 *   onboarding domain step with a git source, the git attach to a project
 *   (`POST E:/projects/{u}/source`), git connect (`POST E:/git/connect`);
 * - a background job's stored error and notification (`AttachGitSourceJob`,
 *   through `EngineErrors::message()`).
 * The domain probes (`DomainProbe`, `SslProbe`) are panel-side, pinned
 * to the project's IP, and pass no host to the Engine, so they have no Engine
 * refusal to map. The panel never calls the Engine's other fetch
 * (`POST E:/files/fetch`).
 *
 * Engine (`dbb8b97ef`): the refusal is a `ProblemException` 422
 * `{message, errors:{<field>:[…]}, problems:[{field, code: host_refused,
 * message, …}]}` (`Exceptions/Handler.php:169-186`), from
 * `RepositoryAddress::problem()` (`Lib/Deploy/Source/RepositoryAddress.php:22-41`:
 * `/source/refs` field `repository`, `SourceRefsController.php:98-104`;
 * `/source/inspect` field `source`, `SourceResolver.php:135-146`; `POST
 * /projects` and `POST /projects/{u}/source` field `git_repo`,
 * `ProjectCreator.php:326-331`) and `EgressGuard::problem()` (`git/connect`
 * field `repo_url`, `Lib/Git/GitActions.php:185-190`).
 */
final class HostRefusedTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const REPO = 'https://git.example.com/acme/site.git';

    private const PANEL_REFUSAL = 'The host cannot be reached from the panel.';

    protected function setUp(): void
    {
        parent::setUp();
        $this->configureEngine();
        // The panel's own guard lets the host through: it resolves publicly here.
        $this->fakeHostResolver(['git.example.com' => [TestNetwork::routable(40)]]);
    }

    /**
     * The Engine's refusal body for one field.
     *
     * @return array<string, mixed>
     */
    private static function refusal(string $field): array
    {
        $message = 'git.example.com resolves to '.TestNetwork::private(5).', which this engine does not fetch from.';

        return [
            'message' => $message,
            'errors' => [$field => [$message]],
            'problems' => [[
                'field' => $field,
                'code' => 'host_refused',
                'message' => $message,
                'expected' => 'a repository on a public address',
                'examples' => ['https://github.com/owner/repo.git'],
            ]],
        ];
    }

    public function test_the_mapped_text_is_the_panel_guards_own(): void
    {
        $this->assertSame(self::PANEL_REFUSAL, HostGuard::REFUSAL);

        $e = new EngineValidationException('refused', ['repo_url' => [TestNetwork::private(5).' is internal']], [
            ['field' => 'repo_url', 'code' => 'host_refused', 'message' => TestNetwork::private(5).' is internal'],
        ]);
        $this->assertSame(['host' => [self::PANEL_REFUSAL]], EngineErrors::validation($e)->errors());
        $this->assertSame(self::PANEL_REFUSAL, EngineErrors::message($e));
        $this->assertSame([['field' => 'host', 'code' => 'host_refused', 'message' => self::PANEL_REFUSAL]], EngineErrors::problems($e));
    }

    public function test_the_onboarding_source_routes_answer_the_guards_refusal(): void
    {
        $user = User::factory()->create();

        Http::fake([
            // Engine: core/app/Http/Controllers/SourceRefsController.php:98-104 -> refuseRefusedHost() (field repository)
            'engine.example.com/api/source/refs' => Http::response(self::refusal('repository'), 422),
            // Engine: core/app/Lib/Deploy/Inspect/SourceResolver.php:135-146 -> assertCloneable() (field source)
            'engine.example.com/api/source/inspect' => Http::response(self::refusal('source'), 422),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:230 (POST /instances/test-git-url)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:235 / :237 (result.success / result.error_message)
        $this->actingAs($user)
            ->postJson('/api/projects/test-git-url', ['repo_url' => self::REPO])
            ->assertOk()
            ->assertJson(['success' => false, 'error_message' => self::PANEL_REFUSAL]);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:248 (POST /instances/git-branches)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:254 / :255 (branches / default_branch)
        $this->actingAs($user)
            ->postJson('/api/projects/git-branches', ['repo_url' => self::REPO])
            ->assertOk()
            ->assertJson(['success' => false, 'error_message' => 'Could not read the repository.', 'branches' => []]);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:268 (POST /instances/preview-env-example)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingEnvVarsModal.vue:241 (has_example / variables)
        $this->actingAs($user)
            ->postJson('/api/projects/preview-env-example', ['repo_url' => self::REPO])
            ->assertOk()
            ->assertJson(['has_example' => false, 'error_message' => 'Could not read the repository.']);

        // The Engine was asked: the panel guard passed and the Engine refused.
        Http::assertSentCount(3);
    }

    public function test_the_onboarding_git_create_answers_the_guards_refusal(): void
    {
        $user = User::factory()->create();
        Queue::fake();
        // Engine: core/app/Lib/Project/ProjectCreator.php:326-331 -> assertRepositoryReachable() (field git_repo)
        Http::fake(['engine.example.com/api/projects' => Http::response(self::refusal('git_repo'), 422)]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'source_type' => 'git',
                'repo_url' => self::REPO,
                'branch' => 'main',
            ])
            // CA reads: packages/client-area/src/apis/Api.js:80 (`host: <message>`, as the panel guard's refusal)
            ->assertStatus(422)
            ->assertExactJson(['message' => self::PANEL_REFUSAL, 'errors' => ['host' => [self::PANEL_REFUSAL]]]);
    }

    public function test_the_onboarding_domain_step_with_a_git_source_answers_the_guards_refusal(): void
    {
        $user = User::factory()->create();
        // Engine: core/app/Lib/Project/ProjectCreator.php:326-331 -> assertRepositoryReachable() (field git_repo)
        Http::fake(['engine.example.com/api/projects' => Http::response(self::refusal('git_repo'), 422)]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1561
        $this->actingAs($user)
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'domain' => 'shop.example.com',
                'source_type' => 'git',
                'repo_url' => self::REPO,
            ])
            // CA reads: packages/client-area/src/apis/Api.js:80 (`host: <message>`)
            ->assertStatus(422)
            ->assertJsonPath('errors.host.0', self::PANEL_REFUSAL)
            ->assertJsonMissingPath('errors.git_repo');
    }

    public function test_the_git_attach_to_a_project_answers_the_guards_refusal(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        // No git install is listed yet (the onboarding check reads the Engine).
        $this->fakeEngineDeploys('site1');
        Queue::fake();
        // Engine: core/app/Lib/Project/ProjectCreator.php:289-293 -> resolvedSource() (SourceAttacher.php:38, field git_repo)
        Http::fake(['engine.example.com/api/projects/site1/source' => Http::response(self::refusal('git_repo'), 422)]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'git',
                'repo_url' => self::REPO,
                'branch' => 'main',
            ])
            // CA reads: packages/client-area/src/apis/Api.js:80 (`host: <message>`)
            ->assertStatus(422)
            ->assertJsonPath('errors.host.0', self::PANEL_REFUSAL);
    }

    public function test_git_connect_answers_the_guards_refusal(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        // Engine: core/app/Lib/Git/GitActions.php:185-190 -> EgressGuard::problem() (field repo_url)
        Http::fake(['engine.example.com/api/projects/site1/git/connect' => Http::response(self::refusal('repo_url'), 422)]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/connect", [
                'repo_url' => self::REPO,
                'branch' => 'main',
                'auth_type' => null,
                'token' => null,
            ])
            // CA reads: packages/client-area/src/apis/Api.js:80 (`host: <message>`)
            ->assertStatus(422)
            ->assertJsonPath('errors.host.0', self::PANEL_REFUSAL)
            ->assertJsonMissingPath('errors.repo_url');
    }

    public function test_a_background_git_attach_notifies_the_guards_refusal(): void
    {
        Sleep::fake();
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);

        Notification::fake();
        Queue::fake();
        // Engine: core/app/Lib/Project/ProjectCreator.php:289-293 -> resolvedSource() (SourceAttacher.php:38, field git_repo)
        Http::fake(['engine.example.com/api/projects/site1/source' => Http::response(self::refusal('git_repo'), 422)]);

        (new AttachGitSourceJob(
            $application->id,
            ['git_repo' => self::REPO, 'git_branch' => 'main', 'git_token' => null, 'env_vars' => []],
            'user.instance.installation_finished',
            'user.instance.installation_failed',
            startedAt: now()->getTimestamp(),
        ))->handle();

        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $n): bool => $n->broadcastType() === 'user.instance.installation_failed'
                && ($n->payload['message'] ?? null) === self::PANEL_REFUSAL,
        );
    }
}
