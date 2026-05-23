CREATE TABLE IF NOT EXISTS public.daily_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  task_date DATE NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('follow_up_contact', 'share_content', 'record_voice', 'manual')),
  title TEXT NOT NULL,
  body TEXT CHECK (body IS NULL OR char_length(body) <= 300),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'snoozed', 'dismissed')),
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  snoozed_to DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_account_date ON public.daily_tasks(account_id, task_date);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_account_status ON public.daily_tasks(account_id, status);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_account_contact ON public.daily_tasks(account_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_date_status ON public.daily_tasks(task_date, status);

CREATE TABLE IF NOT EXISTS public.coach_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  generated_for_date DATE NOT NULL,
  tasks_suggested INTEGER NOT NULL DEFAULT 0,
  tasks_inserted INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coach_generations_account_date_unique UNIQUE (account_id, generated_for_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_generations_account_date ON public.coach_generations(account_id, generated_for_date);

CREATE OR REPLACE FUNCTION public.set_daily_tasks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS daily_tasks_updated_at ON public.daily_tasks;
CREATE TRIGGER daily_tasks_updated_at BEFORE UPDATE ON public.daily_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_daily_tasks_updated_at();

ALTER TABLE public.daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_tasks_select" ON public.daily_tasks;
CREATE POLICY "daily_tasks_select" ON public.daily_tasks FOR SELECT USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));
DROP POLICY IF EXISTS "daily_tasks_insert" ON public.daily_tasks;
CREATE POLICY "daily_tasks_insert" ON public.daily_tasks FOR INSERT WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());
DROP POLICY IF EXISTS "daily_tasks_update" ON public.daily_tasks;
CREATE POLICY "daily_tasks_update" ON public.daily_tasks FOR UPDATE USING (public.auth_is_admin() OR public.auth_is_member_of(account_id)) WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());
DROP POLICY IF EXISTS "daily_tasks_delete" ON public.daily_tasks;
CREATE POLICY "daily_tasks_delete" ON public.daily_tasks FOR DELETE USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));

DROP POLICY IF EXISTS "coach_generations_select" ON public.coach_generations;
CREATE POLICY "coach_generations_select" ON public.coach_generations FOR SELECT USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));
DROP POLICY IF EXISTS "coach_generations_insert" ON public.coach_generations;
CREATE POLICY "coach_generations_insert" ON public.coach_generations FOR INSERT WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());
DROP POLICY IF EXISTS "coach_generations_update" ON public.coach_generations;
CREATE POLICY "coach_generations_update" ON public.coach_generations FOR UPDATE USING (public.auth_is_admin() OR public.auth_is_member_of(account_id)) WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());
DROP POLICY IF EXISTS "coach_generations_delete_admin" ON public.coach_generations;
CREATE POLICY "coach_generations_delete_admin" ON public.coach_generations FOR DELETE USING (public.auth_is_admin());
