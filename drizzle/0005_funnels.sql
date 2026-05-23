CREATE TABLE IF NOT EXISTS public.funnels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  path_slug TEXT NOT NULL,
  title TEXT NOT NULL,
  funnel_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  content_json TEXT NOT NULL,
  cta_type TEXT NOT NULL DEFAULT 'thank_you',
  cta_value TEXT,
  whatsapp_pre_fill TEXT,
  compliance_status TEXT DEFAULT 'unchecked',
  compliance_checked_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT funnels_account_path_unique UNIQUE(account_id, path_slug)
);

CREATE INDEX IF NOT EXISTS idx_funnels_account ON public.funnels(account_id);
CREATE INDEX IF NOT EXISTS idx_funnels_account_status ON public.funnels(account_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_funnels_account_path ON public.funnels(account_id, path_slug);

CREATE TABLE IF NOT EXISTS public.funnel_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  notes TEXT,
  contacted_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funnel_leads_account ON public.funnel_leads(account_id);
CREATE INDEX IF NOT EXISTS idx_funnel_leads_funnel ON public.funnel_leads(funnel_id);
CREATE INDEX IF NOT EXISTS idx_funnel_leads_funnel_submitted ON public.funnel_leads(funnel_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_funnel_leads_ip_funnel_submitted ON public.funnel_leads(ip_address, funnel_id, submitted_at);

CREATE OR REPLACE FUNCTION public.set_funnels_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS funnels_updated_at ON public.funnels;
CREATE TRIGGER funnels_updated_at
  BEFORE UPDATE ON public.funnels
  FOR EACH ROW EXECUTE FUNCTION public.set_funnels_updated_at();

ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "funnels_select" ON public.funnels;
CREATE POLICY "funnels_select" ON public.funnels
  FOR SELECT USING (
    status = 'published'
    OR public.auth_is_admin()
    OR public.auth_is_member_of(account_id)
  );

DROP POLICY IF EXISTS "funnels_insert" ON public.funnels;
CREATE POLICY "funnels_insert" ON public.funnels
  FOR INSERT WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());

DROP POLICY IF EXISTS "funnels_update" ON public.funnels;
CREATE POLICY "funnels_update" ON public.funnels
  FOR UPDATE USING (public.auth_is_admin() OR public.auth_is_member_of(account_id))
  WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());

DROP POLICY IF EXISTS "funnels_delete" ON public.funnels;
CREATE POLICY "funnels_delete" ON public.funnels
  FOR DELETE USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));

DROP POLICY IF EXISTS "funnel_leads_select" ON public.funnel_leads;
CREATE POLICY "funnel_leads_select" ON public.funnel_leads
  FOR SELECT USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));

DROP POLICY IF EXISTS "funnel_leads_insert" ON public.funnel_leads;
CREATE POLICY "funnel_leads_insert" ON public.funnel_leads
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "funnel_leads_update" ON public.funnel_leads;
CREATE POLICY "funnel_leads_update" ON public.funnel_leads
  FOR UPDATE USING (public.auth_is_admin() OR public.auth_is_member_of(account_id))
  WITH CHECK (public.auth_is_admin() OR public.auth_is_member_of(account_id));

DROP POLICY IF EXISTS "funnel_leads_delete_admin" ON public.funnel_leads;
CREATE POLICY "funnel_leads_delete_admin" ON public.funnel_leads
  FOR DELETE USING (public.auth_is_admin());
