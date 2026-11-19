<?php

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Mcp\McpController;
use PanelAlpha\ClientArea\Http\Controllers\Mcp\McpProxyController;

/*
| Connect AI's MCP server. The CA builds `<panel>/mcp`
| (`ConnectAi.vue:150-153`), so the panel streams it to the Engine's MCP server
| with the client's own Engine token – only a token the panel minted for an
| existing user (the `McpGate` gatekeeper). No panel `auth`: the
| Engine still validates the token, and the route carries the old
| `throttle:mcp`. Loaded in every edition.
*/
Route::post('/mcp', [McpProxyController::class, 'handle'])
    ->middleware('throttle:mcp')
    ->name('mcp.handle');
Route::get('/mcp/check', [McpProxyController::class, 'check'])
    ->middleware('throttle:mcp')
    ->name('mcp.check');

/*
| Connect AI / MCP.
|
| Loaded in every edition: each user sees and manages only the
| tokens the panel minted for them, and every token reaches exactly that
| user's projects. The old routes carried no privilege beyond `auth`, so
| these add none; the activity middleware logs the old `user.mcp.tokens.*`
| mutation names.
*/
Route::prefix('api')
    ->middleware(config('client-area.route_middleware'))
    ->group(function (): void {
        Route::get('/mcp-tokens', [McpController::class, 'tokens'])->name('mcp.tokens.index');
        Route::post('/mcp-tokens', [McpController::class, 'store'])
            ->defaults('activity', 'user.mcp.tokens.store')
            ->name('mcp.tokens.store');
        Route::put('/mcp-tokens/{id}/revoke', [McpController::class, 'revoke'])
            ->whereNumber('id')
            ->defaults('activity', 'user.mcp.tokens.revoke')
            ->name('mcp.tokens.revoke');
        Route::delete('/mcp-tokens/{id}', [McpController::class, 'destroy'])
            ->whereNumber('id')
            ->defaults('activity', 'user.mcp.tokens.destroy')
            ->name('mcp.tokens.destroy');
        Route::get('/mcp-activity-logs', [McpController::class, 'activityLogs'])->name('mcp.activity_logs.index');
    });
