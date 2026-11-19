<?php

namespace Tests\Browser\ClientArea\Tests\Traits;

/**
 * Fixtures shared by the ported Instances/Hosting tests.
 *
 * The old tests built a Plan/Server/Service chain in the panel database and
 * created a WordPress instance through onboarding. v1 has no such tables and the
 * suite runs against the lead's shared Engine, so the instance-dependent tests
 * are skipped.
 * The helpers are kept so every ported test still compiles and shows the old
 * flow.
 */
trait InstanceTrait
{
    private function setServer(): object
    {
        return (object) ['id' => 1];
    }

    /**
     * The old `setPlan()` built `plans` rows; the config keys the browser steps
     * read are kept here.
     */
    private function setPlan(
        string $whmPackage,
        string $onboarding,
        int $serverId,
        bool $theme = false,
        bool $advanced = false,
    ): object {
        $config = [
            'onboarding' => [
                'method' => $onboarding,
                'standard_ask_for_theme' => $theme,
                'standard_fields' => [
                    'language' => $advanced,
                    'database_name' => $advanced,
                    'database_prefix' => $advanced,
                    'admin_username' => $advanced,
                    'admin_email' => $advanced,
                    'admin_password' => $advanced,
                ],
            ],
            'billing' => ['upgrade_link' => 'https://www.panelalpha.com/'],
        ];

        return new class($config) implements \ArrayAccess
        {
            public int $id = 1;

            /** @param array<string, mixed> $config */
            public function __construct(public array $config) {}

            public function offsetExists(mixed $offset): bool
            {
                return $offset === 'config';
            }

            public function offsetGet(mixed $offset): mixed
            {
                return $offset === 'config' ? $this->config : null;
            }

            public function offsetSet(mixed $offset, mixed $value): void {}

            public function offsetUnset(mixed $offset): void {}
        };
    }

    /**
     * @return array{site_name: string, domain: string}
     */
    private function generateFakeData(): array
    {
        $faker = \Faker\Factory::create();

        return [
            'site_name' => $faker->domainWord(),
            'domain' => $faker->domainWord().'.com',
        ];
    }
}
