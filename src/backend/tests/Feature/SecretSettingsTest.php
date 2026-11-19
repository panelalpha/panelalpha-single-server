<?php

namespace Tests\Feature;

use App\Models\Setting;
use Illuminate\Encryption\Encrypter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\Exceptions\EngineNotConfiguredException;
use Tests\TestCase;

/**
 * The Engine token is encrypted at rest with the app key (`Setting::ENCRYPTED`):
 * a copy of the SQLite file alone no longer hands out a token that reaches every
 * project on the Engine. Rows written before stay readable until the migration
 * seals them.
 *
 * @see src/backend/app/Models/Setting.php
 * @see src/backend/database/migrations/2026_10_28_100000_encrypt_secret_settings.php
 */
final class SecretSettingsTest extends TestCase
{
    use RefreshDatabase;

    private const string TOKEN = '1|engine-token-at-rest';

    public function test_the_engine_token_is_stored_encrypted_and_read_in_plaintext(): void
    {
        Setting::set('engine-api-token', self::TOKEN);
        Setting::set('engine-api-url', 'https://engine.example.com/api');

        $stored = $this->stored('engine-api-token');
        $this->assertStringStartsWith(Setting::ENCRYPTED_PREFIX, $stored);
        $this->assertStringNotContainsString('engine-token-at-rest', $stored);
        // Not a secret: as given.
        $this->assertSame('https://engine.example.com/api', $this->stored('engine-api-url'));

        $this->assertSame(self::TOKEN, Setting::get('engine-api-token'));
        $this->assertSame(self::TOKEN, app(EngineConnection::class)->token);

        // The entrypoint compares the delivered token with `settings:get`.
        $this->artisan('settings:get', ['name' => 'engine-api-token'])->expectsOutput(self::TOKEN)->assertSuccessful();
        $this->artisan('settings:get')->expectsOutputToContain(self::TOKEN)->assertSuccessful();
    }

    public function test_a_plaintext_row_from_before_is_read_and_the_migration_seals_it(): void
    {
        DB::table('settings')->insert(['name' => 'engine-api-token', 'value' => self::TOKEN, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('settings')->insert(['name' => 'engine-api-url', 'value' => 'https://engine.example.com/api', 'created_at' => now(), 'updated_at' => now()]);

        $this->assertSame(self::TOKEN, Setting::get('engine-api-token'));

        $migration = require database_path('migrations/2026_10_28_100000_encrypt_secret_settings.php');
        $migration->up();

        $sealed = $this->stored('engine-api-token');
        $this->assertStringStartsWith(Setting::ENCRYPTED_PREFIX, $sealed);
        $this->assertSame(self::TOKEN, Setting::get('engine-api-token'));
        $this->assertSame('https://engine.example.com/api', $this->stored('engine-api-url'));

        // Running it again leaves a sealed row alone.
        $migration->up();
        $this->assertSame($sealed, $this->stored('engine-api-token'));

        $migration->down();
        $this->assertSame(self::TOKEN, $this->stored('engine-api-token'));
    }

    public function test_a_token_sealed_with_another_app_key_reads_as_unset(): void
    {
        $other = new Encrypter(random_bytes(32), 'aes-256-cbc');
        DB::table('settings')->insert([
            'name' => 'engine-api-token',
            'value' => Setting::ENCRYPTED_PREFIX.$other->encryptString(self::TOKEN),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        Setting::set('engine-api-url', 'https://engine.example.com/api');
        Log::spy();

        $this->assertNull(Setting::get('engine-api-token'));
        Log::shouldHaveReceived('warning')->withArgs(
            static fn (string $message, array $context): bool => $context === ['setting' => 'engine-api-token'],
        );

        $this->expectException(EngineNotConfiguredException::class);
        app(EngineConnection::class);
    }

    private function stored(string $name): string
    {
        $value = DB::table('settings')->where('name', $name)->value('value');
        $this->assertIsString($value);

        return $value;
    }
}
