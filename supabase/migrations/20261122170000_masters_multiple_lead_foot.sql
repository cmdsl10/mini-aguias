ALTER TABLE public.masters_trainings ADD COLUMN IF NOT EXISTS lead_foot_player_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
UPDATE public.masters_trainings SET lead_foot_player_ids=ARRAY[lead_foot_player_id] WHERE lead_foot_player_id IS NOT NULL AND cardinality(lead_foot_player_ids)=0;
