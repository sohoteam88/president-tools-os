CREATE TABLE IF NOT EXISTS public.ad_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'tiktok', 'whatsapp_status', 'other')),
  content_draft_id UUID REFERENCES public.content_drafts(id) ON DELETE SET NULL,
  caption_preview TEXT CHECK (caption_preview IS NULL OR char_length(caption_preview) <= 200),
  posted_at DATE NOT NULL,
  reach INTEGER CHECK (reach IS NULL OR reach >= 0),
  likes INTEGER CHECK (likes IS NULL OR likes >= 0),
  comments INTEGER CHECK (comments IS NULL OR comments >= 0),
  saves INTEGER CHECK (saves IS NULL OR saves >= 0),
  shares INTEGER CHECK (shares IS NULL OR shares >= 0),
  dms_received INTEGER CHECK (dms_received IS NULL OR dms_received >= 0),
  leads_generated INTEGER CHECK (leads_generated IS NULL OR leads_generated >= 0),
  link_clicks INTEGER CHECK (link_clicks IS NULL OR link_clicks >= 0),
  screenshot_key TEXT,
  ocr_extracted_stats TEXT,
  ocr_confidence TEXT CHECK (ocr_confidence IS NULL OR ocr_confidence IN ('high', 'low')),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_entries_account ON public.ad_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_ad_entries_account_posted ON public.ad_entries(account_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_entries_account_platform ON public.ad_entries(account_id, platform);
CREATE INDEX IF NOT EXISTS idx_ad_entries_account_draft ON public.ad_entries(account_id, content_draft_id);

CREATE TABLE IF NOT EXISTS public.ad_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL UNIQUE REFERENCES public.accounts(id) ON DELETE CASCADE,
  analysis_text TEXT NOT NULL,
  entries_analysed INTEGER NOT NULL,
  analysed_at TIMESTAMPTZ NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_analyses_account ON public.ad_analyses(account_id);

CREATE OR REPLACE FUNCTION public.set_ad_entries_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ad_entries_updated_at ON public.ad_entries;
CREATE TRIGGER ad_entries_updated_at BEFORE UPDATE ON public.ad_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_ad_entries_updated_at();

ALTER TABLE public.ad_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_entries_select" ON public.ad_entries;
CREATE POLICY "ad_entries_select" ON public.ad_entries FOR SELECT USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));
DROP POLICY IF EXISTS "ad_entries_insert" ON public.ad_entries;
CREATE POLICY "ad_entries_insert" ON public.ad_entries FOR INSERT WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());
DROP POLICY IF EXISTS "ad_entries_update" ON public.ad_entries;
CREATE POLICY "ad_entries_update" ON public.ad_entries FOR UPDATE USING (public.auth_is_admin() OR public.auth_is_member_of(account_id)) WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());
DROP POLICY IF EXISTS "ad_entries_delete" ON public.ad_entries;
CREATE POLICY "ad_entries_delete" ON public.ad_entries FOR DELETE USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));

DROP POLICY IF EXISTS "ad_analyses_select" ON public.ad_analyses;
CREATE POLICY "ad_analyses_select" ON public.ad_analyses FOR SELECT USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));
DROP POLICY IF EXISTS "ad_analyses_insert" ON public.ad_analyses;
CREATE POLICY "ad_analyses_insert" ON public.ad_analyses FOR INSERT WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());
DROP POLICY IF EXISTS "ad_analyses_update" ON public.ad_analyses;
CREATE POLICY "ad_analyses_update" ON public.ad_analyses FOR UPDATE USING (public.auth_is_admin() OR public.auth_is_member_of(account_id)) WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());
DROP POLICY IF EXISTS "ad_analyses_delete_admin" ON public.ad_analyses;
CREATE POLICY "ad_analyses_delete_admin" ON public.ad_analyses FOR DELETE USING (public.auth_is_admin());
