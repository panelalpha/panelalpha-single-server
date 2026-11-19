<?php

namespace Tests\Feature\Community\Gaps;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use PanelAlpha\Community\Backups\BackupDefaults;
use PanelAlpha\Community\Backups\BackupStoreManager;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Saving the one backup store: how the Engine's answers to the probe and the
 * real container turn into the owner's messages, and how each remote driver is
 * sent.
 */
class BackupStoreManagerGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->configureEngine();
    }

    private function manager(): BackupStoreManager
    {
        return app(BackupStoreManager::class);
    }

    /**
     * The Engine's backup-container routes. The first POST is the probe and the
     * second the real container; each answer is a status and a body.
     *
     * @param  list<array{int, array<string, mixed>}>  $creates
     * @param  int  $deleteStatus  the status of the probe's delete
     */
    private function fakeEngine(array $creates, int $deleteStatus = 204): void
    {
        $created = 0;
        Http::fake(function (Request $request) use ($creates, &$created, $deleteStatus) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);

            if ($request->method() === 'POST' && $path === '/api/backup-containers') {
                // Engine: core/app/Http/Controllers/BackupContainerController.php:79 -> store
                [$status, $body] = $creates[$created++] ?? [201, ['data' => ['id' => 90 + $created]]];

                // Engine: core/app/Http/Controllers/BackupContainerController.php:79 -> store (status and body of the call)
                return Http::response($body, $status);
            }
            if ($request->method() === 'POST') {
                // Engine: core/app/Http/Controllers/BackupContainerController.php:251 -> test
                return Http::response(['data' => ['ok' => true]]);
            }
            if ($request->method() === 'DELETE') {
                // Engine: core/app/Http/Controllers/BackupContainerController.php:194 -> destroy
                return Http::response(null, $deleteStatus);
            }

            // Engine: core/app/Http/Controllers/BackupContainerController.php:31 -> index
            return Http::response(['data' => []]);
        });
    }

    public function test_a_container_the_engine_refuses_after_a_good_probe_is_the_engines_reason_on_store(): void
    {
        $this->fakeEngine([
            [201, ['data' => ['id' => 90]]],
            [422, ['message' => 'The location is taken.', 'errors' => ['location' => ['The location is taken.']]]],
        ]);

        try {
            $this->manager()->save(['driver' => 'local', 'location' => '/opt/panelalpha/backups']);
            $this->fail('A refused container must not be saved.');
        } catch (ValidationException $e) {
            $this->assertNotEmpty($e->errors()['store'][0]);
        }
    }

    public function test_a_container_without_an_id_is_not_a_saved_store(): void
    {
        $this->fakeEngine([
            [201, ['data' => ['id' => 90]]],
            [201, ['data' => ['name' => 'x']]],
        ]);

        try {
            $this->manager()->save(['driver' => 'local', 'location' => '/opt/panelalpha/backups']);
            $this->fail('A container without an id cannot be used.');
        } catch (ValidationException $e) {
            $this->assertSame(['The Engine did not create the backup store.'], $e->errors()['store']);
        }
    }

    public function test_a_probe_container_without_an_id_is_not_tested(): void
    {
        $this->fakeEngine([[201, ['data' => ['name' => 'x']]]]);

        try {
            $this->manager()->save(['driver' => 'local', 'location' => '/opt/panelalpha/backups']);
            $this->fail('A probe without an id cannot be tested.');
        } catch (ValidationException $e) {
            $this->assertSame(['The Engine did not create the backup store.'], $e->errors()['store']);
        }

        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), '/test'));
    }

    public function test_a_probe_that_cannot_be_deleted_does_not_fail_the_save(): void
    {
        $this->fakeEngine([
            [201, ['data' => ['id' => 90]]],
            [201, ['data' => ['id' => 91]]],
        ], deleteStatus: 500);

        $saved = $this->manager()->save(['driver' => 'local', 'location' => '/opt/panelalpha/backups']);

        $this->assertSame(91, $saved['container']['id']);
    }

    /**
     * @return array<string, array{string, array<string, string>}>
     */
    public static function remoteDriverProvider(): array
    {
        return [
            'ftp' => ['ftp', ['host' => 'ftp.example.org', 'username' => 'u', 'password' => 'p']],
            'ftps' => ['ftps', ['host' => 'ftp.example.org', 'username' => 'u', 'password' => 'p']],
            'sftp' => ['sftp', ['host' => 'sftp.example.org', 'username' => 'u', 'password' => 'p']],
            's3' => ['s3', ['key' => 'k', 'secret' => 's', 'region' => 'eu-west-1']],
        ];
    }

    /**
     * @param  array<string, string>  $credentials
     */
    #[DataProvider('remoteDriverProvider')]
    public function test_a_remote_driver_is_sent_with_its_credentials_and_empty_ones_are_dropped(string $driver, array $credentials): void
    {
        $this->fakeEngine([]);

        $this->manager()->save(['driver' => $driver, 'location' => 'backups', 'credentials' => $credentials + ['endpoint' => '', 'token' => null]]);

        Http::assertSent(fn (Request $request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/backup-containers')
            && $request['driver'] === $driver
            && $request['credentials'] === $credentials
            && str_starts_with((string) $request['name'], 'panel-'.$driver.'-'));
    }

    public function test_the_default_schedule_is_monthly_on_the_chosen_day(): void
    {
        $defaults = app(BackupDefaults::class);
        $defaults->save(['auto_enable' => true, 'frequency' => 'monthly', 'hour' => 3, 'day_of_week' => 1, 'day_of_month' => 9, 'keep_last' => 5]);

        $this->assertMatchesRegularExpression('/^\d{1,2} 3 9 \* \*$/', $defaults->cronFor('site1'));
    }
}
