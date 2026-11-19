<?php

namespace Tests\Feature\EngineClient;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\Api\FirewallApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * engine-client's `FirewallApi`: the Engine's host firewall (ufw), which the
 * Admin Area's Firewall tab reaches.
 */
final class FirewallApiTest extends TestCase
{
    use EngineFixtures;

    private function api(): FirewallApi
    {
        return new FirewallApi(new EngineClient(new EngineConnection(EngineConnection::DEFAULT_ID, self::ENGINE, '1|test-token')));
    }

    /**
     * @return array<string, mixed>
     */
    private function rule(string $id): array
    {
        // Engine: core/app/System/Firewall/FirewallRule.php:451-466 -> toArray
        return ['id' => $id, 'scope' => 'host', 'action' => 'allow', 'direction' => 'in', 'protocol' => 'tcp', 'port' => '22',
            'source' => null, 'destination' => null, 'comment' => null, 'managed' => false, 'editable' => true, 'raw' => null];
    }

    public function test_status_and_rules_are_read(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/FirewallController.php:60 -> status, {data:{provider, enabled, version, …}}
            'engine.example.com/api/firewall/status' => Http::response(['data' => ['provider' => 'ufw', 'enabled' => true, 'version' => '0.36.2']]),
            // Engine: core/app/Http/Controllers/FirewallController.php:81 -> rules, {data:[FirewallRule]}
            'engine.example.com/api/firewall/rules' => Http::response(['data' => [$this->rule('a1b2c3d4e5f6')]]),
        ]);

        $this->assertSame('ufw', $this->api()->status()['provider']);
        $this->assertSame('a1b2c3d4e5f6', $this->api()->rules()[0]['id']);
    }

    public function test_commands_are_puts(): void
    {
        // Engine: core/app/Http/Controllers/FirewallController.php:210-240 -> enable/disable/reload, {data: ''}
        Http::fake(['engine.example.com/api/firewall/*' => Http::response(['data' => ''])]);

        $this->api()->enable();
        $this->api()->disable();
        $this->api()->reload();

        $this->assertSame(
            [['PUT', self::ENGINE.'/firewall/enable'], ['PUT', self::ENGINE.'/firewall/disable'], ['PUT', self::ENGINE.'/firewall/reload']],
            Http::recorded()->map(static fn (array $pair): array => [$pair[0]->method(), $pair[0]->url()])->all(),
        );
    }

    public function test_a_rule_is_added_updated_and_deleted_by_id(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/FirewallController.php:128 -> addRule, {data: FirewallRule}
            'engine.example.com/api/firewall/rules' => Http::response(['data' => $this->rule('a1b2c3d4e5f6')]),
            // Engine: core/app/Http/Controllers/FirewallController.php:169 -> updateRule / :195 deleteRule, {data: FirewallRule}
            'engine.example.com/api/firewall/rules/a1b2c3d4e5f6' => Http::response(['data' => $this->rule('0f0f0f0f0f0f')]),
        ]);

        $this->assertSame('a1b2c3d4e5f6', $this->api()->addRule(['action' => 'allow', 'port' => '22'])['id']);
        $this->assertSame('0f0f0f0f0f0f', $this->api()->updateRule('a1b2c3d4e5f6', ['port' => '2222', 'comment' => null])['id']);
        $this->api()->deleteRule('a1b2c3d4e5f6');

        Http::assertSent(static fn (Request $request): bool => $request->method() === 'POST' && $request->data() === ['action' => 'allow', 'port' => '22']);
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'PUT'
            && $request->url() === self::ENGINE.'/firewall/rules/a1b2c3d4e5f6'
            && $request->data() === ['port' => '2222', 'comment' => null]);
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'DELETE' && $request->url() === self::ENGINE.'/firewall/rules/a1b2c3d4e5f6');
    }

    public function test_engine_refusals_are_the_clients_exceptions(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/FirewallController.php:476-487 -> attempt, 422 for a clash
            'engine.example.com/api/firewall/rules' => Http::response(['message' => 'clash', 'errors' => ['rule' => ['clash']]], 422),
            // Engine: core/app/Http/Controllers/FirewallController.php:501-505 -> hostFault, 502
            'engine.example.com/api/firewall/enable' => Http::response(['message' => 'ufw failed'], 502),
        ]);

        try {
            $this->api()->addRule(['action' => 'allow']);
            $this->fail('A 422 must throw.');
        } catch (EngineValidationException $e) {
            $this->assertSame(['rule' => ['clash']], $e->errors);
        }

        $this->expectException(EngineRequestException::class);
        $this->api()->enable();
    }
}
