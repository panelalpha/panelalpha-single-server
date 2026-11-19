<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /server-accounts/{id}/ssl/settings/{domain} – the CA toggles the forced
 * HTTPS redirect.
 */
final class SslSettingsRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'force_https_redirect' => ['required', 'boolean'],
        ];
    }
}
