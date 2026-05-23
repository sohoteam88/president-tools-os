CREATE TABLE IF NOT EXISTS public.webinars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  bunny_video_id TEXT NOT NULL,
  bunny_library_id TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webinars_active ON public.webinars(is_active);

CREATE TABLE IF NOT EXISTS public.account_webinars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL UNIQUE REFERENCES public.accounts(id) ON DELETE CASCADE,
  webinar_id UUID NOT NULL REFERENCES public.webinars(id),
  custom_intro TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_webinars_account ON public.account_webinars(account_id);
CREATE INDEX IF NOT EXISTS idx_account_webinars_webinar ON public.account_webinars(webinar_id);

CREATE TABLE IF NOT EXISTS public.webinar_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  account_webinar_id UUID NOT NULL REFERENCES public.account_webinars(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  email TEXT,
  watch_token TEXT NOT NULL UNIQUE,
  watched_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webinar_registrations_account ON public.webinar_registrations(account_id);
CREATE INDEX IF NOT EXISTS idx_webinar_registrations_activation ON public.webinar_registrations(account_webinar_id);
CREATE INDEX IF NOT EXISTS idx_webinar_registrations_activation_registered ON public.webinar_registrations(account_webinar_id, registered_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webinar_registrations_token ON public.webinar_registrations(watch_token);
CREATE INDEX IF NOT EXISTS idx_webinar_registrations_ip_activation_registered ON public.webinar_registrations(ip_address, account_webinar_id, registered_at);

CREATE OR REPLACE FUNCTION public.set_webinars_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS webinars_updated_at ON public.webinars;
CREATE TRIGGER webinars_updated_at BEFORE UPDATE ON public.webinars
  FOR EACH ROW EXECUTE FUNCTION public.set_webinars_updated_at();
DROP TRIGGER IF EXISTS account_webinars_updated_at ON public.account_webinars;
CREATE TRIGGER account_webinars_updated_at BEFORE UPDATE ON public.account_webinars
  FOR EACH ROW EXECUTE FUNCTION public.set_webinars_updated_at();

ALTER TABLE public.webinars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_webinars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webinar_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webinars_select" ON public.webinars;
CREATE POLICY "webinars_select" ON public.webinars FOR SELECT USING (auth.uid() IS NOT NULL OR public.auth_is_admin());
DROP POLICY IF EXISTS "webinars_insert_admin" ON public.webinars;
CREATE POLICY "webinars_insert_admin" ON public.webinars FOR INSERT WITH CHECK (public.auth_is_admin());
DROP POLICY IF EXISTS "webinars_update_admin" ON public.webinars;
CREATE POLICY "webinars_update_admin" ON public.webinars FOR UPDATE USING (public.auth_is_admin());
DROP POLICY IF EXISTS "webinars_delete_admin" ON public.webinars;
CREATE POLICY "webinars_delete_admin" ON public.webinars FOR DELETE USING (public.auth_is_admin());

DROP POLICY IF EXISTS "account_webinars_select" ON public.account_webinars;
CREATE POLICY "account_webinars_select" ON public.account_webinars FOR SELECT USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));
DROP POLICY IF EXISTS "account_webinars_insert" ON public.account_webinars;
CREATE POLICY "account_webinars_insert" ON public.account_webinars FOR INSERT WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());
DROP POLICY IF EXISTS "account_webinars_update" ON public.account_webinars;
CREATE POLICY "account_webinars_update" ON public.account_webinars FOR UPDATE USING (public.auth_is_admin() OR public.auth_is_member_of(account_id)) WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());
DROP POLICY IF EXISTS "account_webinars_delete_admin" ON public.account_webinars;
CREATE POLICY "account_webinars_delete_admin" ON public.account_webinars FOR DELETE USING (public.auth_is_admin());

DROP POLICY IF EXISTS "webinar_registrations_select" ON public.webinar_registrations;
CREATE POLICY "webinar_registrations_select" ON public.webinar_registrations FOR SELECT USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));
DROP POLICY IF EXISTS "webinar_registrations_insert" ON public.webinar_registrations;
CREATE POLICY "webinar_registrations_insert" ON public.webinar_registrations FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "webinar_registrations_update" ON public.webinar_registrations;
CREATE POLICY "webinar_registrations_update" ON public.webinar_registrations FOR UPDATE USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));
DROP POLICY IF EXISTS "webinar_registrations_delete_admin" ON public.webinar_registrations;
CREATE POLICY "webinar_registrations_delete_admin" ON public.webinar_registrations FOR DELETE USING (public.auth_is_admin());
