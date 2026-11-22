CREATE TABLE IF NOT EXISTS public.masters_staff_attendance (
 training_id uuid NOT NULL REFERENCES public.masters_trainings(id) ON DELETE RESTRICT,
 player_id uuid NOT NULL REFERENCES public.masters_players(id) ON DELETE RESTRICT,
 status text NOT NULL CHECK (status IN ('present','absent')),
 PRIMARY KEY (training_id,player_id)
);
ALTER TABLE public.masters_staff_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY masters_staff_read ON public.masters_staff_attendance FOR SELECT TO authenticated USING ((SELECT masters_private.can_read()));
CREATE POLICY masters_staff_write ON public.masters_staff_attendance FOR ALL TO authenticated USING ((SELECT masters_private.is_admin())) WITH CHECK ((SELECT masters_private.is_admin()));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.masters_staff_attendance TO authenticated;
