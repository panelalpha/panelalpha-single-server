<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Mcp;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Contracts\PanelUser;
use PanelAlpha\ClientArea\Mcp\McpTokenService;
use PanelAlpha\ClientArea\Http\Requests\Mcp\McpActivityLogRequest;
use PanelAlpha\ClientArea\Http\Requests\Mcp\McpTokenRequest;

/**
 * Connect AI (MCP tokens and activity logs) backed by the Engine.
 * Each user sees, revokes and deletes only
 * the tokens the panel minted for them, and every token is minted scoped to
 * that user's projects (`McpTokenService`). The old panel's routes
 * carried no privilege beyond `auth`, so v1 adds none.
 *
 * The routes are registered in every edition: the per-user rules
 * live in `McpTokenService`, the reach in `McpProjectScope`.
 *
 * Response shapes mirror the Engine exactly, because the CA reads the panel
 * response like the Engine's: tokens `{data:[…]}` / `{data:{…}}`, and the
 * activity list as a **bare paginator** (`data`, `total`, …) – in single-user
 * mode the Engine's whole log, otherwise an empty page until the Engine filters
 * by several tokens.
 */
final class McpController extends Controller
{
    public function __construct(private readonly McpTokenService $tokens) {}

    public function tokens(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->tokens->tokensOf($this->user($request))]);
    }

    public function store(McpTokenRequest $request): JsonResponse
    {
        $params = $request->validated();
        $name = is_string($params['name'] ?? null) ? $params['name'] : '';

        return response()->json(['data' => $this->tokens->mint($this->user($request), $name)], 201);
    }

    public function revoke(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => $this->tokens->revoke($this->user($request), $id)]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => $this->tokens->delete($this->user($request), $id)]);
    }

    public function activityLogs(McpActivityLogRequest $request): JsonResponse
    {
        $params = $request->validated();
        $query = [];

        $tokenName = $params['token_name'] ?? null;
        if (is_string($tokenName) && $tokenName !== '') {
            $query['token_name'] = $tokenName;
        }

        $page = $params['page'] ?? null;
        if (is_numeric($page)) {
            $query['page'] = (int) $page;
        }

        return response()->json($this->tokens->activityLog($this->user($request), $query, $request->url()));
    }

    private function user(Request $request): PanelUser
    {
        $user = $request->user();
        abort_unless($user instanceof PanelUser, 401);

        return $user;
    }
}
