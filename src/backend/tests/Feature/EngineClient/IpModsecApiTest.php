<?php

namespace Tests\Feature\EngineClient;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\Api\IpApi;
use PanelAlpha\EngineClient\Api\ModsecApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * engine-client's `IpApi` and `ModsecApi`: the Engine's IP address management
 * and ModSecurity, which the Admin Area's IP Management and Security tabs reach.
 */
final class IpModsecApiTest extends TestCase
{
    use EngineFixtures;

    private function client(): EngineClient
    {
        return new EngineClient(new EngineConnection(EngineConnection::DEFAULT_ID, self::ENGINE, '1|test-token'));
    }

    public function test_subnets_keep_the_default_addresses_meta(): void
    {
        // Engine: core/app/Http/Controllers/IpController.php:41-50 -> listSubnets, {data:[…], meta:{default_ipv4, default_ipv6}}
        Http::fake(['engine.example.com/api/ip/subnets' => Http::response([
            'data' => [['id' => 3, 'ip' => TestNetwork::public2(0), 'mask' => 29, 'is_shared' => false, 'assigned_ips' => []]],
            'meta' => ['default_ipv4' => ['address' => TestNetwork::public(10), 'assignments' => []], 'default_ipv6' => ['address' => null, 'assignments' => []]],
        ])]);

        $subnets = (new IpApi($this->client()))->subnets();

        $this->assertSame(3, $subnets['data'][0]['id']);
        $this->assertSame(TestNetwork::public(10), $subnets['meta']['default_ipv4']['address'] ?? null);
    }

    public function test_subnet_and_assignment_writes(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/IpController.php:147 -> addSubnet, {data: IpSubnetResource}
            'engine.example.com/api/ip/subnets' => Http::response(['data' => ['id' => 4]]),
            // Engine: core/app/Http/Controllers/IpController.php:284 -> deleteSubnet, {data: IpSubnetResource}
            'engine.example.com/api/ip/subnets/4' => Http::response(['data' => ['id' => 4]]),
            // Engine: core/app/Http/Controllers/IpController.php:338 -> assignIpAddress / :524 unassignIpAddress, {data: IpAssignedResource}
            'engine.example.com/api/ip/*' => Http::response(['data' => ['id' => 9, 'username' => 'site1', 'ip_address' => TestNetwork::public2(4)]]),
        ]);
        $api = new IpApi($this->client());

        $this->assertSame(4, $api->addSubnet(['ip' => TestNetwork::public3(0), 'mask' => 30])['id']);
        $this->assertSame(4, $api->deleteSubnet(4)['id']);
        $this->assertSame('site1', $api->assign(['ip_subnet_id' => 3, 'ip_address' => TestNetwork::public2(4), 'username' => 'site1'])['username']);
        $this->assertSame(9, $api->unassign(['ip_subnet_id' => 3, 'ip_address' => TestNetwork::public2(4), 'username' => 'site1'])['id']);

        $this->assertSame(
            [['POST', self::ENGINE.'/ip/subnets'], ['DELETE', self::ENGINE.'/ip/subnets/4'], ['POST', self::ENGINE.'/ip/assign'], ['POST', self::ENGINE.'/ip/unassign']],
            Http::recorded()->map(static fn (array $pair): array => [$pair[0]->method(), $pair[0]->url()])->all(),
        );
    }

    public function test_modsecurity_mode_rulesets_and_audit_logs(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/ModsecController.php:30 -> getMode / :54 setMode, {data:{mode, …}}
            'engine.example.com/api/modsec/mode' => Http::response(['data' => ['mode' => 'on']]),
            // Engine: core/app/Http/Resources/ModsecRulesetCollection.php:11-38 -> {data:[{name, label, enabled, config_files}]}
            'engine.example.com/api/modsec/rulesets' => Http::response(['data' => [['name' => 'owasp-crs', 'enabled' => true, 'config_files' => []]]]),
            // Engine: core/app/Http/Controllers/ModsecController.php:162 -> toggleConfigFiles, every ruleset
            'engine.example.com/api/modsec/rulesets/owasp-crs/config-files' => Http::response(['data' => [['name' => 'owasp-crs']]]),
            // Engine: core/app/Http/Controllers/ModsecController.php:102 -> enableRuleset / :128 disableRuleset, {data: null}
            'engine.example.com/api/modsec/rulesets/*' => Http::response(['data' => null]),
            // Engine: core/app/Http/Controllers/ModsecController.php:343 -> tailAuditLogFile, {data:[records]}
            'engine.example.com/api/modsec/audit-log/files/a%20b.log/tail' => Http::response(['data' => [['id' => 1]]]),
            // Engine: core/app/Http/Controllers/ModsecController.php:322 -> downloadAuditLogFile, the file
            'engine.example.com/api/modsec/audit-log/files/a%20b.log' => Http::response('raw log'),
            // Engine: core/app/Http/Controllers/ModsecController.php:300 -> listAuditLogFiles, {data:[{file, size, mtime}]}
            'engine.example.com/api/modsec/audit-log/files' => Http::response(['data' => [['file' => 'a b.log', 'size' => 7, 'mtime' => 1]]]),
        ]);
        $api = new ModsecApi($this->client());

        $this->assertSame('on', $api->mode()['mode']);
        $this->assertSame('on', $api->setMode('on')['mode']);
        $this->assertSame('owasp-crs', $api->rulesets()[0]['name']);
        $api->enableRuleset('owasp-crs');
        $api->disableRuleset('owasp-crs');
        $this->assertSame('owasp-crs', $api->setConfigFiles('owasp-crs', ['a.conf'], [])[0]['name']);
        $this->assertSame('a b.log', $api->auditLogFiles()[0]['file']);
        $this->assertSame([['id' => 1]], $api->tailAuditLogFile('a b.log'));
        $this->assertSame('raw log', $api->downloadAuditLogFile('a b.log')->body());

        Http::assertSent(static fn (Request $request): bool => $request->method() === 'PUT' && $request->url() === self::ENGINE.'/modsec/mode' && $request->data() === ['mode' => 'on']);
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'PUT' && $request->url() === self::ENGINE.'/modsec/rulesets/owasp-crs/enable');
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'PUT' && $request->url() === self::ENGINE.'/modsec/rulesets/owasp-crs/disable');
        Http::assertSent(static fn (Request $request): bool => $request->url() === self::ENGINE.'/modsec/rulesets/owasp-crs/config-files'
            && $request->data() === ['enable' => ['a.conf'], 'disable' => []]);
    }

    public function test_modsecurity_custom_rules_are_read_and_replaced(): void
    {
        $data = ['rules' => 'SecRule REQUEST_URI "@beginsWith /x" "id:1100001,phase:1,deny"', 'enabled' => false, 'id_range' => [1100000, 1199999]];
        Http::fake([
            // Engine: core/app/Http/Controllers/ModsecController.php:206 -> getCustomRules / :245 setCustomRules, {data:{rules, enabled, id_range}}
            'engine.example.com/api/modsec/custom-rules' => Http::response(['data' => $data]),
        ]);
        $api = new ModsecApi($this->client());

        $this->assertSame($data, $api->customRules());
        $this->assertSame($data, $api->setCustomRules(''));

        Http::assertSent(static fn (Request $request): bool => $request->method() === 'GET' && $request->url() === self::ENGINE.'/modsec/custom-rules');
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'PUT' && $request->url() === self::ENGINE.'/modsec/custom-rules'
            && $request->data() === ['rules' => '']);
    }
}
