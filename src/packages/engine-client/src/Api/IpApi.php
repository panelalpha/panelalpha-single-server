<?php

namespace PanelAlpha\EngineClient\Api;

use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * The Engine's IP address management: subnets,
 * and which project uses which address. An assignment is `{id, user_id,
 * username, domain_names, ip_subnet_id, ip_address, created_at, updated_at}`.
 */
final class IpApi
{
    public function __construct(readonly EngineClient $engine) {}

    /**
     * Engine: IpController::listSubnets → `{data:[{id, ip, mask, is_shared,
     * assigned_ips[]}], meta:{default_ipv4:{address, assignments[]},
     * default_ipv6:{…}}}`.
     *
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>}
     */
    public function subnets(): array
    {
        $response = $this->engine->get('ip/subnets');

        return [
            'data' => Payload::objects($response->json('data')),
            'meta' => Payload::object($response->json('meta')),
        ];
    }

    /**
     * @param  array<string, mixed>  $subnet  ip, mask, is_shared
     * @return array<string, mixed>
     */
    public function addSubnet(array $subnet): array
    {
        return Payload::object($this->engine->post('ip/subnets', $subnet)->json('data'));
    }

    /**
     * Refused (409) while the subnet still has assigned addresses.
     *
     * @return array<string, mixed> the deleted subnet
     */
    public function deleteSubnet(int $subnetId): array
    {
        return Payload::object($this->engine->delete("ip/subnets/{$subnetId}")->json('data'));
    }

    /**
     * @param  array<string, mixed>  $assignment  ip_subnet_id, ip_address and username or user_id
     * @return array<string, mixed>
     */
    public function assign(array $assignment): array
    {
        return Payload::object($this->engine->post('ip/assign', $assignment)->json('data'));
    }

    /**
     * @param  array<string, mixed>  $assignment  ip_subnet_id, ip_address and username or user_id
     * @return array<string, mixed>
     */
    public function unassign(array $assignment): array
    {
        return Payload::object($this->engine->post('ip/unassign', $assignment)->json('data'));
    }
}
