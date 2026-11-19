<?php

namespace App\Http\Responses;

use Illuminate\Validation\ValidationException;
use Laravel\Fortify\Contracts\FailedTwoFactorLoginResponse;

/**
 * The answer of POST /two-factor-challenge when the code is wrong.
 *
 * Fortify's stock response answers `The provided two factor authentication code
 * was invalid.` (and `… recovery code …` for a backup code). The guide quotes
 * the message the My Account dialog already shows for a wrong code,
 * `The entered code is invalid.`, so the sign-in step gets the same words (and
 * a wrong backup code its own).
 */
final class TwoFactorCodeRefusedResponse implements FailedTwoFactorLoginResponse
{
    public const CODE_MESSAGE = 'The entered code is invalid.';

    public const RECOVERY_CODE_MESSAGE = 'The entered backup code is invalid.';

    /**
     * @param  \Illuminate\Http\Request  $request
     *
     * @throws \Illuminate\Validation\ValidationException
     */
    public function toResponse($request)
    {
        [$key, $message] = $request->filled('recovery_code')
            ? ['recovery_code', self::RECOVERY_CODE_MESSAGE]
            : ['code', self::CODE_MESSAGE];

        if ($request->wantsJson()) {
            throw ValidationException::withMessages([
                $key => [$message],
            ]);
        }

        return redirect()->route('two-factor.login')->withErrors([$key => $message]);
    }
}
