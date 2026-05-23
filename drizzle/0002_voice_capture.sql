-- ============================================================
-- Migration: 0002_voice_capture
-- Description: Voice captures, voice profiles, RLS, and weekly compile support
-- Created: 2026-05-20
-- ============================================================

DO $$ BEGIN
  CREATE TYPE voice_capture_type AS ENUM ('why_story', 'daily_journey', 'weekly_compile');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE voice_capture_status AS ENUM ('recording', 'uploading', 'transcribing', 'accepted', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.voice_captures (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  type              voice_capture_type NOT NULL,
  status            voice_capture_status NOT NULL,
  r2_key            TEXT,
  r2_public_url     TEXT,
  duration_seconds  INTEGER,
  transcript        TEXT,
  transcript_cleaned TEXT,
  week_start_date   DATE,
  job_id            TEXT,
  error_message     TEXT,
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_captures_account ON public.voice_captures(account_id);
CREATE INDEX IF NOT EXISTS idx_voice_captures_account_type ON public.voice_captures(account_id, type);
CREATE INDEX IF NOT EXISTS idx_voice_captures_account_status ON public.voice_captures(account_id, status);
CREATE INDEX IF NOT EXISTS idx_voice_captures_account_recorded ON public.voice_captures(account_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.voice_profiles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  version               INTEGER NOT NULL DEFAULT 1,
  profile_json          TEXT NOT NULL,
  source_capture_count  INTEGER,
  built_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_profiles_account_version ON public.voice_profiles(account_id, version);
CREATE INDEX IF NOT EXISTS idx_voice_profiles_account_built ON public.voice_profiles(account_id, built_at DESC);

CREATE OR REPLACE FUNCTION public.set_voice_captures_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS voice_captures_updated_at ON public.voice_captures;
CREATE TRIGGER voice_captures_updated_at
  BEFORE UPDATE ON public.voice_captures
  FOR EACH ROW EXECUTE FUNCTION public.set_voice_captures_updated_at();

ALTER TABLE public.voice_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voice_captures_select" ON public.voice_captures;
CREATE POLICY "voice_captures_select" ON public.voice_captures
  FOR SELECT USING (
    public.auth_is_admin()
    OR public.auth_is_member_of(account_id)
  );

DROP POLICY IF EXISTS "voice_captures_insert" ON public.voice_captures;
CREATE POLICY "voice_captures_insert" ON public.voice_captures
  FOR INSERT WITH CHECK (
    public.auth_is_admin()
    OR account_id = public.auth_account_id()
  );

DROP POLICY IF EXISTS "voice_captures_update" ON public.voice_captures;
CREATE POLICY "voice_captures_update" ON public.voice_captures
  FOR UPDATE USING (
    public.auth_is_admin()
    OR public.auth_is_member_of(account_id)
  )
  WITH CHECK (
    public.auth_is_admin()
    OR account_id = public.auth_account_id()
  );

DROP POLICY IF EXISTS "voice_profiles_select" ON public.voice_profiles;
CREATE POLICY "voice_profiles_select" ON public.voice_profiles
  FOR SELECT USING (
    public.auth_is_admin()
    OR public.auth_is_member_of(account_id)
  );

DROP POLICY IF EXISTS "voice_profiles_insert" ON public.voice_profiles;
CREATE POLICY "voice_profiles_insert" ON public.voice_profiles
  FOR INSERT WITH CHECK (
    public.auth_is_admin()
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "voice_profiles_update" ON public.voice_profiles;
CREATE POLICY "voice_profiles_update" ON public.voice_profiles
  FOR UPDATE USING (
    public.auth_is_admin()
    OR auth.role() = 'service_role'
  );
