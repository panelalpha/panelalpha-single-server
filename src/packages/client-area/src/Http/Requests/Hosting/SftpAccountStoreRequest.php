<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * POST /server-accounts/{id}/sftp-accounts – the old SftpAccountRequest rules,
 * aligned with the Engine's SftpAccountStoreRequest.
 */
final class SftpAccountStoreRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // The CA sends `type` (password | public_key); the service maps it
            // to the Engine's `auth_method` and prefixes the username. The
            // chosen credential is required, the other one ignored (old
            // SftpAccountRequest `prepareForValidation`; the password follows
            // `Password::defaults()`).
            'username' => ['required', 'string', 'max:32', 'regex:/^[a-zA-Z0-9_]+$/'],
            'type' => ['required', 'string', 'in:password,public_key'],
            // Only the credential the chosen `type` uses is validated; the old
            // request nulled the other one.
            'password' => ['exclude_unless:type,password', 'required_if:type,password', 'nullable', 'string', Password::defaults()],
            'public_key' => ['exclude_unless:type,public_key', 'required_if:type,public_key', 'nullable', 'string', 'max:4096', new SshPublicKey],
        ];
    }
}
