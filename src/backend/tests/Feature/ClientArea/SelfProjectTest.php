<?php

namespace Tests\Feature\ClientArea;

use App\Models\Setting;
use App\Models\User;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\SelfProject;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The panel never manages itself. The Engine
 * username of the panel's own project is the operator's
 * `PANELALPHA_SELF_PROJECT`, or else the project the Engine names for the
 * panel's token (`GET tokens/current`); the sync never mirrors it and every
 * read hides it, so a route bound to it answers 404 like an unknown project.
 *
 * @see Engine core/routes/api.php:141 (GET /projects/all) – the source of the
 *      self project row a pre-fix sync imported
 */
final class SelfProjectTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function enableSelfProject(string $username = 'panelv1'): void
    {
        config(['client-area.self_project' => $username]);
    }

    /**
     * Create the panel's own project row directly, bypassing the sync filter,
     * so a read test proves the read guard and not only "the sync skipped it".
     * `$container` mirrors the Engine `dind` details, so the row reaches the
     * container list when the read guard is the only thing hiding it.
     */
    private function insertSelfRow(string $username = 'panelv1', bool $container = false): Application
    {
        return Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_project_id' => 2,
            'engine_username' => $username,
            'name' => 'panelv1',
            'domain' => 'panel.example.com',
            'status' => 'active',
            'engine_payload' => $container ? ['details' => ['template' => 'dind']] : null,
        ]);
    }

    /**
     * Engine: core/app/Http/Controllers/UserController.php:110 → UserController::listAll
     */
    private function fakeProjects(array $projects): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:122 → UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => $projects])]);
    }

    public function test_the_self_project_username_is_read_from_config(): void
    {
        $this->assertNull(SelfProject::username(), 'an unset value disables the guard');

        $this->enableSelfProject();
        $this->assertSame('panelv1', SelfProject::username());
        $this->assertTrue(SelfProject::matches('panelv1'));
        $this->assertFalse(SelfProject::matches('site1'));
        $this->assertFalse(SelfProject::matches(null));

        config(['client-area.self_project' => '']);
        $this->assertNull(SelfProject::username(), 'a blank value disables the guard');
    }

    public function test_the_sync_does_not_import_the_self_project(): void
    {
        $this->enableSelfProject();
        $this->configureEngine();
        $this->fakeProjects([
            $this->engineProject(2, 'panelv1'),
            $this->engineProject(10, 'site1'),
        ]);

        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);

        $this->assertDatabaseMissing('applications', ['engine_username' => 'panelv1']);
        $this->assertDatabaseHas('applications', ['engine_username' => 'site1']);
    }

    public function test_the_sync_removes_a_previously_mirrored_self_project(): void
    {
        // A pre-fix install mirrored the panel's own project; a sync after the
        // upgrade must drop it.
        $this->insertSelfRow();
        $this->enableSelfProject();
        $this->configureEngine();
        $this->fakeProjects([]);

        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);

        $this->assertDatabaseMissing('applications', ['engine_username' => 'panelv1']);
    }

    public function test_the_project_list_excludes_the_self_project(): void
    {
        $user = User::factory()->create();
        $this->enableSelfProject();
        $this->configureEngine();
        // Sync first so the freshness marker skips the sync on the request and
        // the read filter is what hides the row.
        $this->fakeProjects([$this->engineProject(10, 'site1')]);
        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);
        $self = $this->insertSelfRow();

        // CA: packages/client-area/src/apis/Instances.js:76
        $response = $this->actingAs($user)->getJson('/api/projects');
        // CA reads: packages/client-area/src/apis/Instances.js:80
        $response->assertOk()->assertJsonMissing(['id' => $self->id]);
    }

    /**
     * One representative bound route per area: the `{application}` route binding
     * goes through ApplicationRepository::findForUser, which hides the self row.
     *
     * @return array<string, array{string}>
     */
    public static function selfProjectRoutes(): array
    {
        return [
            'projects' => ['/api/projects/%d'],
            'deploys' => ['/api/projects/%d/deploy-logs'],
            'hosting' => ['/api/server-accounts/%d/mysql/databases'],
            'file manager' => ['/api/file-manager/initialize/%d'],
            'env file' => ['/api/server-accounts/%d/instances/%d/env-file/meta'],
        ];
    }

    #[DataProvider('selfProjectRoutes')]
    public function test_a_route_bound_to_the_self_project_answers_404(string $uri): void
    {
        $user = User::factory()->create();
        $self = $this->insertSelfRow();
        $this->enableSelfProject();
        $this->configureEngine();
        $this->fakeProjects([]);

        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson(sprintf($uri, $self->id, $self->id))->assertStatus(404);
    }

    public function test_the_service_level_lists_exclude_the_self_project(): void
    {
        $user = User::factory()->create();
        $this->enableSelfProject();
        $this->configureEngine();
        $this->fakeProjects([$this->engineProject(10, 'site1')]);
        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);
        // A container (DinD) row: `ContainerService::groupsFor` skips non-DinD
        // projects, so only a DinD self row proves the containers list reads
        // through the excluding-self scope.
        $self = $this->insertSelfRow(container: true);

        // The service/domains list and the service/containers list read the
        // repository, not a bound id.
        // CA: packages/client-area/src/apis/Instances.js:76
        $domains = $this->actingAs($user)->getJson('/api/services/1/domains');
        // CA reads: packages/client-area/src/apis/Instances.js:80
        $domains->assertOk()->assertJsonMissing(['id' => $self->id]);

        // CA: packages/client-area/src/apis/Instances.js:76
        $containers = $this->actingAs($user)->getJson('/api/services/1/containers');
        // CA reads: packages/client-area/src/apis/Instances.js:80
        $containers->assertOk()->assertJsonMissing(['id' => $self->id]);
    }

    /**
     * An Engine the panel has not asked yet: the fixture's "no project" answer
     * is dropped, so the next read asks `GET tokens/current`.
     */
    private function configureUnaskedEngine(): void
    {
        $this->configureEngine();
        Cache::flush();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private static function currentToken(array $overrides = []): array
    {
        return ['data' => array_merge(['token_id' => 12, 'project' => 'panelv1', 'system' => true, 'expires_at' => null], $overrides)];
    }

    private function fakeCurrentToken(mixed $answer): void
    {
        // Engine: core/app/Http/Controllers/TokenController.php:41-49 -> show, the answer each test gives
        Http::fake(['engine.example.com/api/tokens/current' => $answer]);
    }

    private static function isCurrentTokenRead(Request $request): bool
    {
        return $request->method() === 'GET' && $request->url() === self::ENGINE.'/tokens/current';
    }

    public function test_the_operators_value_wins_over_the_engine(): void
    {
        $this->enableSelfProject('panel');
        $this->configureUnaskedEngine();
        // Engine: core/app/Http/Controllers/TokenController.php:41-49 -> show, {data:{token_id, project, system, expires_at}}
        $this->fakeCurrentToken(Http::response(self::currentToken()));

        $this->assertSame('panel', SelfProject::username());
        $this->assertTrue(SelfProject::matches('panel'));
        $this->assertFalse(SelfProject::matches('panelv1'));
        Http::assertNothingSent();
    }

    public function test_without_the_operators_value_the_engine_names_the_project(): void
    {
        config(['client-area.self_project' => '']);
        $this->configureUnaskedEngine();
        // Engine: core/app/Http/Controllers/TokenController.php:41-49 -> show, {data:{token_id, project, system, expires_at}}
        $this->fakeCurrentToken(Http::response(self::currentToken()));

        $this->assertSame('panelv1', SelfProject::username());
        $this->assertTrue(SelfProject::matches('panelv1'));
        Http::assertSent(static fn (Request $request): bool => self::isCurrentTokenRead($request)
            && $request->hasHeader('Authorization', 'Bearer 1|test-token'));
    }

    public function test_the_sync_skips_the_project_the_engine_names(): void
    {
        $this->configureUnaskedEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/TokenController.php:41-49 -> show, {data:{token_id, project, system, expires_at}}
            'engine.example.com/api/tokens/current' => Http::response(self::currentToken()),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [
                $this->engineProject(2, 'panelv1'),
                $this->engineProject(10, 'site1'),
            ]]),
        ]);

        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);

        $this->assertDatabaseMissing('applications', ['engine_username' => 'panelv1']);
        $this->assertDatabaseHas('applications', ['engine_username' => 'site1']);
    }

    /**
     * An Engine without the endpoint (404, or 405 where only `DELETE
     * tokens/current` exists), a token no project holds, a failing or an
     * unreachable Engine.
     *
     * @return array<string, array{Closure}>
     */
    public static function answersWithoutAProject(): array
    {
        return [
            // Defensive (not an Engine shape): an Engine with no `tokens/current` route at all
            'no endpoint' => [static fn () => Http::response(['message' => 'Not Found'], 404)],
            // Engine: core/app/Http/Controllers/TokenController.php:63 -> destroy, the only `tokens/current` route of 2.3.0
            'delete only' => [static fn () => Http::response(['message' => 'The GET method is not supported for route api/tokens/current.'], 405)],
            // Engine: core/app/Http/Controllers/TokenController.php:41-49 -> show, {data:{token_id, project, system, expires_at}}
            'no project' => [static fn () => Http::response(self::currentToken(['project' => null, 'system' => false]))],
            // Defensive (not an Engine shape): a blank project name
            'blank project' => [static fn () => Http::response(self::currentToken(['project' => '']))],
            // Defensive (not an Engine shape): the Engine fails
            'engine error' => [static fn () => Http::response(['message' => 'Server Error'], 500)],
            'unreachable' => [static fn () => Http::failedConnection()],
        ];
    }

    #[DataProvider('answersWithoutAProject')]
    public function test_an_answer_without_a_project_is_null_and_never_throws(Closure $answer): void
    {
        $this->configureUnaskedEngine();
        $this->fakeCurrentToken($answer());

        $this->assertNull(SelfProject::username());
        $this->assertFalse(SelfProject::matches('panelv1'));
    }

    public function test_the_answer_is_cached_until_the_token_changes(): void
    {
        $this->configureUnaskedEngine();
        // Engine: core/app/Http/Controllers/TokenController.php:41-49 -> show, {data:{token_id, project, system, expires_at}}
        $this->fakeCurrentToken(Http::sequence()
            // Engine: core/app/Http/Controllers/TokenController.php:41-49 -> show, {data:{token_id, project, system, expires_at}}
            ->push(self::currentToken())
            // Engine: core/app/Http/Controllers/TokenController.php:41-49 -> show, {data:{token_id, project, system, expires_at}}
            ->push(self::currentToken(['project' => 'panelv2'])));

        $this->assertSame('panelv1', SelfProject::username());
        $this->assertSame('panelv1', SelfProject::username());
        $this->travel(12)->hours();
        $this->assertSame('panelv1', SelfProject::username());
        Http::assertSentCount(1);

        Setting::set('engine-api-token', '2|rotated-token');

        $this->assertSame('panelv2', SelfProject::username());
        Http::assertSentCount(2);
    }

    public function test_a_failed_lookup_is_asked_again_a_minute_later(): void
    {
        $this->configureUnaskedEngine();
        // Engine: core/app/Http/Controllers/TokenController.php:41-49 -> show, {data:{token_id, project, system, expires_at}}
        $this->fakeCurrentToken(Http::sequence()
            // Defensive (not an Engine shape): the Engine fails once
            ->push(['message' => 'Server Error'], 500)
            // Engine: core/app/Http/Controllers/TokenController.php:41-49 -> show, {data:{token_id, project, system, expires_at}}
            ->push(self::currentToken()));

        $this->assertNull(SelfProject::username());
        $this->assertNull(SelfProject::username());
        Http::assertSentCount(1);

        $this->travel(61)->seconds();

        $this->assertSame('panelv1', SelfProject::username());
        Http::assertSentCount(2);
    }
}
