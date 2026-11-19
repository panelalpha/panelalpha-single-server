<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /server-accounts/{id}/sftp-accounts/set-access-type – the old
 * SftpAccountController::setAccessType validation (`access_type` in ssh/sftp).
 * The write itself is refused (the Engine has no endpoint for it), but an invalid value must still be a
 * field error, as the old panel's request produced.
 */
final class SftpAccessTypeRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'access_type' => ['required', 'string', 'in:ssh,sftp'],
        ];
    }
}
