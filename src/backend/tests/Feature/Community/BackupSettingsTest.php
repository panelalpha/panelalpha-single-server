<?php

namespace Tests\Feature\Community;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The owner's backup settings (`/api/community/backups`): the active store, the
 * defaults for new projects and the destination the project cards use.
 */
class BackupSettingsTest extends TestCase
{
    use EngineFixtures;
    use RefreshDatabase;

    /** @var list<array<string, mixed>> */
    private array $containers = [];

    private int $nextId = 10;

    private ?string $testFailure = null;

    /** @var list<int> containers a schedule or a backup uses */
    private array $inUse = [];

    /** @var array<int, array{int, bool}> DELETE answers by id: the status, and whether the container goes anyway */
    private array $deleteAnswers = [];

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function signedIn(): static
    {
        $this->configureEngine();

        return $this->actingAs(User::factory()->create());
    }

    /**
     * A stateful fake of the Engine's backup-container endpoints.
     *
     * @param  list<array<string, mixed>>  $existing
     */
    private function fakeContainers(array $existing = []): void
    {
        $this->containers = $existing;
        $this->nextId = 10;
        Http::fake(function (Request $request) {
            $path = parse_url($request->url(), PHP_URL_PATH);
            if (! is_string($path) || ! str_contains($path, '/backup-containers')) {
                // Defensive (not an Engine shape): a request outside the backup-containers endpoints is a test bug
            return Http::response(['message' => 'unexpected'], 500);
            }

            // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index
            if ($request->method() === 'GET') {
                return Http::response(['data' => $this->containers]);
            }

            if (str_ends_with($path, '/test')) {
                if ($this->testFailure !== null) {
                    // Engine: core/app/Http/Controllers/BackupContainerController.php:251 -> BackupContainerController::test (422 with the storage's error)
                    return Http::response(['message' => $this->testFailure], 422);
                }

                // Engine: core/app/Http/Controllers/BackupContainerController.php:251 -> BackupContainerController::test
                return Http::response(['data' => ['ok' => true]]);
            }

            if ($request->method() === 'DELETE') {
                $id = (int) basename($path);
                if (! in_array($id, array_column($this->containers, 'id'), true)) {
                    // Engine: core/app/Http/Controllers/BackupContainerController.php:194 -> BackupContainerController::destroy (unknown id)
                    return Http::response(['message' => 'No query results for model [App\\Models\\BackupContainer] '.$id], 404);
                }
                if (in_array($id, $this->inUse, true)) {
                    // Engine: core/app/Http/Controllers/BackupContainerController.php:194 -> BackupContainerController::destroy (a schedule or a backup still uses it)
                    return Http::response(['message' => 'The backup container is in use.'], 409);
                }
                if (isset($this->deleteAnswers[$id])) {
                    [$status, $removed] = $this->deleteAnswers[$id];
                    if ($removed) {
                        $this->containers = array_values(array_filter($this->containers, fn ($c) => $c['id'] !== $id));
                    }

                    // Engine: core/app/Http/Controllers/BackupContainerController.php:194 -> BackupContainerController::destroy (an answer that failed, with or without the row gone)
                    return Http::response(['message' => 'Server Error'], $status);
                }
                $this->containers = array_values(array_filter($this->containers, fn ($c) => $c['id'] !== $id));

                // Engine: core/app/Http/Controllers/BackupContainerController.php:194 -> BackupContainerController::destroy
                return Http::response('', 204);
            }

            $container = [
                'id' => $this->nextId++,
                'name' => $request['name'],
                'driver' => $request['driver'],
                'location' => $request['location'],
                'has_credentials' => isset($request['credentials']),
            ];
            $this->containers[] = $container;

            // Engine: core/app/Http/Controllers/BackupContainerController.php:79 -> BackupContainerController::store
            return Http::response(['data' => $container], 201);
        });
    }

    /**
     * @return list<Request>
     */
    private function sent(string $method, string $pathEnd = ''): array
    {
        $out = [];
        foreach (Http::recorded() as [$request]) {
            if ($request->method() === $method && str_ends_with((string) parse_url($request->url(), PHP_URL_PATH), $pathEnd)) {
                $out[] = $request;
            }
        }

        return $out;
    }

    /**
     * @param  array<string, mixed>  $override
     * @return array<string, mixed>
     */
    private function defaults(array $override = []): array
    {
        return array_merge([
            'auto_enable' => true,
            'frequency' => 'weekly',
            'hour' => 1,
            'day_of_week' => 5,
            'day_of_month' => 1,
            'keep_last' => 14,
        ], $override);
    }

    public function test_get_returns_the_fallback_defaults_and_no_store(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers();

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->getJson('/api/community/backups')
            ->assertOk()
            ->assertExactJson([
                'store' => null,
                'store_selected' => false,
                'store_created' => false,
                'defaults' => [
                    'auto_enable' => true,
                    'frequency' => 'daily',
                    'hour' => 3,
                    'day_of_week' => 0,
                    'day_of_month' => 1,
                    'keep_last' => 7,
                ],
                'drivers' => ['local', 's3', 'sftp', 'ftp', 'ftps'],
                'default_local_location' => '/opt/panelalpha/backups/local',
            ]);
    }

    public function test_put_saves_the_defaults(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers();

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->putJson('/api/community/backups', $this->defaults())
            ->assertOk()
            ->assertJsonPath('defaults', $this->defaults());

        $settings = app(PanelSettings::class);
        $this->assertSame('1', $settings->get('userapp.backups.auto-enable'));
        $this->assertSame('weekly', $settings->get('userapp.backups.frequency'));
        $this->assertSame('1', $settings->get('userapp.backups.hour'));
        $this->assertSame('5', $settings->get('userapp.backups.day-of-week'));
        $this->assertSame('14', $settings->get('userapp.backups.keep-last'));

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->putJson('/api/community/backups', $this->defaults(['auto_enable' => false]))
            ->assertOk()
            ->assertJsonPath('defaults.auto_enable', false);
        $this->assertSame('0', $settings->get('userapp.backups.auto-enable'));
    }

    /**
     * @return array<string, array{array<string, mixed>, string}>
     */
    public static function invalidDefaults(): array
    {
        return [
            'unknown frequency' => [['frequency' => 'hourly'], 'frequency'],
            'hour too large' => [['hour' => 24], 'hour'],
            'weekday too large' => [['day_of_week' => 7], 'day_of_week'],
            'month day zero' => [['day_of_month' => 0], 'day_of_month'],
            'month day 29 skips months' => [['day_of_month' => 29], 'day_of_month'],
            'keep zero' => [['keep_last' => 0], 'keep_last'],
            'keep too many' => [['keep_last' => 366], 'keep_last'],
        ];
    }

    /**
     * @param  array<string, mixed>  $override
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('invalidDefaults')]
    public function test_put_refuses_invalid_defaults(array $override, string $field): void
    {
        $client = $this->signedIn();
        $this->fakeContainers();

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->putJson('/api/community/backups', $this->defaults($override))
            ->assertStatus(422)
            ->assertJsonValidationErrors($field);
    }

    public function test_put_requires_every_default(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers();

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->putJson('/api/community/backups', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['auto_enable', 'frequency', 'hour', 'day_of_week', 'day_of_month', 'keep_last']);
    }

    public function test_local_store_is_tested_on_a_temporary_container_then_created(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers();

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups'])
            ->assertOk()
            ->assertJsonPath('store.driver', 'local')
            ->assertJsonPath('store.location', '/opt/panelalpha/backups');

        $creates = $this->sent('POST', '/backup-containers');
        $this->assertCount(2, $creates);
        $this->assertStringStartsWith('panel-store-test-', $creates[0]['name']);
        $this->assertStringStartsWith('panel-local-', $creates[1]['name']);
        $this->assertCount(1, $this->sent('POST', '/test'));
        $this->assertCount(1, $this->sent('DELETE', '/10'));

        $this->assertSame([['id' => 11, 'name' => $creates[1]['name'], 'driver' => 'local', 'location' => '/opt/panelalpha/backups', 'has_credentials' => false]], $this->containers);
        $this->assertSame('11', app(PanelSettings::class)->get('userapp.backups.store'));
    }

    public function test_saving_the_same_local_store_again_creates_no_container(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers([['id' => 4, 'name' => 'panel-local-20261001000000', 'driver' => 'local', 'location' => '/opt/panelalpha/backups']]);

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups'])
            ->assertOk()
            ->assertJsonPath('store.id', 4);

        // Only the temporary probe was created (and deleted); no second real container.
        $this->assertCount(1, $this->sent('POST', '/backup-containers'));
        $this->assertCount(1, $this->containers);
        $this->assertSame('4', app(PanelSettings::class)->get('userapp.backups.store'));
    }

    public function test_removing_the_store_deletes_the_container_the_panel_created(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers([['id' => 2, 'name' => 'a-local', 'driver' => 'local', 'location' => '/opt/panelalpha/backups', 'default' => true]]);
        $settings = app(PanelSettings::class);

        // CA: packages/client-area/src/views/free/BackupStoreModal.vue:273 (the 422 messages are shown in the modal)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_created)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups/fx27'])
            ->assertOk()
            ->assertJsonPath('store_created', true)
            ->assertJsonPath('cleanup', null);
        $this->assertSame('11', $settings->get('userapp.backups.stores-created'));
        $this->assertNull($settings->get('userapp.backups.store-created'));

        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_selected, cleanup)
        $client->deleteJson('/api/community/backups/store')
            ->assertOk()
            ->assertJsonPath('store.id', 2)
            ->assertJsonPath('store_selected', false)
            ->assertJsonPath('store_created', false)
            ->assertJsonPath('cleanup.id', 11)
            ->assertJsonPath('cleanup.container', 'deleted');

        $this->assertCount(1, $this->sent('DELETE', '/11'));
        $this->assertSame([2], array_column($this->containers, 'id'));
        $this->assertNull($settings->get('userapp.backups.store'));
        $this->assertNull($settings->get('userapp.backups.stores-created'));
        $this->assertNull($settings->get('userapp.backups.store-created'));
    }

    public function test_removing_the_store_keeps_the_container_a_schedule_still_uses(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers([['id' => 2, 'name' => 'a-local', 'driver' => 'local', 'location' => '/opt/panelalpha/backups', 'default' => true]]);

        // CA: packages/client-area/src/views/free/BackupStoreModal.vue:273 (the 422 messages are shown in the modal)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups/fx27'])->assertOk();
        $this->inUse = [11];

        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_selected, cleanup)
        $client->deleteJson('/api/community/backups/store')
            ->assertOk()
            ->assertJsonPath('store.id', 2)
            ->assertJsonPath('cleanup.id', 11)
            ->assertJsonPath('cleanup.container', 'kept')
            ->assertJsonPath('cleanup.reason', 'in_use');

        $this->assertCount(1, $this->sent('DELETE', '/11'));
        $this->assertSame([2, 11], array_column($this->containers, 'id'));
        $this->assertNull(app(PanelSettings::class)->get('userapp.backups.store'));
    }

    public function test_a_store_a_removal_kept_in_use_is_still_the_panels_and_is_deleted_on_a_later_removal(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers([['id' => 2, 'name' => 'a-local', 'driver' => 'local', 'location' => '/opt/panelalpha/backups', 'default' => true]]);
        $settings = app(PanelSettings::class);

        // CA: packages/client-area/src/views/free/BackupStoreModal.vue:273 (the 422 messages are shown in the modal)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_created)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups/fx27'])
            ->assertOk()
            ->assertJsonPath('store_created', true);
        $this->inUse = [11];

        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_selected, cleanup)
        $client->deleteJson('/api/community/backups/store')
            ->assertOk()
            ->assertJsonPath('cleanup.id', 11)
            ->assertJsonPath('cleanup.container', 'kept')
            ->assertJsonPath('cleanup.reason', 'in_use');

        // The backup that used it is deleted; the owner chooses the same directory again.
        $this->inUse = [];
        // CA: packages/client-area/src/views/free/BackupStoreModal.vue:273 (the 422 messages are shown in the modal)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_created)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups/fx27'])
            ->assertOk()
            ->assertJsonPath('store.id', 11)
            ->assertJsonPath('store_created', true);
        $this->assertSame('11', $settings->get('userapp.backups.stores-created'), 'the container the Engine kept is still the panel\'s');
        $this->assertSame([2, 11], array_column($this->containers, 'id'), 'the reused store is not created again');

        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_selected, cleanup)
        $client->deleteJson('/api/community/backups/store')
            ->assertOk()
            ->assertJsonPath('cleanup.id', 11)
            ->assertJsonPath('cleanup.container', 'deleted');

        $this->assertCount(2, $this->sent('DELETE', '/11'), 'the kept store is tried again on the later removal');
        $this->assertSame([2], array_column($this->containers, 'id'));
        $this->assertNull($settings->get('userapp.backups.stores-created'));
    }

    public function test_a_store_the_engine_kept_when_the_owner_changed_it_can_be_deleted_after_going_back(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers([['id' => 2, 'name' => 'a-local', 'driver' => 'local', 'location' => '/opt/panelalpha/backups', 'default' => true]]);
        $settings = app(PanelSettings::class);

        // CA: packages/client-area/src/views/free/BackupStoreModal.vue:273 (the 422 messages are shown in the modal)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups/a'])->assertOk();
        $this->inUse = [11];

        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, cleanup)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups/b'])
            ->assertOk()
            ->assertJsonPath('store.id', 13)
            ->assertJsonPath('cleanup.id', 11)
            ->assertJsonPath('cleanup.reason', 'in_use');

        // CA: packages/client-area/src/views/free/BackupStoreModal.vue:273 (the 422 messages are shown in the modal)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_created)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups/a'])
            ->assertOk()
            ->assertJsonPath('store.id', 11)
            ->assertJsonPath('store_created', true)
            ->assertJsonPath('cleanup.id', 13)
            ->assertJsonPath('cleanup.container', 'deleted');
        $this->assertSame('11', $settings->get('userapp.backups.stores-created'));

        $this->inUse = [];
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_selected, cleanup)
        $client->deleteJson('/api/community/backups/store')
            ->assertOk()
            ->assertJsonPath('cleanup.id', 11)
            ->assertJsonPath('cleanup.container', 'deleted');

        $this->assertSame([2], array_column($this->containers, 'id'));
        $this->assertNull($settings->get('userapp.backups.stores-created'));
    }

    public function test_a_store_saved_before_the_id_list_stays_the_panels_after_a_kept_removal(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers([
            ['id' => 2, 'name' => 'a-local', 'driver' => 'local', 'location' => '/opt/panelalpha/backups', 'default' => true],
            ['id' => 12, 'name' => 'panel-local-20261001000000', 'driver' => 'local', 'location' => '/opt/panelalpha/backups/fx27'],
        ]);
        $settings = app(PanelSettings::class);
        // The settings an earlier build saved: the store and whether the panel made it.
        $settings->set('userapp.backups.store', '12');
        $settings->set('userapp.backups.store-created', '1');
        $this->inUse = [12];

        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_selected, cleanup)
        $client->deleteJson('/api/community/backups/store')
            ->assertOk()
            ->assertJsonPath('cleanup.id', 12)
            ->assertJsonPath('cleanup.reason', 'in_use');

        $this->inUse = [];
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_created)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups/fx27'])
            ->assertOk()
            ->assertJsonPath('store.id', 12)
            ->assertJsonPath('store_created', true);
        $this->assertSame('12', $settings->get('userapp.backups.stores-created'));

        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_selected, cleanup)
        $client->deleteJson('/api/community/backups/store')
            ->assertOk()
            ->assertJsonPath('cleanup.id', 12)
            ->assertJsonPath('cleanup.container', 'deleted');

        $this->assertSame([2], array_column($this->containers, 'id'));
        $this->assertNull($settings->get('userapp.backups.stores-created'));
    }

    public function test_removing_a_store_the_panel_did_not_create_only_forgets_it(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers([['id' => 4, 'name' => 'panel-local-20261001000000', 'driver' => 'local', 'location' => '/opt/panelalpha/backups']]);

        // CA: packages/client-area/src/views/free/BackupStoreModal.vue:273 (the 422 messages are shown in the modal)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_created)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups'])
            ->assertOk()
            ->assertJsonPath('store.id', 4)
            ->assertJsonPath('store_created', false);

        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_selected, cleanup)
        $client->deleteJson('/api/community/backups/store')
            ->assertOk()
            ->assertJsonPath('store.id', 4)
            ->assertJsonPath('cleanup.id', 4)
            ->assertJsonPath('cleanup.container', 'kept')
            ->assertJsonPath('cleanup.reason', 'not_ours');

        $this->assertSame([], $this->sent('DELETE', '/4'), 'a store the panel did not create is never deleted');
        $this->assertSame([4], array_column($this->containers, 'id'));
        $this->assertNull(app(PanelSettings::class)->get('userapp.backups.store'));
    }

    public function test_removing_without_a_chosen_store_changes_nothing(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers([['id' => 2, 'name' => 'a-local', 'driver' => 'local', 'location' => '/opt/panelalpha/backups', 'default' => true]]);

        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_selected, cleanup)
        $client->deleteJson('/api/community/backups/store')
            ->assertOk()
            ->assertJsonPath('store.id', 2)
            ->assertJsonPath('store_selected', false)
            ->assertJsonPath('cleanup', null);

        $this->assertSame([], $this->sent('DELETE'));
        $this->assertSame([2], array_column($this->containers, 'id'));
    }

    public function test_a_container_that_is_already_gone_counts_as_removed(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers([['id' => 2, 'name' => 'a-local', 'driver' => 'local', 'location' => '/opt/panelalpha/backups', 'default' => true]]);
        app(PanelSettings::class)->set('userapp.backups.store', '12');
        app(PanelSettings::class)->set('userapp.backups.store-created', '1');

        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_selected, cleanup)
        $client->deleteJson('/api/community/backups/store')
            ->assertOk()
            ->assertJsonPath('store.id', 2)
            ->assertJsonPath('cleanup.id', 12)
            ->assertJsonPath('cleanup.container', 'deleted');

        $this->assertCount(1, $this->sent('DELETE', '/12'));
        $this->assertNull(app(PanelSettings::class)->get('userapp.backups.store'));
        $this->assertNull(app(PanelSettings::class)->get('userapp.backups.stores-created'));
    }

    public function test_a_container_the_engine_removed_before_it_failed_the_answer_counts_as_removed(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers([['id' => 2, 'name' => 'a-local', 'driver' => 'local', 'location' => '/opt/panelalpha/backups', 'default' => true]]);

        // CA: packages/client-area/src/views/free/BackupStoreModal.vue:273 (the 422 messages are shown in the modal)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups/fx27'])->assertOk();
        // The Engine deletes the row and then answers 500, as a local store it cannot clean up does.
        $this->deleteAnswers = [11 => [500, true]];

        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_selected, cleanup)
        $client->deleteJson('/api/community/backups/store')
            ->assertOk()
            ->assertJsonPath('store.id', 2)
            ->assertJsonPath('cleanup.id', 11)
            ->assertJsonPath('cleanup.container', 'deleted');

        $this->assertSame([2], array_column($this->containers, 'id'));
    }

    public function test_a_container_the_engine_failed_to_delete_stays_and_the_answer_says_so(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers([['id' => 2, 'name' => 'a-local', 'driver' => 'local', 'location' => '/opt/panelalpha/backups', 'default' => true]]);

        // CA: packages/client-area/src/views/free/BackupStoreModal.vue:273 (the 422 messages are shown in the modal)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups/fx27'])->assertOk();
        $this->deleteAnswers = [11 => [500, false]];

        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, store_selected, cleanup)
        $client->deleteJson('/api/community/backups/store')
            ->assertOk()
            ->assertJsonPath('cleanup.id', 11)
            ->assertJsonPath('cleanup.container', 'kept')
            ->assertJsonPath('cleanup.reason', 'error');

        $this->assertSame([2, 11], array_column($this->containers, 'id'));
        $this->assertNull(app(PanelSettings::class)->get('userapp.backups.store'));
    }

    public function test_changing_the_store_deletes_the_container_it_created_when_nothing_uses_it(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers([['id' => 2, 'name' => 'a-local', 'driver' => 'local', 'location' => '/opt/panelalpha/backups', 'default' => true]]);

        // CA: packages/client-area/src/views/free/BackupStoreModal.vue:273 (the 422 messages are shown in the modal)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups/a'])->assertOk();

        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, cleanup)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups/b'])
            ->assertOk()
            ->assertJsonPath('store.id', 13)
            ->assertJsonPath('cleanup.id', 11)
            ->assertJsonPath('cleanup.container', 'deleted');

        $this->assertCount(1, $this->sent('DELETE', '/11'));
        $this->assertSame([2, 13], array_column($this->containers, 'id'));
        $this->assertSame('13', app(PanelSettings::class)->get('userapp.backups.store'));
    }

    public function test_changing_the_store_keeps_the_previous_container_when_it_is_in_use(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers([['id' => 2, 'name' => 'a-local', 'driver' => 'local', 'location' => '/opt/panelalpha/backups', 'default' => true]]);

        // CA: packages/client-area/src/views/free/BackupStoreModal.vue:273 (the 422 messages are shown in the modal)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups/a'])->assertOk();
        $this->inUse = [11];

        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, cleanup)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups/b'])
            ->assertOk()
            ->assertJsonPath('store.id', 13)
            ->assertJsonPath('cleanup.id', 11)
            ->assertJsonPath('cleanup.container', 'kept')
            ->assertJsonPath('cleanup.reason', 'in_use');

        $this->assertSame([2, 11, 13], array_column($this->containers, 'id'));
    }

    public function test_changing_the_store_leaves_the_container_the_panel_reused(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers([['id' => 4, 'name' => 'panel-local-20261001000000', 'driver' => 'local', 'location' => '/opt/panelalpha/backups/a']]);

        // CA: packages/client-area/src/views/free/BackupStoreModal.vue:273 (the 422 messages are shown in the modal)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups/a'])->assertOk();

        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, cleanup)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/opt/panelalpha/backups/b'])
            ->assertOk()
            ->assertJsonPath('store.id', 12)
            ->assertJsonPath('cleanup', null);

        $this->assertSame([], $this->sent('DELETE', '/4'), 'a store the panel did not create is never deleted');
        $this->assertSame([4, 12], array_column($this->containers, 'id'));
    }

    public function test_remote_store_sends_credentials_and_always_creates_a_new_container(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers([['id' => 4, 'name' => 'panel-sftp-20261001000000', 'driver' => 'sftp', 'location' => '/backups']]);

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->putJson('/api/community/backups/store', [
            'driver' => 'sftp',
            'location' => '/backups',
            'credentials' => ['host' => 'backup.example.com', 'port' => 22, 'username' => 'u', 'password' => 'secret'],
        ])
            ->assertOk()
            ->assertJsonPath('store.id', 11);

        $creates = $this->sent('POST', '/backup-containers');
        $this->assertCount(2, $creates);
        $this->assertSame(
            ['host' => 'backup.example.com', 'port' => 22, 'username' => 'u', 'password' => 'secret'],
            $creates[1]['credentials'],
        );
        $this->assertSame([], $this->sent('PUT'));
        $this->assertCount(2, $this->containers);
        $this->assertSame('11', app(PanelSettings::class)->get('userapp.backups.store'));
    }

    public function test_s3_store_sends_the_bucket_as_location_and_the_folder_as_prefix(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers();

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->putJson('/api/community/backups/store', [
            'driver' => 's3',
            'location' => 'my-bucket',
            'credentials' => [
                'access_key_id' => 'AKIA',
                'secret_access_key' => 'shh',
                'region' => 'eu-central-1',
                'endpoint' => '',
                'use_path_style_endpoint' => false,
                'prefix' => 'panelalpha/',
            ],
        ])->assertOk();

        $created = $this->sent('POST', '/backup-containers')[1];
        $this->assertSame('my-bucket', $created['location']);
        $this->assertSame([
            'access_key_id' => 'AKIA',
            'secret_access_key' => 'shh',
            'region' => 'eu-central-1',
            'use_path_style_endpoint' => false,
            'prefix' => 'panelalpha/',
        ], $created['credentials']);
    }

    public function test_a_failed_connection_test_returns_the_engine_message_and_stores_nothing(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers();
        $this->testFailure = 'SFTP authentication failed.';

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->putJson('/api/community/backups/store', [
            'driver' => 'sftp',
            'location' => '/backups',
            'credentials' => ['host' => 'backup.example.com', 'port' => 22, 'username' => 'u', 'password' => 'wrong'],
        ])
            ->assertStatus(422)
            ->assertJsonPath('errors.store.0', 'SFTP authentication failed.');

        $this->assertSame([], $this->containers, 'the temporary container is deleted');
        $this->assertCount(1, $this->sent('DELETE', '/10'));
        $this->assertNull(app(PanelSettings::class)->get('userapp.backups.store'));
    }

    public function test_store_requires_the_credentials_of_its_driver(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers();

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->putJson('/api/community/backups/store', ['driver' => 'sftp', 'location' => '/b', 'credentials' => ['host' => 'h']])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['credentials.username', 'credentials.password', 'credentials.private_key', 'credentials.port']);

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->putJson('/api/community/backups/store', ['driver' => 'nope', 'location' => '/b'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('driver');

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->putJson('/api/community/backups/store', ['driver' => 'local'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('location');

        $this->assertSame([], $this->sent('POST'), 'nothing reached the Engine');
    }

    /**
     * @return array<string, array{0: string, 1: bool}>
     */
    public static function localLocations(): array
    {
        return [
            'opt root' => ['/opt/panelalpha', true],
            'under opt' => ['/opt/panelalpha/backups/', true],
            'a home subdirectory' => ['/home/owner/backups', true],
            'engine storage' => ['/var/www/html/storage/backups', true],
            'home itself' => ['/home', false],
            'filesystem root' => ['/', false],
            'outside the roots' => ['/srv/backups', false],
            'a sibling of opt' => ['/opt/panelalpha-other', false],
            'a .. segment' => ['/opt/panelalpha/../../etc', false],
            'relative' => ['backups', false],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('localLocations')]
    public function test_a_local_store_must_be_a_directory_the_engine_persists(string $location, bool $accepted): void
    {
        $client = $this->signedIn();
        $this->fakeContainers();

        // CA: packages/client-area/src/apis/FreePanel.js:28 -> CommunityPanel.updateBackupStore
        // CA reads: packages/client-area/src/views/free/BackupStoreModal.vue:273 (the 422 messages are shown in the modal)
        $response = $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => $location]);

        if ($accepted) {
            $response->assertOk();

            return;
        }
        // The panel's own sentence: the Engine's refusal names internal paths and would be masked.
        // CA reads: packages/client-area/src/views/free/BackupStoreModal.vue:273 (the 422 messages are shown in the modal)
        $response->assertStatus(422)->assertJsonValidationErrors('location');
        $this->assertStringContainsString('/opt/panelalpha', (string) $response->json('errors.location.0'));
        $this->assertSame([], $this->sent('POST'), 'nothing reached the Engine');
    }

    public function test_a_vault_reference_is_refused_in_every_secret(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers();

        // CA: packages/client-area/src/apis/FreePanel.js:28 -> CommunityPanel.updateBackupStore
        // CA reads: packages/client-area/src/views/free/BackupStoreModal.vue:273 (the 422 messages are shown in the modal)
        $client->putJson('/api/community/backups/store', [
            'driver' => 'sftp',
            'location' => '/backups',
            'credentials' => ['host' => 'h', 'port' => 22, 'username' => 'u', 'password' => 'vault:12', 'private_key' => ' Vault:7', 'passphrase' => 'vault:3'],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['credentials.password', 'credentials.private_key', 'credentials.passphrase']);

        // CA: packages/client-area/src/apis/FreePanel.js:28 -> CommunityPanel.updateBackupStore
        // CA reads: packages/client-area/src/views/free/BackupStoreModal.vue:273 (the 422 messages are shown in the modal)
        $client->putJson('/api/community/backups/store', [
            'driver' => 's3',
            'location' => 'bucket',
            'credentials' => ['access_key_id' => 'AK', 'secret_access_key' => 'vault:9', 'region' => 'eu-west-1'],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['credentials.secret_access_key']);

        // CA: packages/client-area/src/apis/FreePanel.js:28 -> CommunityPanel.updateBackupStore
        // CA reads: packages/client-area/src/views/free/BackupStoreModal.vue:273 (the 422 messages are shown in the modal)
        $client->putJson('/api/community/backups/store', [
            'driver' => 'ftp',
            'location' => '/b',
            'credentials' => ['host' => 'h', 'port' => 21, 'username' => 'u', 'password' => 'vault:1'],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['credentials.password']);

        $this->assertSame([], $this->sent('POST'), 'nothing reached the Engine');
    }

    public function test_the_endpoints_require_authentication(): void
    {
        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $this->getJson('/api/community/backups')->assertUnauthorized();
        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $this->putJson('/api/community/backups')->assertUnauthorized();
        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $this->putJson('/api/community/backups/store')->assertUnauthorized();
        // CA: packages/client-area/src/apis/FreePanel.js:28 -> CommunityPanel.updateBackupStore
        $this->deleteJson('/api/community/backups/store')->assertUnauthorized();
    }

    public function test_the_endpoints_are_a_404_outside_single_user_mode(): void
    {
        $this->bindMultiUserEdition([]);
        $client = $this->signedIn();
        $this->fakeContainers();

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->getJson('/api/community/backups')->assertNotFound();
        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->putJson('/api/community/backups', $this->defaults())->assertNotFound();
        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->putJson('/api/community/backups/store', ['driver' => 'local', 'location' => '/x'])->assertNotFound();
        // The gate answers before validation.
        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->putJson('/api/community/backups/store', [])->assertNotFound();
        // The gate answers before anything is cleared.
        // CA: packages/client-area/src/apis/FreePanel.js:28 -> CommunityPanel.updateBackupStore
        $client->deleteJson('/api/community/backups/store')->assertNotFound();
        $this->assertSame([], $this->sent('POST'), 'nothing reached the Engine');
    }

    public function test_the_active_store_falls_back_to_the_first_container_when_the_saved_one_is_gone(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers([
            ['id' => 2, 'name' => 'a-first', 'driver' => 'local', 'location' => '/x'],
            ['id' => 3, 'name' => 'b-second', 'driver' => 'local', 'location' => '/y'],
        ]);
        $settings = app(PanelSettings::class);

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->getJson('/api/community/backups')->assertJsonPath('store.id', 2);

        $settings->set('userapp.backups.store', '3');
        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->getJson('/api/community/backups')->assertJsonPath('store.id', 3);

        $settings->set('userapp.backups.store', '99');
        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->getJson('/api/community/backups')->assertJsonPath('store.id', 2);
    }

    public function test_the_active_store_is_the_engines_default_when_the_panel_has_none(): void
    {
        $client = $this->signedIn();
        // Engine orders the list by name, so the default is not the first entry.
        $this->fakeContainers([
            ['id' => 2, 'name' => 'a-local', 'driver' => 'local', 'location' => '/opt/panelalpha/backups', 'has_credentials' => false, 'default' => false],
            ['id' => 3, 'name' => 'z-remote', 'driver' => 's3', 'location' => 'bucket', 'has_credentials' => true, 'default' => true],
        ]);

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->getJson('/api/community/backups')
            ->assertOk()
            ->assertJsonPath('store.id', 3)
            ->assertJsonPath('store.driver', 's3');

        app(PanelSettings::class)->set('userapp.backups.store', '99');
        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->getJson('/api/community/backups')->assertJsonPath('store.id', 3);
    }

    public function test_a_saved_store_wins_over_the_engines_default(): void
    {
        $client = $this->signedIn();
        $this->fakeContainers([
            ['id' => 2, 'name' => 'a-local', 'driver' => 'local', 'location' => '/opt/panelalpha/backups', 'has_credentials' => false, 'default' => false],
            ['id' => 3, 'name' => 'z-remote', 'driver' => 's3', 'location' => 'bucket', 'has_credentials' => true, 'default' => true],
        ]);
        app(PanelSettings::class)->set('userapp.backups.store', '2');

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the backups calls are added in Phase 3)
        // CA reads: packages/client-area/src/apis/FreePanel.js:5 (store, defaults, drivers, default_local_location; Phase 3)
        $client->getJson('/api/community/backups')->assertJsonPath('store.id', 2);
    }

    private function cardPut(object $client, int $id): void
    {
        // CA: packages/client-area/src/router/fetchData.js:110
        // CA reads: packages/client-area/src/router/fetchData.js:110
        $client->putJson("/api/projects/{$id}/wordpress/automatic-backup", ['frequency' => 'daily', 'cron_hour' => 4, 'cron_minute' => 15])
            ->assertOk();
    }

    public function test_a_card_save_keeps_the_projects_current_retention_and_uses_the_saved_store(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        app(PanelSettings::class)->set('userapp.backups.keep-last', '7');
        app(PanelSettings::class)->set('userapp.backups.store', '3');
        // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index
        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:32 -> BackupScheduleController::show
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => [['id' => 2, 'name' => 'a'], ['id' => 3, 'name' => 'b']]]),
            'engine.example.com/api/projects/site1/backup-schedule' => Http::response(['data' => ['container_id' => 2, 'cron' => '0 3 * * *', 'keep_last' => 30]]),
        ]);

        $this->cardPut($this->actingAs($user), $application->id);

        Http::assertSent(fn (Request $r) => $r->method() === 'PUT'
            && str_ends_with($r->url(), '/backup-schedule')
            && $r['container'] === '3'
            && $r['keep_last'] === 30);
    }

    public function test_a_card_save_uses_the_engines_default_store_when_the_panel_has_none(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index
        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:32 -> BackupScheduleController::show
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => [
                ['id' => 2, 'name' => 'a-local', 'driver' => 'local', 'default' => false],
                ['id' => 3, 'name' => 'z-remote', 'driver' => 's3', 'default' => true],
            ]]),
            'engine.example.com/api/projects/site1/backup-schedule' => Http::response(['data' => null]),
        ]);

        $this->cardPut($this->actingAs($user), $application->id);

        Http::assertSent(fn (Request $r) => $r->method() === 'PUT'
            && str_ends_with($r->url(), '/backup-schedule')
            && $r['container'] === '3');
    }

    public function test_a_card_save_of_a_project_without_a_schedule_uses_the_settings_retention(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        app(PanelSettings::class)->set('userapp.backups.keep-last', '14');
        // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index
        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:32 -> BackupScheduleController::show
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => [['id' => 2, 'name' => 'a']]]),
            'engine.example.com/api/projects/site1/backup-schedule' => Http::response(['data' => null]),
        ]);

        $this->cardPut($this->actingAs($user), $application->id);

        Http::assertSent(fn (Request $r) => $r->method() === 'PUT'
            && str_ends_with($r->url(), '/backup-schedule')
            && $r['container'] === '2'
            && $r['keep_last'] === 14);
    }

    public function test_a_card_save_without_any_store_is_refused(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index
        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:32 -> BackupScheduleController::show
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => []]),
            'engine.example.com/api/projects/site1/backup-schedule' => Http::response(['data' => null]),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:110
        // CA reads: packages/client-area/src/router/fetchData.js:110
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/automatic-backup", ['frequency' => 'daily', 'cron_hour' => 4, 'cron_minute' => 15])
            ->assertStatus(422);

        $this->assertSame([], $this->sent('PUT'));
    }
}
