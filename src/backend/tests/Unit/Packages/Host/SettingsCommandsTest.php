<?php

namespace Tests\Unit\Packages\Host;

use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The `settings:*` commands of the host: listing, reading, writing from an
 * argument or a file, the PEM check of `engine-api-ca`, and removing.
 */
final class SettingsCommandsTest extends TestCase
{
    use RefreshDatabase;

    private string $directory = '';

    protected function setUp(): void
    {
        parent::setUp();

        $this->directory = sys_get_temp_dir().'/settings-commands-'.bin2hex(random_bytes(6));
        mkdir($this->directory, 0700, true);
    }

    protected function tearDown(): void
    {
        foreach (glob($this->directory.'/*') ?: [] as $file) {
            unlink($file);
        }
        rmdir($this->directory);

        parent::tearDown();
    }

    private function file(string $contents): string
    {
        $path = $this->directory.'/'.bin2hex(random_bytes(4));
        file_put_contents($path, $contents);

        return $path;
    }

    private function certificate(): string
    {
        $key = openssl_pkey_new(['private_key_bits' => 2048]);
        $csr = openssl_csr_new(['commonName' => 'engine.example.test'], $key);
        $cert = openssl_csr_sign($csr, null, $key, 1);
        openssl_x509_export($cert, $pem);

        return $pem;
    }

    public function test_get_without_a_name_says_so_when_there_are_no_settings(): void
    {
        $this->artisan('settings:get')->expectsOutput('No settings.')->assertSuccessful();
    }

    public function test_get_without_a_name_lists_every_setting_sorted_and_reads_a_secret_as_plaintext(): void
    {
        Setting::set('zeta', 'last');
        Setting::set('alpha', 'first');
        Setting::set('engine-api-token', '1|secret-token');

        $this->artisan('settings:get')
            ->expectsTable(['Name', 'Value'], [
                ['alpha', 'first'],
                ['engine-api-token', '1|secret-token'],
                ['zeta', 'last'],
            ])
            ->assertSuccessful();
    }

    public function test_get_with_a_name_prints_the_value(): void
    {
        Setting::set('userapp.name', 'box.example.com');

        $this->artisan('settings:get', ['name' => 'userapp.name'])->expectsOutput('box.example.com')->assertSuccessful();
    }

    public function test_get_fails_for_a_setting_that_does_not_exist(): void
    {
        $this->artisan('settings:get', ['name' => 'nope'])->expectsOutputToContain('Setting not found: nope')->assertFailed();
    }

    public function test_set_stores_the_value_and_replaces_an_earlier_one(): void
    {
        $this->artisan('settings:set', ['name' => 'userapp.name', 'value' => 'one'])->expectsOutput('DONE')->assertSuccessful();
        $this->artisan('settings:set', ['name' => 'userapp.name', 'value' => 'two'])->assertSuccessful();

        $this->assertSame('two', Setting::get('userapp.name'));
        $this->assertDatabaseCount('settings', 1);
    }

    public function test_set_stores_a_secret_encrypted_in_the_row(): void
    {
        $this->artisan('settings:set', ['name' => 'engine-api-token', 'value' => '1|secret'])->assertSuccessful();

        $this->assertSame('1|secret', Setting::get('engine-api-token'));
        $stored = (string) Setting::query()->where('name', 'engine-api-token')->value('value');
        $this->assertStringStartsWith(Setting::ENCRYPTED_PREFIX, $stored);
        $this->assertStringNotContainsString('secret', $stored);
    }

    public function test_set_reads_the_value_from_a_file_and_keeps_it_as_it_is(): void
    {
        $path = $this->file("line one\nline two\n");

        $this->artisan('settings:set', ['name' => 'motd', '--from-file' => $path])->assertSuccessful();

        $this->assertSame("line one\nline two\n", Setting::get('motd'));
    }

    public function test_set_from_a_file_wins_over_the_value_argument(): void
    {
        $path = $this->file('from the file');

        $this->artisan('settings:set', ['name' => 'motd', 'value' => 'from the argument', '--from-file' => $path])->assertSuccessful();

        $this->assertSame('from the file', Setting::get('motd'));
    }

    public function test_set_fails_when_the_file_cannot_be_read(): void
    {
        $missing = $this->directory.'/missing';

        $this->artisan('settings:set', ['name' => 'motd', '--from-file' => $missing])
            ->expectsOutputToContain("Unable to read the file [{$missing}].")
            ->assertFailed();

        $this->assertNull(Setting::get('motd'));
    }

    public function test_set_needs_a_value_or_a_file_and_does_not_store_an_empty_one(): void
    {
        $this->artisan('settings:set', ['name' => 'motd'])->expectsOutputToContain('A value or --from-file is required.')->assertFailed();
        $this->artisan('settings:set', ['name' => 'motd', 'value' => ''])->expectsOutputToContain('A value or --from-file is required.')->assertFailed();

        $this->assertNull(Setting::get('motd'));
    }

    public function test_set_accepts_a_pem_certificate_for_the_engine_ca_and_a_bundle_too(): void
    {
        $pem = $this->certificate();

        $this->artisan('settings:set', ['name' => 'engine-api-ca', '--from-file' => $this->file($pem)])->assertSuccessful();
        $this->assertSame($pem, Setting::get('engine-api-ca'));

        $this->artisan('settings:set', ['name' => 'engine-api-ca', '--from-file' => $this->file($pem.$pem)])->assertSuccessful();
    }

    public function test_set_refuses_an_engine_ca_that_is_not_a_certificate_and_keeps_the_old_one(): void
    {
        $pem = $this->certificate();
        Setting::set('engine-api-ca', $pem);

        foreach (['not a certificate', "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n", '   ', 'x'] as $bad) {
            $this->artisan('settings:set', ['name' => 'engine-api-ca', 'value' => $bad])
                ->expectsOutputToContain('The engine-api-ca value must be a PEM certificate.')
                ->assertFailed();
        }

        $this->assertSame($pem, Setting::get('engine-api-ca'));
    }

    public function test_other_settings_are_not_checked_for_a_certificate(): void
    {
        $this->artisan('settings:set', ['name' => 'engine-api-url', 'value' => 'not a certificate'])->assertSuccessful();

        $this->assertSame('not a certificate', Setting::get('engine-api-url'));
    }

    public function test_unset_removes_the_row_and_reads_as_missing_afterwards(): void
    {
        Setting::set('motd', 'hello');
        Setting::get('motd');

        $this->artisan('settings:unset', ['name' => 'motd'])->expectsOutput('DONE')->assertSuccessful();

        $this->assertNull(Setting::get('motd'));
        $this->assertDatabaseMissing('settings', ['name' => 'motd']);
    }

    public function test_unset_fails_for_a_setting_that_does_not_exist_and_removes_nothing_else(): void
    {
        Setting::set('stays', '1');

        $this->artisan('settings:unset', ['name' => 'nope'])->expectsOutputToContain('Setting not found: nope')->assertFailed();

        $this->assertSame('1', Setting::get('stays'));
    }
}
