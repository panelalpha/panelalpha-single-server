<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /server-accounts/{id}/ftp-accounts – the old FtpAccountStoreRequest
 * rules, aligned with the Engine's FtpAccountStoreRequest.
 */
final class FtpAccountStoreRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'user' => ['required', 'string', 'not_regex:/@/', 'max:32'],
            'domain' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'min:8', 'max:255'],
            'directory' => ['nullable', 'string', 'max:4096'],
            'unlimited_quota' => ['sometimes', 'boolean'],
            'quota' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
