-- Voice architecture remediation: guided Why Story, journey moments, weekly draft seeds

CREATE TABLE IF NOT EXISTS public.why_story_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'recording'
    CHECK (status IN ('recording','transcribing','extracting','confirming','complete','abandoned')),
  audio_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  transcripts JSONB NOT NULL DEFAULT '[]'::jsonb,
  draft_moments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_why_story_sessions_account ON public.why_story_sessions(account_id, status);

CREATE TABLE IF NOT EXISTS public.journey_moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('why_story','daily_capture')),
  raw_text TEXT NOT NULL,
  moment_type TEXT NOT NULL
    CHECK (moment_type IN ('success_story','challenge_overcome','lifestyle_glimpse','product_experience','mindset_shift')),
  question_index INTEGER,
  why_story_session_id UUID REFERENCES public.why_story_sessions(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journey_moments_account ON public.journey_moments(account_id, confirmed_at);
CREATE INDEX IF NOT EXISTS idx_journey_moments_account_created ON public.journey_moments(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.weekly_draft_seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  seeds JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT weekly_draft_seeds_account_week_uniq UNIQUE(account_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_draft_seeds_account ON public.weekly_draft_seeds(account_id, week_start DESC);

ALTER TABLE public.why_story_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_draft_seeds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "why_story_sessions_select" ON public.why_story_sessions;
CREATE POLICY "why_story_sessions_select" ON public.why_story_sessions FOR SELECT
  USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));

DROP POLICY IF EXISTS "why_story_sessions_insert" ON public.why_story_sessions;
CREATE POLICY "why_story_sessions_insert" ON public.why_story_sessions FOR INSERT
  WITH CHECK (public.auth_is_admin() OR public.auth_is_member_of(account_id));

DROP POLICY IF EXISTS "why_story_sessions_update" ON public.why_story_sessions;
CREATE POLICY "why_story_sessions_update" ON public.why_story_sessions FOR UPDATE
  USING (public.auth_is_admin() OR public.auth_is_member_of(account_id))
  WITH CHECK (public.auth_is_admin() OR public.auth_is_member_of(account_id));

DROP POLICY IF EXISTS "journey_moments_select" ON public.journey_moments;
CREATE POLICY "journey_moments_select" ON public.journey_moments FOR SELECT
  USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));

DROP POLICY IF EXISTS "journey_moments_insert" ON public.journey_moments;
CREATE POLICY "journey_moments_insert" ON public.journey_moments FOR INSERT
  WITH CHECK (public.auth_is_admin() OR public.auth_is_member_of(account_id));

DROP POLICY IF EXISTS "weekly_draft_seeds_select" ON public.weekly_draft_seeds;
CREATE POLICY "weekly_draft_seeds_select" ON public.weekly_draft_seeds FOR SELECT
  USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));

DROP POLICY IF EXISTS "weekly_draft_seeds_insert" ON public.weekly_draft_seeds;
CREATE POLICY "weekly_draft_seeds_insert" ON public.weekly_draft_seeds FOR INSERT
  WITH CHECK (public.auth_is_admin() OR public.auth_is_member_of(account_id));

DROP POLICY IF EXISTS "weekly_draft_seeds_update" ON public.weekly_draft_seeds;
CREATE POLICY "weekly_draft_seeds_update" ON public.weekly_draft_seeds FOR UPDATE
  USING (public.auth_is_admin() OR public.auth_is_member_of(account_id))
  WITH CHECK (public.auth_is_admin() OR public.auth_is_member_of(account_id));
