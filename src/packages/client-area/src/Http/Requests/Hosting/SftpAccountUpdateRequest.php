<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * PUT /server-accounts/{id}/sftp-accounts/{user} – the old SftpAccountRequest
 * update rules, aligned with the Engine's SftpAccountUpdateRequest.
 */
final class SftpAccountUpdateRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // The CA sends `type`; the service maps it to `auth_method`. The
            // chosen credential is required (old SftpAccountRequest; the password
            // follows `Password::defaults()`).
            'type' => ['required', 'string', 'in:password,public_key'],
            // Only the chosen credential is validated; the old request nulled
            // the other one.
            'password' => ['exclude_unless:type,password', 'required_if:type,password', 'nullable', 'string', Password::defaults()],
            'public_key' => ['exclude_unless:type,public_key', 'required_if:type,public_key', 'nullable', 'string', 'max:4096', new SshPublicKey],
        ];
    }
}
