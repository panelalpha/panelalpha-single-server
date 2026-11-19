<?php

namespace Tests\Feature\ClientArea;

use Illuminate\Foundation\Testing\RefreshDatabase;
use PanelAlpha\ClientArea\Contracts\MirrorDeletionScope;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\ClientArea\Jobs\Application\ReplaceClassicOnboardingProjectJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Sync\ReplacingMarkerDeletionScope;
use Tests\TestCase;

/**
 * The sync's keep-row clause is a tagged `MirrorDeletionScope`; the controller
 * tags `ReplacingMarkerDeletionScope` (client-area-legacy tagged it before it
 * moved into the controller).
 * The end-to-end behaviour is asserted by `ReplaceClassicOnboardingProjectJobTest`.
 *
 * Contract:
 * - Engine: the row is absent from `GET projects/all`
 *   (`core/app/Http/Controllers/UserController.php:122`) between the replace
 *   job's delete and create, so the panel keeps it.
 */
final class MirrorDeletionScopeSeamTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_controller_tags_the_replacing_scope(): void
    {
        $scopes = iterator_to_array($this->app->tagged(MirrorDeletionScope::TAG));

        $classes = array_map(static fn (object $scope): string => $scope::class, $scopes);

        $this->assertContains(ReplacingMarkerDeletionScope::class, $classes);
    }

    public function test_the_replacing_scope_keeps_only_a_fresh_marker(): void
    {
        $fresh = $this->application('fresh', now());
        $stale = $this->application('stale', now()->subSeconds(ReplaceClassicOnboardingProjectJob::STALE_AFTER_SECONDS + 1));
        $normal = $this->application('normal', null);

        $query = Application::query();
        (new ReplacingMarkerDeletionScope)->apply($query);
        $query->delete();

        $this->assertDatabaseHas('applications', ['id' => $fresh->id]);
        $this->assertDatabaseMissing('applications', ['id' => $stale->id]);
        $this->assertDatabaseMissing('applications', ['id' => $normal->id]);
    }

    private function application(string $username, ?\DateTimeInterface $replacingAt): Application
    {
        return Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_username' => $username,
            'domain' => $username.'.example.com',
            'status' => 'active',
            'replacing_at' => $replacingAt,
        ]);
    }
}
