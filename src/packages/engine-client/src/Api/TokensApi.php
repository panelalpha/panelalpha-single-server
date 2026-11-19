<?php

namespace PanelAlpha\EngineClient\Api;

use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * The calling API token itself (Engine `GET tokens/current`).
 */
final class TokensApi
{
    public function __construct(readonly EngineClient $engine) {}

    /**
     * `token_id`, `project` (the project whose API access holds the token, or
     * null), `system` and `expires_at`. An Engine without the endpoint answers
     * 404, or 405 where it serves only `DELETE tokens/current`.
     *
     * @return array<string, mixed>
     */
    public function current(): array
    {
        return Payload::object($this->engine->get('tokens/current')->json('data'));
    }
}
