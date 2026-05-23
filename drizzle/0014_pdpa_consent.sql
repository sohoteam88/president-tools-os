-- PDPA consent columns on public submission tables
ALTER TABLE public.funnel_leads
  ADD COLUMN IF NOT EXISTS pdpa_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_text TEXT;

ALTER TABLE public.lead_magnet_downloads
  ADD COLUMN IF NOT EXISTS pdpa_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_text TEXT;

ALTER TABLE public.webinar_registrations
  ADD COLUMN IF NOT EXISTS pdpa_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_text TEXT;
