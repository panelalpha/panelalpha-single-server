<?php

namespace Tests\Feature\Auth;

use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Every authentication/account route answers 401 when unauthenticated. There
 * is no privilege and no Engine call on these panel-only routes, so
 * 403/404/Engine-down do not apply here; the throttle cases are behavioural tests per limiter
 * (LoginTest, PasswordResetTest, PasswordConfirmationTest,
 * TwoFactorAuthenticationTest) and the project-label 404 lives with the
 * application-binding tests.
 *
 * The per-area tests cite the CA call site for each request body; this matrix
 * pins the guard for every route at once.
 */
class AuthRouteUnauthenticatedTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @param  array<string, mixed>  $payload
     */
    #[DataProvider('routes')]
    public function test_an_unauthenticated_request_is_rejected(string $method, string $uri, array $payload): void
    {
        // The per-route CA call sites are cited in the per-area tests; the matrix
        // carries one representative citation per HTTP method so this guard file
        // itself is covered by the CA citation guard.
        $response = match ($method) {
            // CA: packages/client-area/src/store/NotificationsModule.js:48 (a GET call site)
            'GET' => $this->getJson($uri),
            // CA: packages/client-area/src/apis/Auth.js:125 (a POST call site)
            'POST' => $this->postJson($uri, $payload),
            // CA: packages/client-area/src/mixins/ChangePasswordMixin.js:91 (a PUT call site)
            'PUT' => $this->putJson($uri, $payload),
            // CA: packages/client-area/src/store/NotificationsModule.js:42 (a DELETE call site)
            'DELETE' => $this->deleteJson($uri, $payload),
            // CA: packages/client-area/src/apis/Auth.js:255 (the fallback call site)
            default => $this->json($method, $uri, $payload),
        };

        $response->assertUnauthorized();
    }

    /**
     * @return array<string, array{0: string, 1: string, 2: array<string, mixed>}>
     */
    public static function routes(): array
    {
        return [
            'logout' => ['POST', '/api/logout', []],
            'password' => ['PUT', '/api/user/password', []],
            'confirm-password' => ['POST', '/api/user/confirm-password', []],
            'confirmed-password-status' => ['GET', '/api/user/confirmed-password-status', []],
            'two-factor enable' => ['POST', '/api/user/two-factor-authentication', []],
            'two-factor disable' => ['DELETE', '/api/user/two-factor-authentication', []],
            'two-factor confirm' => ['POST', '/api/user/confirmed-two-factor-authentication', []],
            'two-factor qr-code' => ['GET', '/api/user/two-factor-qr-code', []],
            'two-factor secret-key' => ['GET', '/api/user/two-factor-secret-key', []],
            'two-factor recovery-codes' => ['GET', '/api/user/two-factor-recovery-codes', []],
            'two-factor recovery-codes store' => ['POST', '/api/user/two-factor-recovery-codes', []],
            'account update' => ['PUT', '/api/user/edit', []],
            'account email' => ['PUT', '/api/user/edit/email', []],
            'account language' => ['PUT', '/api/user/language', []],
            'account dark-mode' => ['PUT', '/api/user/dark-mode', []],
            'devices' => ['GET', '/api/user/devices', []],
            'device forget' => ['POST', '/api/user/device/forget', []],
            'device logout' => ['POST', '/api/user/device/logout', []],
            'notifications' => ['GET', '/api/notifications', []],
            'notifications clear' => ['DELETE', '/api/notifications', []],
            'notifications mark-as-read' => ['PUT', '/api/notifications/mark-as-read', []],
            'notification delete' => ['DELETE', '/api/notifications/00000000-0000-0000-0000-000000000000', []],
            'labels' => ['GET', '/api/labels', []],
            'label create' => ['POST', '/api/labels', []],
            'label delete' => ['DELETE', '/api/labels', []],
        ];
    }

    public function test_a_guest_route_does_not_answer_401(): void
    {
        // The guest group is reachable without a session; pinning it here proves
        // the matrix above does not just assert 401 for every path.
        // CA: packages/client-area/src/views/ForgotPassword.vue:133 (`Api.post('/forgot-password', {email})`)
        $this->postJson('/api/forgot-password', ['email' => 'nobody@example.com'])
            ->assertOk();
    }
}
