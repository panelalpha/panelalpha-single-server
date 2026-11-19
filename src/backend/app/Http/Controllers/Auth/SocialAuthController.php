<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\Auth\LoginResult;
use App\Services\Auth\SocialLoginService;
use App\Support\HomePayload;
use App\Support\SocialProviders;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * Social login.
 *
 * `GET /auth/{provider}/redirect-url` returns the stateless Socialite URL the
 * CA sends the browser to; `POST /auth/{provider}/callback` is the CA's XHR
 * after the browser lands back on `/auth/{provider}/callback`. Both are public,
 * exactly like the old routes (packages/api/routes/api.php:96-97); an unknown
 * or unconfigured provider is 404 as in the old `Integration::findEnabledAuthProvider()`.
 *
 * The callback never signs in a foreign provider identity: a refusal answers
 * the old `account_already_exists` 422 the CA keys on
 * (packages/client-area/src/views/SocialLogin.vue:58), a 2FA user is refused
 * with the old-style key-0 422, and a provider failure
 * keeps the generic key-0 message.
 */
final class SocialAuthController extends Controller
{
    /** Old `api/messages.invalid_response` text (key 0). */
    private const INVALID_RESPONSE = 'Something went wrong. Please try again later.';

    /** Old `api/custom_validation.account_already_exists`. */
    private const ACCOUNT_EXISTS = 'Account Already Exists';

    /**
     * The unchanged CA cannot finish a 2FA challenge after
     * a provider login (SocialLogin.vue has no two-factor branch), so the login
     * is refused with the old-style key-0 422.
     */
    private const TWO_FACTOR_ENABLED = 'Two-factor authentication is enabled – sign in with your password.';

    public function __construct(
        private readonly SocialLoginService $social,
        private readonly HomePayload $home,
    ) {}

    public function redirectUrl(string $provider): JsonResponse
    {
        if (! SocialProviders::isEnabled($provider)) {
            abort(404, 'Not found');
        }

        try {
            $url = $this->social->redirectUrl($provider);
        } catch (Throwable $e) {
            // Bad provider credentials are configuration, not a panel bug; the
            // CA shows the same generic error as the old controller.
            report($e);

            throw ValidationException::withMessages([self::INVALID_RESPONSE]);
        }

        return response()->json(['data' => ['url' => $url]]);
    }

    public function callback(Request $request, string $provider): JsonResponse
    {
        if (! SocialProviders::isEnabled($provider)) {
            abort(404, 'Not found');
        }

        try {
            $result = $this->social->callback($provider, $request);
        } catch (HttpExceptionInterface $e) {
            // The service aborts 404 when no panel user exists; keep its status
            // instead of folding it into the generic provider error.
            throw $e;
        } catch (Throwable $e) {
            report($e);

            throw ValidationException::withMessages([self::INVALID_RESPONSE]);
        }

        // Refuse a 2FA user with the old-style key-0 422 -
        // no session, no challenge (the branch below no longer exists).
        if ($result->status === LoginResult::TWO_FACTOR_REFUSED) {
            throw ValidationException::withMessages([self::TWO_FACTOR_ENABLED]);
        }

        return match ($result->status) {
            // Old socialHandleCallback's raw 422: the CA checks `error_type`
            // (SocialLogin.vue:58) and the numeric error key 0.
            LoginResult::ACCOUNT_EXISTS => response()->json([
                'error_type' => 'account_already_exists',
                'errors' => [[self::ACCOUNT_EXISTS, self::ACCOUNT_EXISTS]],
            ], 422),
            default => response()->json($this->home->build($result->user)),
        };
    }
}
