<?php

namespace Tests\Browser\ClientArea\Tests\Instances;

use Laravel\Dusk\Browser;
use PHPUnit\Framework\Attributes\Test;
use Tests\Browser\ClientArea\Pages\Auth\LoginPage;
use Tests\Browser\ClientArea\Pages\Instances\InstancePage;
use Tests\Browser\ClientArea\Tests\Traits\InstanceTrait;
use Tests\Browser\ClientArea\Tests\Traits\UserTrait;
use Tests\DuskTestCase;

/**
 * Ported from packages/api/tests/Browser/ClientArea/Tests/Instances/ImportInstanceTest.php.
 *
 * WordPress import is Phase 2 of the product, so every case is
 * N/A. The old steps are kept so the port is visible.
 */
class ImportInstanceTest extends DuskTestCase
{
    use UserTrait, InstanceTrait;

    /**
     * @group ClientArea
     * @group Instances
     * @group ImportInstance
     */
    #[Test]
    public function cannot_import_instance_invalid_url(): void
    {
        $this->skipImport();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $server = $this->setServer();
            $plan = $this->setPlan('Premium', 'quick', $server->id);
            $params = ['url' => 'https://example.com'];
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new InstancePage)
                ->createService($user->id, $plan->id)
                ->importInstance($params);
        });
    }

    /**
     * @group ClientArea
     * @group Instances
     * @group ImportInstance
     */
    #[Test]
    public function cannot_import_instance_incorrect_ftp_config(): void
    {
        $this->skipImport();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $server = $this->setServer();
            $plan = $this->setPlan('Premium', 'quick', $server->id);
            $params = $this->setFakeTestImportParams();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new InstancePage)
                ->createService($user->id, $plan->id)
                ->importInstance($params)
                ->waitForText('Cannot connect to FTP server', 15);
        });
    }

    /**
     * @group ClientArea
     * @group Instances
     * @group ImportInstance
     */
    #[Test]
    public function can_import_instance(): void
    {
        $this->skipImport();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $server = $this->setServer();
            $plan = $this->setPlan('Premium', 'quick', $server->id);
            $params = $this->getTestImportParams();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new InstancePage)
                ->createService($user->id, $plan->id)
                ->importInstance($params)
                ->waitForText('Congratulations!')
                ->waitForText('The import process has been started!')
                ->press('Return to Dashboard')
                ->assertSee('Installation in progress'); // CA reads: src/components/instances/InstanceCardImgInstallationPending.vue:80
        });
    }

    /**
     * @return array{url: string, hostname: string, user: string, password: string, path: string}
     */
    private function setFakeTestImportParams(): array
    {
        $faker = \Faker\Factory::create();

        return [
            'url' => 'https://wordpress.com',
            'hostname' => 'ftp.example.com',
            'user' => $faker->userName(),
            'password' => $faker->password(),
            'path' => 'wp',
        ];
    }

    /**
     * @return array{url: string|null, hostname: string|null, user: string|null, password: string|null, path: string|null}
     */
    private function getTestImportParams(): array
    {
        return [
            'url' => is_string(env('TEST_IMPORT_WORDPRESS_URL')) ? env('TEST_IMPORT_WORDPRESS_URL') : null,
            'hostname' => is_string(env('TEST_IMPORT_HOSTNAME')) ? env('TEST_IMPORT_HOSTNAME') : null,
            'user' => is_string(env('TEST_IMPORT_USER')) ? env('TEST_IMPORT_USER') : null,
            'password' => is_string(env('TEST_IMPORT_PASSWORD')) ? env('TEST_IMPORT_PASSWORD') : null,
            'path' => is_string(env('TEST_IMPORT_PATH')) ? env('TEST_IMPORT_PATH') : null,
        ];
    }

    private function skipImport(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: WordPress import is Phase 2 (ImportInstanceTest.php).'
        );
    }
}
