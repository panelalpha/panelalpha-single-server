<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Panel-only project labels (used by ProjectPresenter and the labels
 * endpoints). The Engine knows nothing about them, so they live beside
 * the mirrored applications and cascade when a project disappears.
 *
 * `application_labels` denormalises title/color (as the old panel did) so the
 * project list does not need a join per label.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('labels', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->string('color');
            $table->timestamps();
        });

        Schema::create('application_labels', function (Blueprint $table) {
            $table->id();
            $table->foreignId('application_id')->constrained('applications')->cascadeOnDelete();
            $table->unsignedBigInteger('label_id')->nullable();
            $table->string('title')->default('');
            $table->string('color')->default('');
            $table->timestamps();

            $table->index('application_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('application_labels');
        Schema::dropIfExists('labels');
    }
};
