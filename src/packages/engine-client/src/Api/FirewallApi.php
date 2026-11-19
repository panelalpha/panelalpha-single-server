<?php

namespace PanelAlpha\EngineClient\Api;

use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * The Engine host firewall (ufw through the Engine's FIREWALL_PROVIDER).
 * The Engine replaced CSF with these endpoints;
 * a rule is `{id, scope, action, direction, protocol, port, source,
 * destination, comment, managed, editable, raw}` and its `id` changes when what
 * it matches changes.
 */
final class FirewallApi
{
    public function __construct(readonly EngineClient $engine) {}

    /**
     * Engine: FirewallController::status → `{data:{provider, enabled, version,
     * default_incoming, default_outgoing, error, refused_rules[]}}`.
     *
     * @return array<string, mixed>
     */
    public function status(): array
    {
        return Payload::object($this->engine->get('firewall/status')->json('data'));
    }

    public function enable(): void
    {
        $this->engine->put('firewall/enable');
    }

    public function disable(): void
    {
        $this->engine->put('firewall/disable');
    }

    public function reload(): void
    {
        $this->engine->put('firewall/reload');
    }

    /**
     * The host rules (and the denies that also cover published ports), in the
     * order the firewall evaluates them.
     *
     * @return list<array<string, mixed>>
     */
    public function rules(): array
    {
        return Payload::objects($this->engine->get('firewall/rules')->json('data'));
    }

    /**
     * @param  array<string, mixed>  $rule  action, direction, protocol, port, source, destination, comment
     * @return array<string, mixed> the stored rule
     */
    public function addRule(array $rule): array
    {
        return Payload::object($this->engine->post('firewall/rules', $rule)->json('data'));
    }

    /**
     * A field sent as null is cleared; a field not sent keeps its value.
     *
     * @param  array<string, mixed>  $rule
     * @return array<string, mixed> the rule with its (possibly new) id
     */
    public function updateRule(string $ruleId, array $rule): array
    {
        $ruleId = rawurlencode($ruleId);

        return Payload::object($this->engine->put("firewall/rules/{$ruleId}", $rule)->json('data'));
    }

    /**
     * @return array<string, mixed> the deleted rule
     */
    public function deleteRule(string $ruleId): array
    {
        $ruleId = rawurlencode($ruleId);

        return Payload::object($this->engine->delete("firewall/rules/{$ruleId}")->json('data'));
    }
}
