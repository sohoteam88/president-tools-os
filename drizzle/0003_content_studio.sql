-- ============================================================
-- Migration: 0003_content_studio
-- Description: Content drafts, compliance logs, RLS, and updated-at trigger
-- Created: 2026-05-20
-- ============================================================

CREATE TABLE IF NOT EXISTS public.content_drafts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  platform               TEXT NOT NULL,
  content_type           TEXT NOT NULL,
  user_topic             TEXT,
  generated_draft        TEXT NOT NULL,
  user_draft             TEXT,
  compliance_status      TEXT NOT NULL DEFAULT 'pending',
  compliance_flags       TEXT,
  modification_score     REAL,
  voice_profile_version  INTEGER,
  exported_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_drafts_account ON public.content_drafts(account_id);
CREATE INDEX IF NOT EXISTS idx_content_drafts_account_created ON public.content_drafts(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_drafts_account_compliance ON public.content_drafts(account_id, compliance_status);

CREATE TABLE IF NOT EXISTS public.content_compliance_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  draft_id      UUID NOT NULL REFERENCES public.content_drafts(id) ON DELETE CASCADE,
  layer         INTEGER NOT NULL,
  result        TEXT NOT NULL,
  flag_codes    TEXT,
  details       TEXT,
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_compliance_logs_draft ON public.content_compliance_logs(draft_id);
CREATE INDEX IF NOT EXISTS idx_content_compliance_logs_account_checked ON public.content_compliance_logs(account_id, checked_at DESC);

CREATE OR REPLACE FUNCTION public.set_content_drafts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_drafts_updated_at ON public.content_drafts;
CREATE TRIGGER content_drafts_updated_at
  BEFORE UPDATE ON public.content_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_content_drafts_updated_at();

ALTER TABLE public.content_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_compliance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_drafts_select" ON public.content_drafts;
CREATE POLICY "content_drafts_select" ON public.content_drafts
  FOR SELECT USING (
    public.auth_is_admin()
    OR public.auth_is_member_of(account_id)
  );

DROP POLICY IF EXISTS "content_drafts_insert" ON public.content_drafts;
CREATE POLICY "content_drafts_insert" ON public.content_drafts
  FOR INSERT WITH CHECK (
    public.auth_is_admin()
    OR account_id = public.auth_account_id()
  );

DROP POLICY IF EXISTS "content_drafts_update" ON public.content_drafts;
CREATE POLICY "content_drafts_update" ON public.content_drafts
  FOR UPDATE USING (
    public.auth_is_admin()
    OR public.auth_is_member_of(account_id)
  )
  WITH CHECK (
    public.auth_is_admin()
    OR account_id = public.auth_account_id()
  );

DROP POLICY IF EXISTS "content_compliance_logs_select" ON public.content_compliance_logs;
CREATE POLICY "content_compliance_logs_select" ON public.content_compliance_logs
  FOR SELECT USING (
    public.auth_is_admin()
    OR public.auth_is_member_of(account_id)
  );

DROP POLICY IF EXISTS "content_compliance_logs_insert" ON public.content_compliance_logs;
CREATE POLICY "content_compliance_logs_insert" ON public.content_compliance_logs
  FOR INSERT WITH CHECK (
    public.auth_is_admin()
    OR account_id = public.auth_account_id()
  );
