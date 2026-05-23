CREATE TABLE IF NOT EXISTS public.lead_magnets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  thumbnail_url TEXT,
  master_pdf_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_magnets_active ON public.lead_magnets(is_active);

CREATE TABLE IF NOT EXISTS public.account_lead_magnets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL UNIQUE REFERENCES public.accounts(id) ON DELETE CASCADE,
  lead_magnet_id UUID NOT NULL REFERENCES public.lead_magnets(id),
  personalised_pdf_key TEXT,
  personalised_at TIMESTAMPTZ,
  master_version_at_personalisation INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_lead_magnets_account ON public.account_lead_magnets(account_id);
CREATE INDEX IF NOT EXISTS idx_account_lead_magnets_magnet ON public.account_lead_magnets(lead_magnet_id);

CREATE TABLE IF NOT EXISTS public.lead_magnet_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  account_lead_magnet_id UUID NOT NULL REFERENCES public.account_lead_magnets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_magnet_downloads_account ON public.lead_magnet_downloads(account_id);
CREATE INDEX IF NOT EXISTS idx_lead_magnet_downloads_activation ON public.lead_magnet_downloads(account_lead_magnet_id);
CREATE INDEX IF NOT EXISTS idx_lead_magnet_downloads_activation_downloaded ON public.lead_magnet_downloads(account_lead_magnet_id, downloaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_magnet_downloads_ip_activation_downloaded ON public.lead_magnet_downloads(ip_address, account_lead_magnet_id, downloaded_at);

CREATE OR REPLACE FUNCTION public.set_lead_magnets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_magnets_updated_at ON public.lead_magnets;
CREATE TRIGGER lead_magnets_updated_at
  BEFORE UPDATE ON public.lead_magnets
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_magnets_updated_at();

DROP TRIGGER IF EXISTS account_lead_magnets_updated_at ON public.account_lead_magnets;
CREATE TRIGGER account_lead_magnets_updated_at
  BEFORE UPDATE ON public.account_lead_magnets
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_magnets_updated_at();

ALTER TABLE public.lead_magnets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_lead_magnets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_magnet_downloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_magnets_select" ON public.lead_magnets;
CREATE POLICY "lead_magnets_select" ON public.lead_magnets
  FOR SELECT USING (auth.uid() IS NOT NULL OR public.auth_is_admin());

DROP POLICY IF EXISTS "lead_magnets_insert_admin" ON public.lead_magnets;
CREATE POLICY "lead_magnets_insert_admin" ON public.lead_magnets
  FOR INSERT WITH CHECK (public.auth_is_admin());

DROP POLICY IF EXISTS "lead_magnets_update_admin" ON public.lead_magnets;
CREATE POLICY "lead_magnets_update_admin" ON public.lead_magnets
  FOR UPDATE USING (public.auth_is_admin());

DROP POLICY IF EXISTS "lead_magnets_delete_admin" ON public.lead_magnets;
CREATE POLICY "lead_magnets_delete_admin" ON public.lead_magnets
  FOR DELETE USING (public.auth_is_admin());

DROP POLICY IF EXISTS "account_lead_magnets_select" ON public.account_lead_magnets;
CREATE POLICY "account_lead_magnets_select" ON public.account_lead_magnets
  FOR SELECT USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));

DROP POLICY IF EXISTS "account_lead_magnets_insert" ON public.account_lead_magnets;
CREATE POLICY "account_lead_magnets_insert" ON public.account_lead_magnets
  FOR INSERT WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());

DROP POLICY IF EXISTS "account_lead_magnets_update" ON public.account_lead_magnets;
CREATE POLICY "account_lead_magnets_update" ON public.account_lead_magnets
  FOR UPDATE USING (public.auth_is_admin() OR public.auth_is_member_of(account_id))
  WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());

DROP POLICY IF EXISTS "account_lead_magnets_delete_admin" ON public.account_lead_magnets;
CREATE POLICY "account_lead_magnets_delete_admin" ON public.account_lead_magnets
  FOR DELETE USING (public.auth_is_admin());

DROP POLICY IF EXISTS "lead_magnet_downloads_select" ON public.lead_magnet_downloads;
CREATE POLICY "lead_magnet_downloads_select" ON public.lead_magnet_downloads
  FOR SELECT USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));

DROP POLICY IF EXISTS "lead_magnet_downloads_insert" ON public.lead_magnet_downloads;
CREATE POLICY "lead_magnet_downloads_insert" ON public.lead_magnet_downloads
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "lead_magnet_downloads_update_admin" ON public.lead_magnet_downloads;
CREATE POLICY "lead_magnet_downloads_update_admin" ON public.lead_magnet_downloads
  FOR UPDATE USING (public.auth_is_admin());

DROP POLICY IF EXISTS "lead_magnet_downloads_delete_admin" ON public.lead_magnet_downloads;
CREATE POLICY "lead_magnet_downloads_delete_admin" ON public.lead_magnet_downloads
  FOR DELETE USING (public.auth_is_admin());
