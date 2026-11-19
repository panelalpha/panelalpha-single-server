<?php

namespace Tests\Feature\EngineClient;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Jobs\Application\CopyProjectJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineFeatures;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * `EngineFeatures` decides per Engine connection which Engine calls the panel
 * makes (`GET system/info` `features`, Engine 2.3.0). Its answer is cached for
 * 600 s; a failed read must not fall back to "an older Engine" while that
 * Engine has answered before, because the fallback changes the request shape:
 * `CopyProjectJob` clones synchronously (`POST /projects/{u}/clone`, an rsync
 * held open for up to `EngineClient::LONG_TIMEOUT_SECONDS`) instead of creating
 * the copy with a `project` source (engine-699-migration.md B11).
 *
 * Only the last features that Engine itself listed are used, so a downgrade
 * still wins at its next answer and an Engine never read successfully keeps
 * the old calls.
 *
 * @see Engine core/app/Http/Controllers/SystemController.php:46 (`info`), :55 (`features`)
 * @see Engine core/app/Lib/Host/ApiFeatures.php:19 (`ApiFeatures::ALL`)
 * @see Engine core/app/Lib/Project/ProjectCopier.php:50 (the 202 the copy answers)
 */
final class EngineFeaturesTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function engine(): EngineClient
    {
        return new EngineClient(new EngineConnection(EngineConnection::DEFAULT_ID, self::ENGINE, '1|test-token'));
    }

    private function sourceApplication(): Application
    {
        // A direct row: the copy job reads only the source's Engine connection.
        return Application::query()->forceCreate([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_username' => 'site1',
            'domain' => 'site1.example.com',
            'status' => 'active',
        ]);
    }

    /**
     * A `system/info` hiccup after the 600 s cache lapsed: the Engine's own last
     * answer still decides the copy, so it stays a create with a `project`
     * source and never the synchronous clone.
     */
    public function test_a_failed_read_keeps_the_last_features_and_the_typed_copy(): void
    {
        $this->configureEngine();
        // The fixture recorded an Engine 2.2.0 (`remember([])`); read this one's answer.
        Cache::flush();
        $source = $this->sourceApplication();

        // Engine: core/app/Http/Controllers/SystemController.php:46 -> info, :55 `features`
        Http::fake(['engine.example.com/api/system/info' => Http::sequence()
            // Engine: core/app/Http/Controllers/SystemController.php:55 -> a 2.3.0 lists the feature
            ->push(['data' => ['version' => '2.3.0', 'features' => [EngineFeatures::PROJECT_SOURCE]]])
            // Defensive (not an Engine shape): the Engine stops answering
            ->whenEmpty(Http::response(['message' => 'Service Unavailable'], 503)),
        ]);

        $this->assertTrue(EngineFeatures::supports($this->engine(), EngineFeatures::PROJECT_SOURCE));

        // The 600 s cache has lapsed: the next check reads `system/info` again,
        // which now fails.
        $this->travel(11)->minutes();

        $this->assertTrue(EngineFeatures::supports($this->engine(), EngineFeatures::PROJECT_SOURCE));

        Queue::fake();
        // Engine: core/app/Lib/Project/ProjectCopier.php:45 -> queue (202 + CopyProject task)
        Http::fake(['engine.example.com/api/projects' => Http::response(['data' => [
            'id' => 77,
            'username' => 'site1copy',
            'status' => 'queued',
            'job_type' => 'App\\Jobs\\CopyProject',
            'details' => ['domain' => 'site1copy.example.com', 'action' => 'copy', 'source_type' => 'project', 'from' => 'site1', 'copy_databases' => true],
        ]], 202)]);

        (new CopyProjectJob($source->id))->handle(app(ApplicationSynchronizer::class));

        Http::assertSent(static fn (Request $request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects')
            && $request->data() === ['source' => ['type' => 'project', 'from' => 'site1', 'copy_databases' => true]]);
        Http::assertNotSent(static fn (Request $request): bool => str_contains($request->url(), '/clone'));
    }

    /**
     * An Engine this panel never read successfully has no last known good
     * answer: a failed read is still "no features", the pre-2.3.0 copy and the
     * flat create bodies, as before.
     */
    public function test_an_engine_never_read_successfully_has_no_features(): void
    {
        $this->configureEngine();
        // Nothing was ever read from this Engine; the fixture's `remember([])` is not an answer.
        Cache::flush();
        $source = $this->sourceApplication();

        // Engine: core/app/Http/Controllers/SystemController.php:46 -> info, failing
        Http::fake(['engine.example.com/api/system/info' => Http::response(['message' => 'Service Unavailable'], 503)]);

        $this->assertFalse(EngineFeatures::supports($this->engine(), EngineFeatures::PROJECT_SOURCE));

        Queue::fake();
        Notification::fake();
        // Engine: core/app/Http/Controllers/UserController.php:948 -> clone (synchronous rsync)
        Http::fake(['engine.example.com/api/projects/site1/clone' => Http::response(['data' => $this->engineProject(11, 'site1copy')])]);

        (new CopyProjectJob($source->id))->handle(app(ApplicationSynchronizer::class));

        Http::assertSent(static fn (Request $request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects/site1/clone'));
        Http::assertNotSent(static fn (Request $request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects'));
    }

    /**
     * An Engine that really drops the feature (a downgrade) loses it at its next
     * answer: the successful read overwrites the last known good one, so a later
     * failed read cannot bring the feature back.
     */
    public function test_a_later_answer_without_the_feature_wins(): void
    {
        $this->configureEngine();
        Cache::flush();

        // Engine: core/app/Http/Controllers/SystemController.php:46 -> info, :55 `features`
        Http::fake(['engine.example.com/api/system/info' => Http::sequence()
            // Engine: core/app/Http/Controllers/SystemController.php:55 -> a 2.3.0 lists the feature
            ->push(['data' => ['version' => '2.3.0', 'features' => [EngineFeatures::PROJECT_SOURCE]]])
            // Engine: core/app/Lib/Host/ApiFeatures.php:19 -> an Engine without the list has no features
            ->push(['data' => ['version' => '2.2.0']])
            // Defensive (not an Engine shape): the downgraded Engine stops answering
            ->whenEmpty(Http::response(['message' => 'Service Unavailable'], 503)),
        ]);

        $this->assertTrue(EngineFeatures::supports($this->engine(), EngineFeatures::PROJECT_SOURCE));

        $this->travel(11)->minutes();
        $this->assertFalse(EngineFeatures::supports($this->engine(), EngineFeatures::PROJECT_SOURCE));

        $this->travel(11)->minutes();
        $this->assertFalse(EngineFeatures::supports($this->engine(), EngineFeatures::PROJECT_SOURCE));
    }
}
