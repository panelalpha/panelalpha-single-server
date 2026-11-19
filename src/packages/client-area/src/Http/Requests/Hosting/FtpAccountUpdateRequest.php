<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /server-accounts/{id}/ftp-accounts/{user} – the old FtpAccountUpdateRequest.
 */
final class FtpAccountUpdateRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'password' => ['nullable', 'string', 'min:8', 'max:255'],
            'unlimited_quota' => ['sometimes', 'boolean'],
            'quota' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
