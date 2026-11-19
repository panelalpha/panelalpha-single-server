<?php

namespace PanelAlpha\EngineClient\Api;

use Illuminate\Http\Client\Response;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * Engine MCP token and activity-log endpoints. The Engine's tokens belong to its root admin; the caller
 * resolves the default Engine client and scopes every token it mints to a
 * list of project usernames.
 *
 * Thin and stateless; the Engine `data` is returned as arrays.
 */
final class McpApi
{
    /**
     * The Engine's MCP server path. `laravel/mcp` registers the JSON-RPC
     * Streamable HTTP transport at `/mcp` and `/mcp/check`
     * (Engine: `core/routes/mcp.php:11`). The Engine's own `system/info.mcp_url`
     * points at its public IP:2011, which a tenant cannot reach, so the panel rebuilds the URL on the configured `engine-api-url`.
     */
    public const string MCP_PATH = '/mcp';

    /**
     * @param  string|null  $mcpUrlOverride  the caller's override of the MCP server URL
     *                                       (the panel's `engine-mcp-url` setting);
     *                                       null or empty derives it from the API URL
     */
    public function __construct(readonly EngineClient $engine, private readonly ?string $mcpUrlOverride = null) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function tokens(): array
    {
        // Engine: core/routes/api.php:80 → McpTokenController::index, {data:[…]}
        return Payload::objects($this->engine->get('mcp-tokens')->json('data'));
    }

    /**
     * Mint an MCP token scoped to the given project usernames. The
     * `projects` key is always sent, an empty list included: without it the
     * Engine mints an unscoped token that reaches every project, and the
     * caller never asks for one.
     *
     * @param  list<string>  $projects
     * @return array<string, mixed>
     */
    public function createToken(string $name, array $projects): array
    {
        // Engine: core/routes/api.php:81 → McpTokenController::store,
        // 201 {data:{id,name,projects,last_used_at,revoked_at,created_at,plain_text_token}}
        return Payload::object($this->engine->post('mcp-tokens', ['name' => $name, 'projects' => $projects])->json('data'));
    }

    /**
     * Replace a token's project scope with exactly these usernames.
     *
     * @param  list<string>  $projects
     * @return array<string, mixed>
     */
    public function setTokenProjects(int $id, array $projects): array
    {
        // Engine: core/routes/api.php:84 → McpTokenController::updateProjects, {data:{id,name,projects,…}}
        return Payload::object($this->engine->put('mcp-tokens/'.$id.'/projects', ['projects' => $projects])->json('data'));
    }

    /**
     * @return array<string, mixed>
     */
    public function revokeToken(int $id): array
    {
        // Engine: core/routes/api.php:82 → McpTokenController::revoke, {data:{…}}
        return Payload::object($this->engine->put('mcp-tokens/'.$id.'/revoke')->json('data'));
    }

    /**
     * @return array<string, mixed>
     */
    public function deleteToken(int $id): array
    {
        // Engine: core/routes/api.php:84 → McpTokenController::destroy, {data:{id}}
        return Payload::object($this->engine->delete('mcp-tokens/'.$id)->json('data'));
    }

    /**
     * The Engine returns a **bare paginator** (current_page/data/per_page/total),
     * not `{data:…}` – the CA reads `response.data.data` and `response.data.total`.
     *
     * Engine: core/routes/api.php:86 → McpActivityLogController::index
     * (core/app/Http/Controllers/McpActivityLogController.php:12-26).
     *
     * @param  array<string, mixed>  $query
     * @return array<string, mixed>
     */
    public function activityLogs(array $query = []): array
    {
        return Payload::object($this->engine->get('mcp-activity-logs', $query)->json());
    }

    /**
     * The MCP server URL the panel proxies to.
     *
     * When the Engine advertises a public `mcp_url`, a tenant cannot reach it
     * (the public IP:2011 is refused from inside the project); the hairpin that
     * serves `engine-api-url` proxies the whole host to `core:2011`, so the same
     * origin serves `/mcp`. The caller's override (the panel's `engine-mcp-url`
     * setting) replaces the derivation entirely.
     */
    public function mcpUrl(): string
    {
        $override = $this->mcpUrlOverride;
        if ($override !== null && $override !== '') {
            return rtrim($override, '/');
        }

        $origin = self::origin($this->engine->connection()->url);
        if ($origin === null) {
            throw new EngineUnavailableException('The Engine API URL cannot serve an MCP endpoint.');
        }

        return $origin.self::MCP_PATH;
    }

    /**
     * Stream one MCP request to the Engine's MCP server with the caller's own
     * Engine MCP token. The raw streamed response is
     * returned so the controller can pass status, headers and body through
     * without buffering.
     *
     * @param  array<string, mixed>  $options
     */
    public function proxyMcp(string $method, string $token, array $options = [], string $suffix = ''): Response
    {
        return $this->engine->proxy($method, $this->mcpUrl().$suffix, $token, $options);
    }

    /**
     * The scheme://host[:port] of an absolute Engine URL, or null when it is not
     * an absolute http(s) URL.
     */
    private static function origin(string $url): ?string
    {
        $parts = parse_url($url);
        if (! is_array($parts)) {
            return null;
        }

        $scheme = Payload::nullableString($parts['scheme'] ?? null);
        $host = Payload::nullableString($parts['host'] ?? null);
        if ($scheme === null || $host === null) {
            return null;
        }

        $origin = $scheme.'://'.$host;
        $port = $parts['port'] ?? null;

        return is_int($port) ? $origin.':'.$port : $origin;
    }
}
