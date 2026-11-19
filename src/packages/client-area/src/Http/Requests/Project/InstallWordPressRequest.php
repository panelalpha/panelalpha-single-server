<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Closure;
use Illuminate\Foundation\Http\FormRequest;
use PanelAlpha\ClientArea\Onboarding\WordPressOrg;

/**
 * POST /projects/install – the old `InstanceInstallRequest` rules
 * (packages/api/app/Http/Requests/User/InstanceInstallRequest.php:17-51) for
 * the body the CA sends (`OnboardingModalWrapper.vue:1605-1614`, the standard
 * form `OnboardingStandardFormModal.vue:713-730`). Templates and clones have no
 * Engine counterpart (`instance_template_id` stays a plain integer); `dir`,
 * `db_prefix` and the admin password are checked where the Engine would refuse
 * them (a relative subdirectory, `WpConfigCreateRequest` `dbprefix`,
 * `WpCoreInstallRequest` `admin_password` min 8).
 */
final class InstallWordPressRequest extends FormRequest
{
    /** The install form's version select only offers these (`GET /projects/wordpress-versions`). */
    public const VERSION_NOT_OFFERED = 'This WordPress version is not available. Choose one of the versions the panel offers.';

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'service_id' => ['required', 'integer'],
            'domain_id' => ['required', 'integer'],
            'install_method' => ['nullable', 'string', 'in:quick,standard,super_quick,simple,advanced'],
            'install_type' => ['nullable', 'string', 'in:clean,template,clone'],
            'instance_template_id' => ['nullable', 'integer'],
            'clone_instance_id' => ['nullable', 'integer'],
            'version' => [
                'nullable',
                'string',
                'regex:/^(latest|\d+\.\d+(\.\d+)?)$/',
                function (string $attribute, mixed $value, Closure $fail): void {
                    // The Engine accepts any well-formed version and fails the
                    // install later ("Release not found"); the panel's own list
                    // is the catalogue, so refuse what it does not offer. An
                    // unreachable catalogue (an empty answer) refuses nothing.
                    if ($value === 'latest' || ! is_string($value)) {
                        return;
                    }
                    $offered = app(WordPressOrg::class)->availableVersions();
                    if ($offered !== [] && ! in_array($value, $offered, true)) {
                        $fail(self::VERSION_NOT_OFFERED);
                    }
                },
            ],
            'name' => ['nullable', 'string', 'max:255'],
            'protocol' => ['nullable', 'string', 'in:https://,http://'],
            'dir' => ['nullable', 'string', 'max:255', 'regex:/^(?!.*(^|\/)\.\.?(\/|$))[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/'],
            'language' => ['nullable', 'string', 'max:32'],
            'db_name' => ['nullable', 'string'],
            'db_prefix' => ['nullable', 'string', 'max:32', 'regex:/^[A-Za-z0-9_]+$/'],
            'admin_username' => ['nullable', 'string', 'max:60'],
            'admin_email' => ['nullable', 'string', 'email'],
            'admin_password' => ['nullable', 'string', 'min:8'],
            'theme' => ['nullable', 'string', 'max:255', 'regex:/^[A-Za-z0-9._-]+$/'],
            'shared_access' => ['array'],
            'shared_access.*' => ['string', 'email'],
            'site_description' => ['nullable', 'string'],
        ];
    }
}
