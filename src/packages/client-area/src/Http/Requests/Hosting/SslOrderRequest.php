<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /server-accounts/{id}/ssl/certificates/order (and /retry) – the CA sends
 * the domain in the body; the single-server Engine issues Let's Encrypt, so a
 * provider id is accepted but unused.
 */
final class SslOrderRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'domain' => ['required', 'string', 'max:255'],
            'provider_id' => ['sometimes', 'nullable'],
        ];
    }
}
