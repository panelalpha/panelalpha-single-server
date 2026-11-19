<?php

namespace PanelAlpha\Community\Backups;

use PanelAlpha\ClientArea\Contracts\PanelSettings;

/**
 * The backup defaults for new projects, read from and written to the panel
 * settings with their fallbacks. The hour and the days are UTC, as the Engine's
 * cron is; the client area converts to local time.
 */
final class BackupDefaults
{
    public const string STORE = 'userapp.backups.store';

    /**
     * The Engine container ids of the stores this panel created; the record outlives the choice.
     */
    public const string CREATED_STORES = 'userapp.backups.stores-created';

    /**
     * The single flag an earlier build saved, read once into {@see self::CREATED_STORES}.
     */
    public const string STORE_CREATED = 'userapp.backups.store-created';

    public const string AUTO_ENABLE = 'userapp.backups.auto-enable';

    public const string FREQUENCY = 'userapp.backups.frequency';

    public const string HOUR = 'userapp.backups.hour';

    public const string DAY_OF_WEEK = 'userapp.backups.day-of-week';

    public const string DAY_OF_MONTH = 'userapp.backups.day-of-month';

    public const string KEEP_LAST = 'userapp.backups.keep-last';

    public const string AUTO_ENABLE_SINCE = 'userapp.backups.auto-enable-since';

    public function __construct(private readonly PanelSettings $settings) {}

    /**
     * The Engine container id of the saved store, or null when none was saved.
     */
    public function storeId(): ?int
    {
        $value = $this->settings->get(self::STORE);

        return $value !== null && ctype_digit($value) ? (int) $value : null;
    }

    /**
     * The Engine container ids of the stores this panel created.
     *
     * @return list<int>
     */
    public function createdStoreIds(): array
    {
        $ids = [];
        foreach (explode(',', (string) $this->settings->get(self::CREATED_STORES, '')) as $part) {
            $part = trim($part);
            if ($part !== '' && ctype_digit($part)) {
                $ids[] = (int) $part;
            }
        }
        $saved = $this->storeId();
        if ($saved !== null && $this->settings->get(self::STORE_CREATED) === '1') {
            $ids[] = $saved;
        }

        return array_values(array_unique($ids));
    }

    /**
     * Save the chosen store; `$created` tells whether this panel made its
     * Engine container. A container the panel made earlier stays recorded when
     * it is chosen again.
     */
    public function rememberStore(int $id, bool $created): void
    {
        $createdIds = $this->createdStoreIds();
        if ($created) {
            $createdIds[] = $id;
        }
        $this->settings->set(self::STORE, (string) $id);
        $this->writeCreatedStoreIds($createdIds);
        $this->settings->forget(self::STORE_CREATED);
    }

    /**
     * Whether the panel made the store's Engine container (the saved one unless
     * an id is given).
     */
    public function createdByPanel(?int $id = null): bool
    {
        $id ??= $this->storeId();

        return $id !== null && in_array($id, $this->createdStoreIds(), true);
    }

    /**
     * Forget the chosen store; the containers the panel created stay recorded.
     */
    public function forgetStore(): void
    {
        $createdIds = $this->createdStoreIds();
        $this->settings->forget(self::STORE, self::STORE_CREATED);
        $this->writeCreatedStoreIds($createdIds);
    }

    /**
     * Forget a container the panel made because the Engine deleted it.
     */
    public function forgetCreatedStore(int $id): void
    {
        $this->writeCreatedStoreIds(array_values(array_filter(
            $this->createdStoreIds(),
            fn (int $created): bool => $created !== $id,
        )));
    }

    public function autoEnable(): bool
    {
        return $this->settings->get(self::AUTO_ENABLE, '1') !== '0';
    }

    public function frequency(): string
    {
        $value = $this->settings->get(self::FREQUENCY, 'daily');

        return in_array($value, ['daily', 'weekly', 'monthly'], true) ? $value : 'daily';
    }

    public function hour(): int
    {
        return $this->int(self::HOUR, 3, 0, 23);
    }

    public function dayOfWeek(): int
    {
        return $this->int(self::DAY_OF_WEEK, 0, 0, 6);
    }

    public function dayOfMonth(): int
    {
        return $this->int(self::DAY_OF_MONTH, 1, 1, 28);
    }

    public function keepLast(): int
    {
        return $this->int(self::KEEP_LAST, 7, 1, 365);
    }

    /**
     * @return array{auto_enable: bool, frequency: string, hour: int, day_of_week: int, day_of_month: int, keep_last: int}
     */
    public function all(): array
    {
        return [
            'auto_enable' => $this->autoEnable(),
            'frequency' => $this->frequency(),
            'hour' => $this->hour(),
            'day_of_week' => $this->dayOfWeek(),
            'day_of_month' => $this->dayOfMonth(),
            'keep_last' => $this->keepLast(),
        ];
    }

    /**
     * @param  array{auto_enable: bool, frequency: string, hour: int, day_of_week: int, day_of_month: int, keep_last: int}  $values
     */
    public function save(array $values): void
    {
        $this->settings->set(self::AUTO_ENABLE, $values['auto_enable'] ? '1' : '0');
        $this->settings->set(self::FREQUENCY, $values['frequency']);
        $this->settings->set(self::HOUR, (string) $values['hour']);
        $this->settings->set(self::DAY_OF_WEEK, (string) $values['day_of_week']);
        $this->settings->set(self::DAY_OF_MONTH, (string) $values['day_of_month']);
        $this->settings->set(self::KEEP_LAST, (string) $values['keep_last']);
    }

    /**
     * The default schedule's UTC cron for a project; the minute is stable per
     * project so schedules do not all fire in the same minute.
     */
    public function cronFor(string $engineUsername): string
    {
        $minute = crc32($engineUsername) % 60;
        $hour = $this->hour();

        return match ($this->frequency()) {
            'weekly' => "{$minute} {$hour} * * {$this->dayOfWeek()}",
            'monthly' => "{$minute} {$hour} {$this->dayOfMonth()} * *",
            default => "{$minute} {$hour} * * *",
        };
    }

    /**
     * @param  list<int>  $ids
     */
    private function writeCreatedStoreIds(array $ids): void
    {
        $ids = array_values(array_unique($ids));
        sort($ids);
        if ($ids === []) {
            $this->settings->forget(self::CREATED_STORES);

            return;
        }
        $this->settings->set(self::CREATED_STORES, implode(',', $ids));
    }

    private function int(string $name, int $default, int $min, int $max): int
    {
        $value = $this->settings->get($name);
        if ($value === null || ! ctype_digit($value)) {
            return $default;
        }

        $int = (int) $value;

        return $int >= $min && $int <= $max ? $int : $default;
    }
}
