CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  email TEXT,
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'warm', 'hot', 'customer', 'team_member')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('funnel', 'lead_magnet', 'webinar', 'manual')),
  source_id TEXT,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  last_contacted_at TIMESTAMPTZ,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contacts_account_whatsapp_unique UNIQUE (account_id, whatsapp_number)
);
CREATE INDEX IF NOT EXISTS idx_contacts_account ON public.contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_account_stage ON public.contacts(account_id, stage);
CREATE INDEX IF NOT EXISTS idx_contacts_account_archived ON public.contacts(account_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_contacts_account_source ON public.contacts(account_id, source, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_whatsapp ON public.contacts(account_id, whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_account ON public.contacts(whatsapp_number, account_id);

CREATE TABLE IF NOT EXISTS public.contact_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('stage_change', 'note_added', 'whatsapp_sent', 'manual_contact')),
  payload TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_activities_contact ON public.contact_activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_activities_account_contact ON public.contact_activities(account_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_activities_account_created ON public.contact_activities(account_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_contacts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS contacts_updated_at ON public.contacts;
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_contacts_updated_at();

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_select" ON public.contacts;
CREATE POLICY "contacts_select" ON public.contacts FOR SELECT USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));
DROP POLICY IF EXISTS "contacts_insert" ON public.contacts;
CREATE POLICY "contacts_insert" ON public.contacts FOR INSERT WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());
DROP POLICY IF EXISTS "contacts_update" ON public.contacts;
CREATE POLICY "contacts_update" ON public.contacts FOR UPDATE USING (public.auth_is_admin() OR public.auth_is_member_of(account_id)) WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());
DROP POLICY IF EXISTS "contacts_delete_admin" ON public.contacts;
CREATE POLICY "contacts_delete_admin" ON public.contacts FOR DELETE USING (public.auth_is_admin());

DROP POLICY IF EXISTS "contact_activities_select" ON public.contact_activities;
CREATE POLICY "contact_activities_select" ON public.contact_activities FOR SELECT USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));
DROP POLICY IF EXISTS "contact_activities_insert" ON public.contact_activities;
CREATE POLICY "contact_activities_insert" ON public.contact_activities FOR INSERT WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());
DROP POLICY IF EXISTS "contact_activities_update_admin" ON public.contact_activities;
CREATE POLICY "contact_activities_update_admin" ON public.contact_activities FOR UPDATE USING (public.auth_is_admin());
DROP POLICY IF EXISTS "contact_activities_delete_admin" ON public.contact_activities;
CREATE POLICY "contact_activities_delete_admin" ON public.contact_activities FOR DELETE USING (public.auth_is_admin());
