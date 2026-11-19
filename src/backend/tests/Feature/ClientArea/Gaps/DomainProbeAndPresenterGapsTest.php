<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Hosting\DomainProbe;
use PanelAlpha\ClientArea\Hosting\HostResolver;
use PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\WordPressService;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The domain probe when the Engine address is unusable, the async status the
 * project card shows for each Engine state and the WordPress auto-update writes.
 */
class DomainProbeAndPresenterGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * @param  list<string>  $addresses  what the Engine host resolves to
     */
    private function probe(array $addresses = []): DomainProbe
    {
        $this->app->instance(HostResolver::class, new class($addresses) implements HostResolver
        {
            /** @param list<string> $addresses */
            public function __construct(private readonly array $addresses) {}

            public function addresses(string $host): array
            {
                return $this->addresses;
            }
        });

        return app(DomainProbe::class);
    }

    // ---- DomainProbe ------------------------------------------------------

    public function test_a_domain_does_not_resolve_when_the_engine_address_is_unknown(): void
    {
        $user = User::factory()->create();
        $this->syncedApplication($user);
        Setting::set('engine-api-url', 'engine');

        $this->assertFalse($this->probe()->resolves('site1.example.com', ['site1.example.com']));
    }

    public function test_the_engine_address_is_none_when_the_engine_is_not_configured(): void
    {
        $this->assertNull($this->probe()->engineAddress());
    }

    public function test_an_engine_url_with_an_ip_literal_is_its_own_address(): void
    {
        Setting::set('engine-api-url', 'https://'.TestNetwork::public(30).':2011/api');
        Setting::set('engine-api-token', '1|test-token');

        $this->assertSame(TestNetwork::public(30), $this->probe()->engineAddress());
    }

    public function test_the_engine_address_skips_blank_answers_of_the_resolver(): void
    {
        $this->configureEngine();

        $this->assertSame(TestNetwork::public(31), $this->probe([' ', '[]', ' ['.TestNetwork::public(31).'] '])->engineAddress());
    }

    public function test_the_engine_address_is_none_when_the_resolver_gives_only_blank_answers(): void
    {
        $this->configureEngine();

        $this->assertNull($this->probe([' ', ''])->engineAddress());
    }

    // ---- ProjectPresenter -------------------------------------------------

    /**
     * @return array<string, array{string, ?string}>
     */
    public static function pushStatusProvider(): array
    {
        return [
            'completed' => ['completed', 'finished'],
            'success' => ['success', 'finished'],
            'running' => ['running', 'in_progress'],
            'failed' => ['failed', 'failed'],
            'error' => ['error', 'failed'],
            'pending' => ['pending', 'pending'],
            'queued' => ['queued', 'pending'],
            'something new' => ['paused', null],
        ];
    }

    #[DataProvider('pushStatusProvider')]
    public function test_the_card_maps_the_engine_push_status(string $engine, ?string $card): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['async_status' => ['push' => $engine]]]);

        $item = app(ProjectPresenter::class)->present($application, $user);

        $this->assertSame($card, $item['async_status']['pull_from_staging']);
    }

    public function test_a_staging_whose_parent_row_is_missing_shows_no_parent(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $application->staging_of_id = 99999;

        $item = app(ProjectPresenter::class)->present($application, $user);

        $this->assertNull($item['parent_instance'] ?? null);
    }

    public function test_the_core_update_status_is_read_from_the_panels_table_for_a_single_project(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $application->wordpressAsyncStatuses()->create(['type' => 'core', 'name' => 'core', 'action' => 'update', 'status' => 'in_progress']);

        $item = app(ProjectPresenter::class)->present(Application::query()->findOrFail($application->id), $user);

        $this->assertSame('in_progress', $item['async_status']['update']);
    }

    // ---- WordPressService -------------------------------------------------

    public function test_auto_update_writes_the_plugin_and_theme_switches_that_changed(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpAutoUpdateController.php:83 -> show (everything off); :134 -> update
        Http::fake(['engine.example.com/api/projects/site1/wp/auto-update*' => Http::response(['data' => ['core' => 'off', 'plugins' => 'off', 'themes' => 'off']])]);

        app(WordPressService::class)->setAutoUpdate($application, ['auto_update_plugins' => 1, 'auto_update_themes' => 1]);

        Http::assertSent(fn ($request): bool => $request->method() === 'PUT'
            && $request['plugins'] === 'on'
            && $request['themes'] === 'on'
            && ! isset($request['core']));
    }
}
