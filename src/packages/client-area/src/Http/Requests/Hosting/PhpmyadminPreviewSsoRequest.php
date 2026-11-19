<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /server-accounts/{id}/mysql/phpmyadmin-preview-sso-url – the old
 * controller validated only `database_id` (nullable); the CA sends it for a
 * Plesk account and the Engine token call ignores it.
 */
final class PhpmyadminPreviewSsoRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'database_id' => ['nullable'],
        ];
    }
}
