<?php

namespace App\Http\Controllers;

use App\Services\Auth\LoginResult;
use App\Services\Auth\LoginService;
use App\Support\HomePayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(
        private readonly LoginService $login,
        private readonly HomePayload $home,
    ) {}

    /**
     * CA-compatible login (email step → password step → home payload).
     *
     * @throws ValidationException
     */
    public function login(Request $request): JsonResponse
    {
        $params = $request->validate([
            // Match legacy CA LoginRequest: format is not enforced client-side.
            'email' => ['required', 'string'],
            'password' => ['nullable', 'string', 'min:8', 'max:255'],
            'remember' => ['nullable', 'boolean'],
        ]);

        $result = $this->login->attempt(
            $request,
            $params['email'],
            $params['password'] ?? null,
            (bool) ($params['remember'] ?? false),
        );

        return match ($result->status) {
            LoginResult::USE_PASSWORD => response()->json(['use_password' => true]),
            LoginResult::TWO_FACTOR => response()->json(['two_factor' => true]),
            LoginResult::PASSWORD_SETUP => response()->json($result->answer),
            default => response()->json($this->home->build($result->user)),
        };
    }

    /**
     * CA logout: forget the session and the CSRF token so the SPA's cookies are
     * useless afterwards.
     */
    public function logout(Request $request): JsonResponse
    {
        $this->login->logout($request);

        return response()->json(['success' => true]);
    }
}
