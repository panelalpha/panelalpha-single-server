<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project\WordPress;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use PanelAlpha\ClientArea\Contracts\WordPressSsoRestriction;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * WP-admin SSO – the CA sends an integer user id (OpenModalAction.js:31). (section H)
 *
 * A panel user limited to one WordPress user ({@see WordPressSsoRestriction})
 * gets the old 403 for any other (old SsoUrlRequest.php:39-57).
 */
final class UserSsoRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'user' => ['required', 'integer', 'min:1'],
        ];
    }

    protected function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            $application = $this->route('application');
            $user = $this->user();
            if (! $application instanceof Application || $user === null) {
                return;
            }

            $only = app(WordPressSsoRestriction::class)->wordPressUserIdFor($user, $application);
            if ($only !== null && $only !== Payload::int($this->input('user'))) {
                abort(403, Payload::string(__('client-area::general.wordpress_sso_user_restricted')));
            }
        });
    }
}
