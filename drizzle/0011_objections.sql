CREATE TABLE IF NOT EXISTS public.objection_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('price', 'skepticism', 'mlm_concern', 'time', 'loyalty')),
  title TEXT NOT NULL CHECK (char_length(title) <= 80),
  response_text TEXT NOT NULL CHECK (char_length(response_text) BETWEEN 50 AND 500),
  tone TEXT NOT NULL DEFAULT 'empathetic' CHECK (tone IN ('empathetic', 'logical', 'story')),
  compliance_status TEXT NOT NULL DEFAULT 'pending' CHECK (compliance_status IN ('pending', 'passed', 'flagged')),
  compliance_flags TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_objection_responses_category_published ON public.objection_responses(category, is_published);
CREATE INDEX IF NOT EXISTS idx_objection_responses_compliance ON public.objection_responses(compliance_status);
CREATE INDEX IF NOT EXISTS idx_objection_responses_category_sort ON public.objection_responses(category, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_objection_responses_category_title ON public.objection_responses(category, title);

CREATE TABLE IF NOT EXISTS public.account_objection_favourites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  objection_response_id UUID NOT NULL REFERENCES public.objection_responses(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT account_objection_favourites_unique UNIQUE (account_id, objection_response_id)
);
CREATE INDEX IF NOT EXISTS idx_account_objection_favourites_account ON public.account_objection_favourites(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_objection_favourites_unique ON public.account_objection_favourites(account_id, objection_response_id);

CREATE TABLE IF NOT EXISTS public.account_objection_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('price', 'skepticism', 'mlm_concern', 'time', 'loyalty')),
  title TEXT NOT NULL CHECK (char_length(title) <= 80),
  response_text TEXT NOT NULL CHECK (char_length(response_text) BETWEEN 50 AND 500),
  tone TEXT NOT NULL DEFAULT 'empathetic' CHECK (tone IN ('empathetic', 'logical', 'story')),
  compliance_status TEXT NOT NULL DEFAULT 'pending' CHECK (compliance_status IN ('pending', 'passed', 'flagged')),
  compliance_flags TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_account_objection_responses_account_category ON public.account_objection_responses(account_id, category);
CREATE INDEX IF NOT EXISTS idx_account_objection_responses_account_compliance ON public.account_objection_responses(account_id, compliance_status);

CREATE OR REPLACE FUNCTION public.set_objections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS objection_responses_updated_at ON public.objection_responses;
CREATE TRIGGER objection_responses_updated_at BEFORE UPDATE ON public.objection_responses
  FOR EACH ROW EXECUTE FUNCTION public.set_objections_updated_at();
DROP TRIGGER IF EXISTS account_objection_responses_updated_at ON public.account_objection_responses;
CREATE TRIGGER account_objection_responses_updated_at BEFORE UPDATE ON public.account_objection_responses
  FOR EACH ROW EXECUTE FUNCTION public.set_objections_updated_at();

ALTER TABLE public.objection_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_objection_favourites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_objection_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "objection_responses_select" ON public.objection_responses;
CREATE POLICY "objection_responses_select" ON public.objection_responses FOR SELECT USING (is_published = true OR public.auth_is_admin());
DROP POLICY IF EXISTS "objection_responses_insert_admin" ON public.objection_responses;
CREATE POLICY "objection_responses_insert_admin" ON public.objection_responses FOR INSERT WITH CHECK (public.auth_is_admin());
DROP POLICY IF EXISTS "objection_responses_update_admin" ON public.objection_responses;
CREATE POLICY "objection_responses_update_admin" ON public.objection_responses FOR UPDATE USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
DROP POLICY IF EXISTS "objection_responses_delete_admin" ON public.objection_responses;
CREATE POLICY "objection_responses_delete_admin" ON public.objection_responses FOR DELETE USING (public.auth_is_admin());

DROP POLICY IF EXISTS "account_objection_favourites_select" ON public.account_objection_favourites;
CREATE POLICY "account_objection_favourites_select" ON public.account_objection_favourites FOR SELECT USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));
DROP POLICY IF EXISTS "account_objection_favourites_insert" ON public.account_objection_favourites;
CREATE POLICY "account_objection_favourites_insert" ON public.account_objection_favourites FOR INSERT WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());
DROP POLICY IF EXISTS "account_objection_favourites_delete" ON public.account_objection_favourites;
CREATE POLICY "account_objection_favourites_delete" ON public.account_objection_favourites FOR DELETE USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));

DROP POLICY IF EXISTS "account_objection_responses_select" ON public.account_objection_responses;
CREATE POLICY "account_objection_responses_select" ON public.account_objection_responses FOR SELECT USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));
DROP POLICY IF EXISTS "account_objection_responses_insert" ON public.account_objection_responses;
CREATE POLICY "account_objection_responses_insert" ON public.account_objection_responses FOR INSERT WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());
DROP POLICY IF EXISTS "account_objection_responses_update" ON public.account_objection_responses;
CREATE POLICY "account_objection_responses_update" ON public.account_objection_responses FOR UPDATE USING (public.auth_is_admin() OR public.auth_is_member_of(account_id)) WITH CHECK (public.auth_is_admin() OR account_id = public.auth_account_id());
DROP POLICY IF EXISTS "account_objection_responses_delete" ON public.account_objection_responses;
CREATE POLICY "account_objection_responses_delete" ON public.account_objection_responses FOR DELETE USING (public.auth_is_admin() OR public.auth_is_member_of(account_id));
