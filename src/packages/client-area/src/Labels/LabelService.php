<?php

namespace PanelAlpha\ClientArea\Labels;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\ApplicationLabel;
use PanelAlpha\ClientArea\Models\Label;

/**
 * Panel-only project labels.
 *
 * The one place that owns label business rules – per-user uniqueness, the
 * per-user limit, attaching/detaching a label to an application, and deleting a
 * label with the copies it left on projects – so the
 * user's LabelController and the per-project ProjectLabelController stay
 * thin orchestrators. The Engine knows nothing about labels.
 */
final class LabelService
{
    /** Old panel allowed at most 30 labels per user. */
    public const MAX_PER_USER = 30;

    public function __construct(private readonly ApplicationRepository $applications) {}

    /**
     * @return Collection<int, Label>
     */
    public function forUser(Authenticatable $user): Collection
    {
        return Label::query()
            ->where('user_id', $user->getAuthIdentifier())
            ->orderBy('title')
            ->get();
    }

    /**
     * @throws ValidationException duplicate title or limit reached
     */
    public function create(Authenticatable $user, string $title, string $color): Label
    {
        if (Label::query()->where('user_id', $user->getAuthIdentifier())->where('title', $title)->exists()) {
            throw ValidationException::withMessages(['title' => ['A label with this title already exists.']]);
        }

        if (Label::query()->where('user_id', $user->getAuthIdentifier())->count() >= self::MAX_PER_USER) {
            throw ValidationException::withMessages(['title' => ['The label limit has been reached.']]);
        }

        return Label::query()->create([
            'user_id' => $user->getAuthIdentifier(),
            'title' => $title,
            'color' => $color,
        ]);
    }

    /**
     * Labels are identified by title in the Client Area. A deleted label leaves
     * none of its copies on the projects.
     *
     * @throws ValidationException when the user has no such label
     */
    public function deleteByTitle(Authenticatable $user, string $title): void
    {
        $label = Label::query()
            ->where('user_id', $user->getAuthIdentifier())
            ->where('title', $title)
            ->first();

        if ($label === null) {
            throw ValidationException::withMessages(['title' => ['Label not found.']]);
        }

        DB::transaction(function () use ($label, $user): void {
            // The per-project copies carry title and colour, so they outlive the
            // label unless they go with it.
            ApplicationLabel::query()->where('label_id', $label->id)->delete();

            // Copies attached before `label_id` existed: same title, no link.
            ApplicationLabel::query()
                ->whereNull('label_id')
                ->where('title', $label->title)
                ->whereIn('application_id', $this->applications->forUser($user, false)->modelKeys())
                ->delete();

            $label->delete();
        });
    }

    /**
     * Attach one of the user's labels to an application (idempotent).
     *
     * Returns the label, so the activity log can carry its title and colour
     * (the CA renders `payload["…Label:<id>"]`).
     *
     * @throws ValidationException when the user has no such label
     */
    public function assign(Application $application, Authenticatable $user, string $title): Label
    {
        $label = Label::query()
            ->where('user_id', $user->getAuthIdentifier())
            ->where('title', $title)
            ->first();

        if ($label === null) {
            throw ValidationException::withMessages(['title' => ['Label not found.']]);
        }

        ApplicationLabel::query()->firstOrCreate(
            ['application_id' => $application->id, 'title' => $label->title],
            ['label_id' => $label->id, 'color' => $label->color],
        );

        return $label;
    }

    /**
     * Returns the unassigned row (it carries the title and colour the activity
     * log needs); a missing label is rejected, never returned as null.
     *
     * @throws ValidationException when the application has no such label
     */
    public function unassign(Application $application, string $title): ApplicationLabel
    {
        $row = $application->applicationLabels()->where('title', $title)->first();

        if ($row === null) {
            throw ValidationException::withMessages(['title' => ['Label not found.']]);
        }

        $row->delete();

        return $row;
    }
}
