<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /server-accounts/{id}/ssl/certificates/install – the CA sends the domain
 * in the body plus the certificate, private key and optional CA bundle (which
 * it spells `certificate`/`cabundle`).
 */
final class SslCertificateRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'domain' => ['required', 'string', 'max:255'],
            'certificate' => ['required', 'string'],
            'key' => ['required', 'string'],
            'cabundle' => ['nullable', 'string'],
        ];
    }
}
