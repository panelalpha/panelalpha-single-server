<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project\Import;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /projects/import/test-wordpress-connection and POST
 * /projects/import/import – the old `ImportRequest` rules
 * (packages/api/app/Http/Requests/User/Instance/ImportRequest.php:22-56) for
 * the plugin method the CA sends (`OnboardingImportSimpleMethodModal.vue:333-342`,
 * `OnboardingModalWrapper.vue:1779-1785`). With the wp-admin login
 * (`using_admin_login_credentials`) the login and password are required, as
 * the old `validatePluginImportParams` required them. The FTP fields are
 * accepted as the old request accepted them; the service refuses the FTP
 * method.
 */
class ImportConnectionRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $admin = $this->boolean('using_admin_login_credentials') && $this->input('type') === 'plugin';

        return [
            'type' => ['bail', 'required', 'string', 'in:plugin,ftp'],
            'url' => ['bail', 'required', 'string', 'url'],
            'service_id' => ['bail', 'required', 'integer'],
            'domain_id' => ['sometimes', 'integer'],
            'login_url' => ['nullable', 'string'],
            'username' => [$admin ? 'required' : 'nullable', 'string'],
            'password' => [$admin ? 'required' : 'nullable', 'string'],
            'using_admin_login_credentials' => ['nullable', 'boolean'],
            'ip_address' => ['nullable', 'string', 'ip'],
            'protocol' => ['nullable', 'string', 'in:ftp,ftps,sftp'],
            'path' => ['nullable', 'string'],
            'shared_access' => ['array'],
            'shared_access.*' => ['string', 'email'],
        ];
    }
}
