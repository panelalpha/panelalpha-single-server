<?php

use App\Support\StorageDirectories;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Broadcast;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

$app = Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    // The Client Area's `/api/broadcasting/auth` and its channels (the same
    // routes and channels as withBroadcasting()).
    ->booted(function (): void {
        Broadcast::routes(['prefix' => 'api', 'middleware' => ['api', 'auth']]);
        require __DIR__.'/../routes/channels.php';
    })
    ->withMiddleware(function (Middleware $middleware): void {
        // The container nginx is the only reverse proxy in front of php-fpm
        // (server 80 proxies to backend 82), so trust its forwarded headers.
        // X-Forwarded-For makes `$request->ip()` the real client; nginx rewrites
        // it to `$remote_addr` itself. X-Forwarded-Proto is trusted only here
        // (the Engine proxy's TLS termination) and only from loopback - nginx
        // forwards it from a trusted front proxy alone.
        $middleware->trustProxies(
            at: ['127.0.0.1', '::1'],
            headers: Request::HEADER_X_FORWARDED_FOR | Request::HEADER_X_FORWARDED_PROTO,
        );

        // The panel is served over https behind the
        // Engine proxy, so the session cookie must be Secure there. The
        // middleware reads the trusted X-Forwarded-Proto and runs before
        // Sanctum starts the session.
        $middleware->prependToGroup('api', \App\Http\Middleware\SetSecureSessionCookie::class);
        // The saved panel URL's host is stateful for Sanctum; it must run
        // before `statefulApi()` reads `sanctum.stateful`.
        $middleware->prependToGroup('api', \App\Http\Middleware\AddPanelUrlToStatefulDomains::class);

        // Sanctum reads Origin/Referer to decide statefulness but never refuses
        // a foreign one: a write from another site is a 403 here.
        $middleware->appendToGroup('api', \App\Http\Middleware\RefuseForeignOrigin::class);

        $middleware->statefulApi();

        // The Client Area is API-only (no web login screen), so an
        // unauthenticated API request – even a browser navigation like the
        // screenshot <img> – is 401 JSON, never a redirect to a missing route.
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : '/');

        // The env-file editor saves the whole file: an empty file (the last
        // variable deleted) must stay "" and a classic .env keeps its trailing
        // newline and edge whitespace. Global middleware runs before routing,
        // so match the path (both `instances` and `projects` segments).
        $isEnvFileSave = static fn (Request $request): bool => $request->isMethod('PUT')
            && preg_match('#^api/server-accounts/\d+/(instances|projects)/\d+/env-file/?$#', $request->path()) === 1;
        $middleware->trimStrings(except: [$isEnvFileSave]);
        $middleware->convertEmptyStringsToNull(except: [$isEnvFileSave]);

        $middleware->alias([
            // `password.confirm` that is a no-op unless
            // `auth.require_password_for_2fa` is on.
            'password.confirm.2fa' => \App\Http\Middleware\ConfirmPasswordWhenRequired::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // The `{application}` route binding (and any other findOrFail) must not
        // leak the model FQCN to the Client Area; the old panel answered a
        // generic "Resource not found" 404.
        $exceptions->render(function (NotFoundHttpException $e, Request $request) {
            if (($request->is('api/*') || $request->expectsJson())
                && $e->getPrevious() instanceof ModelNotFoundException) {
                return response()->json(['message' => 'Not found'], 404);
            }

            return null;
        });

    })->create();

$storagePath = dirname(dirname(__DIR__)) . '/data/laravel';
$app->useStoragePath($storagePath);

// The container entrypoint prepares these on start, but a checkout run (the
// test suite, `php artisan`) can see a fresh data directory. The Blade compiler
// throws "Please provide a valid cache path" when
// `realpath(storage_path('framework/views'))` is false, so the suite must not
// depend on a previous run having created it. The helper is
// race-safe: two php-fpm workers, or a worker and the queue, can boot at the
// same time on a fresh directory.
StorageDirectories::ensure($storagePath, [
    'app/private',
    'app/public',
    'framework/cache/data',
    'framework/sessions',
    'framework/testing',
    'framework/views',
    'logs',
]);

return $app;
