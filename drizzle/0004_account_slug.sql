ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_slug ON public.accounts(slug);

CREATE OR REPLACE FUNCTION public.get_account_id_by_slug(p_slug TEXT)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM public.accounts WHERE slug = p_slug AND is_active = true LIMIT 1;
$$;
