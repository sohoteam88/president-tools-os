-- ============================================================
-- Migration: 0001_initial_accounts
-- Description: Core multi-tenant foundation tables + RLS policies
-- Created: 2026-05-20
--
-- Tables created:
--   accounts, users, account_memberships, invite_tokens, audit_logs
--
-- RLS strategy:
--   - All business tables protected by Row-Level Security
--   - Policies use auth.uid() to look up account membership
--   - Admin users (role='admin') can read across accounts
--   - Service role key bypasses RLS (for admin operations)
--
-- Note: Run this once against your Supabase project.
-- Use: supabase db push OR paste into Supabase SQL Editor
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE distributor_seniority AS ENUM ('new', 'mid', 'experienced', 'senior');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE onboarding_path AS ENUM ('newbie_full', 'experienced_partial', 'self_serve');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('owner', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Users (mirrors auth.users) ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY,           -- Same as auth.users.id
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: auto-create public.users row when auth.users is inserted
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email      = EXCLUDED.email,
    name       = COALESCE(EXCLUDED.name, public.users.name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ─── Accounts ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.accounts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT NOT NULL,
  herbalife_id                TEXT,
  distributor_seniority       distributor_seniority NOT NULL DEFAULT 'new',
  onboarding_path             onboarding_path NOT NULL DEFAULT 'newbie_full',
  voice_capture_completed_at  TIMESTAMPTZ,
  setup_wizard_completed_at   TIMESTAMPTZ,
  terms_accepted_at           TIMESTAMPTZ,
  terms_version               TEXT,
  is_active                   BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounts_active ON public.accounts(is_active);

-- ─── Account Memberships ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.account_memberships (
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  role        member_role NOT NULL DEFAULT 'owner',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user    ON public.account_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_account ON public.account_memberships(account_id);

-- ─── Invite Tokens ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invite_tokens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token               TEXT NOT NULL UNIQUE,
  email               TEXT NOT NULL,
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  role                member_role NOT NULL DEFAULT 'owner',
  created_by_user_id  UUID NOT NULL REFERENCES public.users(id),
  expires_at          TIMESTAMPTZ NOT NULL,
  accepted_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invite_tokens_token   ON public.invite_tokens(token);
CREATE INDEX IF NOT EXISTS        idx_invite_tokens_email   ON public.invite_tokens(email);
CREATE INDEX IF NOT EXISTS        idx_invite_tokens_account ON public.invite_tokens(account_id);

-- ─── Audit Logs (append-only) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID,               -- NULL = platform-level action
  actor_user_id  UUID,               -- NULL = system/cron
  action         TEXT NOT NULL,
  resource_type  TEXT,
  resource_id    TEXT,
  ip_address     TEXT,
  user_agent     TEXT,
  metadata       TEXT,               -- JSON string
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_account ON public.audit_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor   ON public.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action  ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at);

-- ─── RLS Helper Functions ─────────────────────────────────────────────────────

/**
 * Returns the account_id for the currently authenticated user.
 * Used in RLS policies — more efficient than a subquery inline.
 */
CREATE OR REPLACE FUNCTION public.auth_account_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT account_id
  FROM   public.account_memberships
  WHERE  user_id = auth.uid()
  LIMIT  1;
$$;

/**
 * Returns true if the current user is an admin (Steven).
 * Admins can read across all accounts.
 */
CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.account_memberships
    WHERE  user_id = auth.uid()
    AND    role    = 'admin'
  );
$$;

/**
 * Returns true if the current user is a member of the given account_id.
 * Used inline in RLS policies for per-row checks.
 */
CREATE OR REPLACE FUNCTION public.auth_is_member_of(target_account_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.account_memberships
    WHERE  user_id    = auth.uid()
    AND    account_id = target_account_id
  );
$$;

-- ─── Enable RLS ───────────────────────────────────────────────────────────────

ALTER TABLE public.accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs         ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies: accounts ───────────────────────────────────────────────────

-- Users can SELECT only their own account (or all if admin)
DROP POLICY IF EXISTS "accounts_select" ON public.accounts;
CREATE POLICY "accounts_select" ON public.accounts
  FOR SELECT USING (
    public.auth_is_admin()
    OR id = public.auth_account_id()
  );

-- Only admins can INSERT new accounts
DROP POLICY IF EXISTS "accounts_insert_admin" ON public.accounts;
CREATE POLICY "accounts_insert_admin" ON public.accounts
  FOR INSERT WITH CHECK (public.auth_is_admin());

-- Users can UPDATE their own account; admins can update any
DROP POLICY IF EXISTS "accounts_update" ON public.accounts;
CREATE POLICY "accounts_update" ON public.accounts
  FOR UPDATE USING (
    public.auth_is_admin()
    OR id = public.auth_account_id()
  );

-- Only admins can soft-delete (set is_active = false)
DROP POLICY IF EXISTS "accounts_delete_admin" ON public.accounts;
CREATE POLICY "accounts_delete_admin" ON public.accounts
  FOR DELETE USING (public.auth_is_admin());

-- ─── RLS Policies: users ──────────────────────────────────────────────────────

-- Users can see their own profile, or any user in their account, or all if admin
DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select" ON public.users
  FOR SELECT USING (
    public.auth_is_admin()
    OR id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.account_memberships am1
      INNER JOIN public.account_memberships am2
        ON am1.account_id = am2.account_id
      WHERE am1.user_id = auth.uid()
        AND am2.user_id = public.users.id
    )
  );

-- Users can update their own profile
DROP POLICY IF EXISTS "users_update_self" ON public.users;
CREATE POLICY "users_update_self" ON public.users
  FOR UPDATE USING (id = auth.uid() OR public.auth_is_admin());

-- The auth trigger inserts users (uses SECURITY DEFINER), no INSERT policy needed for anon

-- ─── RLS Policies: account_memberships ───────────────────────────────────────

-- Members can see their own account's memberships; admins see all
DROP POLICY IF EXISTS "memberships_select" ON public.account_memberships;
CREATE POLICY "memberships_select" ON public.account_memberships
  FOR SELECT USING (
    public.auth_is_admin()
    OR account_id = public.auth_account_id()
  );

-- Only admins can add members to accounts
DROP POLICY IF EXISTS "memberships_insert_admin" ON public.account_memberships;
CREATE POLICY "memberships_insert_admin" ON public.account_memberships
  FOR INSERT WITH CHECK (public.auth_is_admin());

-- Only admins can remove members
DROP POLICY IF EXISTS "memberships_delete_admin" ON public.account_memberships;
CREATE POLICY "memberships_delete_admin" ON public.account_memberships
  FOR DELETE USING (public.auth_is_admin());

-- ─── RLS Policies: invite_tokens ─────────────────────────────────────────────

-- Admins can see all tokens; members can see tokens for their account
DROP POLICY IF EXISTS "invites_select" ON public.invite_tokens;
CREATE POLICY "invites_select" ON public.invite_tokens
  FOR SELECT USING (
    public.auth_is_admin()
    OR account_id = public.auth_account_id()
  );

-- Only admins can create invite tokens
DROP POLICY IF EXISTS "invites_insert_admin" ON public.invite_tokens;
CREATE POLICY "invites_insert_admin" ON public.invite_tokens
  FOR INSERT WITH CHECK (public.auth_is_admin());

-- Admins can update (mark accepted) any token
-- The invite acceptance flow uses service role to mark tokens accepted
DROP POLICY IF EXISTS "invites_update_admin" ON public.invite_tokens;
CREATE POLICY "invites_update_admin" ON public.invite_tokens
  FOR UPDATE USING (public.auth_is_admin());

-- ─── RLS Policies: audit_logs ────────────────────────────────────────────────

-- Users can read their own account's logs; admins read all
DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT USING (
    public.auth_is_admin()
    OR account_id = public.auth_account_id()
  );

-- INSERT allowed from application (anon key) — writes go through our API
-- which validates the account. Service role also can insert.
DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT WITH CHECK (
    -- Users can only insert logs for their own account
    account_id IS NULL  -- platform-level logs (system/cron)
    OR account_id = public.auth_account_id()
    OR public.auth_is_admin()
  );

-- DELETE is NEVER allowed on audit_logs (append-only)
-- No DELETE policy = RLS blocks all deletes from anon/user keys

-- ─── Updated-at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── Verify RLS is enabled ───────────────────────────────────────────────────

DO $$
DECLARE
  tbl TEXT;
  rls_enabled BOOLEAN;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'accounts', 'users', 'account_memberships', 'invite_tokens', 'audit_logs'
  ] LOOP
    SELECT relrowsecurity INTO rls_enabled
    FROM pg_class
    WHERE oid = (quote_ident(tbl))::regclass;

    IF NOT rls_enabled THEN
      RAISE EXCEPTION 'RLS is NOT enabled on table: %', tbl;
    END IF;
  END LOOP;
  RAISE NOTICE 'RLS verification passed: all foundation tables are protected.';
END;
$$;
