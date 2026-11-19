<?php

namespace PanelAlpha\EngineClient;

/**
 * Credentials and identity of one PanelAlpha Engine.
 *
 * $url is the Engine API base including the /api suffix,
 * e.g. https://engine.example.com:2011/api. $token is a Sanctum token minted on
 * the Engine with `pae api:token:create`.
 *
 * $caCertificate is a PEM the Engine (or its proxy) presents: when set,
 * EngineClient verifies against exactly that certificate; when null the system
 * CA store is used. TLS verification is never switched off.
 *
 * $timeout is the total HTTP timeout (seconds) the caller allows an ordinary
 * call to this Engine; null means EngineClient::DEFAULT_TIMEOUT_SECONDS. The
 * panel passes its own setting, so the client reads no panel config.
 *
 * Single-engine editions bind one instance in the container with
 * id = DEFAULT_ID; Multi-server builds them from its `engines` table.
 */
final readonly class EngineConnection
{
    public const DEFAULT_ID = 1;

    public function __construct(
        public int $id,
        public string $url,
        public string $token,
        public ?string $caCertificate = null,
        public ?string $name = null,
        public ?int $timeout = null,
    ) {}
}
