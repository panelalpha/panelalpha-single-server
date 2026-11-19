<?php

namespace Tests\Feature\EngineClient;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\Api\ServerApi;
use PanelAlpha\EngineClient\Api\SystemApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * engine-client's Engine-wide system actions the Admin Area's Details and
 * Outgoing Mail tabs reach: the
 * update and webserver scripts, the Exim smarthost, and the last hour's metric
 * averages of the resource alerts.
 */
final class SystemAdminApiTest extends TestCase
{
    use EngineFixtures;

    private function client(): EngineClient
    {
        return new EngineClient(new EngineConnection(EngineConnection::DEFAULT_ID, self::ENGINE, '1|test-token'));
    }

    public function test_the_update_sends_a_licence_key_only_when_there_is_one(): void
    {
        // Engine: core/app/Http/Controllers/SystemController.php:428 -> update, {data: latest update info}
        Http::fake(['engine.example.com/api/system/update' => Http::response(['data' => ['pid' => 1, 'exit_code' => null]])]);
        $api = new SystemApi($this->client());

        $this->assertSame(1, $api->update('KEY')['pid']);
        $api->update(null);
        $api->update('');

        $this->assertSame(
            [['license_key' => 'KEY'], [], []],
            Http::recorded()->map(static fn (array $pair): array => $pair[0]->data())->all(),
        );
    }

    public function test_the_webserver_actions(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/SystemController.php:483 -> changeWebserver, {data: latest change info}
            'engine.example.com/api/system/change-webserver' => Http::response(['data' => ['pid' => 2]]),
            // Engine: core/app/Http/Controllers/SystemController.php:573 -> resetWebserverPanelPassword, {data:{new_password}}
            'engine.example.com/api/system/reset-webserver-panel-password' => Http::response(['data' => ['new_password' => 'secret']]),
            // Engine: core/app/Http/Controllers/SystemController.php:610 -> updateWebserverConfig, {data: params}
            'engine.example.com/api/system/webserver-config' => Http::response(['data' => ['serial_number' => 'S']]),
        ]);
        $api = new SystemApi($this->client());

        $this->assertSame(2, $api->changeWebserver('litespeed', 'SER')['pid']);
        $api->changeWebserver('nginx-proxy');
        $this->assertSame('secret', $api->resetWebserverPanelPassword());
        $api->updateWebserverConfig(['serial_number' => 'S']);

        Http::assertSent(static fn (Request $request): bool => $request->data() === ['new_webserver' => 'litespeed', 'serial_number' => 'SER']);
        Http::assertSent(static fn (Request $request): bool => $request->data() === ['new_webserver' => 'nginx-proxy']);
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'PUT' && $request->url() === self::ENGINE.'/system/webserver-config');
    }

    public function test_the_exim_config_and_test_email(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/SystemController.php:650 -> getEximConfig / :688 updateEximConfig, {data:{…}}
            'engine.example.com/api/system/exim-config' => Http::response(['data' => ['smarthost_provider' => 'smtp']]),
            // Engine: core/app/Http/Controllers/SystemController.php:842 -> sendTestEmail, {data:{exit_code, stdout, stderr, status}}
            'engine.example.com/api/system/exim-send-test-email' => Http::response(['data' => ['exit_code' => 0, 'status' => 'delivered']]),
        ]);
        $api = new SystemApi($this->client());

        $this->assertSame('smtp', $api->eximConfig()['smarthost_provider']);
        $api->updateEximConfig(['smtp_host' => 'mail.example.com']);
        $this->assertSame('delivered', $api->sendTestEmail('ops@example.com', ['smarthost_provider' => 'smtp'])['status']);
        $api->sendTestEmail('ops@example.com');

        Http::assertSent(static fn (Request $request): bool => $request->method() === 'PUT' && $request->data() === ['smtp_host' => 'mail.example.com']);
        Http::assertSent(static fn (Request $request): bool => $request->data() === ['email' => 'ops@example.com', 'config' => ['smarthost_provider' => 'smtp']]);
        // Without a config the Engine tests the stored settings (it stores a config it is sent).
        Http::assertSent(static fn (Request $request): bool => $request->data() === ['email' => 'ops@example.com']);
    }

    public function test_the_last_hour_averages(): void
    {
        // Engine: core/app/Http/Controllers/ServerMetricsController.php:98 -> lastHourAverages, {data:{avg_cpu_percent, avg_ram_percent}}
        Http::fake(['engine.example.com/api/metrics/last-hour-averages' => Http::response(['data' => ['avg_cpu_percent' => 12.5, 'avg_ram_percent' => 40.5]])]);

        $this->assertSame(['avg_cpu_percent' => 12.5, 'avg_ram_percent' => 40.5], (new ServerApi($this->client()))->lastHourAverages());
    }
}
