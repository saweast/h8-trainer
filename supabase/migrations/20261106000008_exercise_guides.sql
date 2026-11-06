-- h8-trainer: a short description and a YouTube link for custom exercises.
-- Catalog exercises ship their guide (photos, steps, video) with the app, so these stay null
-- there. Links are limited to YouTube so a trainer can't point clients at an arbitrary site.
-- RLS is unchanged: exercises_update already lets only the owner edit a custom exercise.

alter table public.exercises
  add column description text check (char_length(description) <= 1000),
  add column video_url text check (
    char_length(video_url) <= 200
    and video_url ~ '^https://(www\.|m\.)?(youtube\.com|youtu\.be)/'
  ),
  add constraint exercises_guide_custom_only check (slug is null or (description is null and video_url is null));
