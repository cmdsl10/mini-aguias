-- Independent weekly training photo, using the existing private JPG bucket and admin-only policies.
ALTER TABLE public.masters_trainings ADD COLUMN IF NOT EXISTS training_image_path text;
