<?php

namespace PanelAlpha\EngineClient\Api;

use Illuminate\Http\Client\Response;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * Engine-wide proxy rules. Not project-scoped: the Engine
 * serves `E/proxy-rules`, so the panel filters to the user's projects.
 */
final class ProxyRulesApi
{
    public function __construct(readonly EngineClient $engine) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function all(): array
    {
        return Payload::objects($this->engine->get('proxy-rules')->json('data'));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function create(array $params): Response
    {
        return $this->engine->post('proxy-rules', $params);
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function update(int $ruleId, array $params): Response
    {
        return $this->engine->put("proxy-rules/{$ruleId}", $params);
    }

    public function delete(int $ruleId): Response
    {
        return $this->engine->delete("proxy-rules/{$ruleId}");
    }

    /**
     * @return array<string, mixed>
     */
    public function show(int $ruleId): array
    {
        return Payload::object($this->engine->get("proxy-rules/{$ruleId}")->json('data'));
    }
}
