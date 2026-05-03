-- Cooking Master — Supabase schema setup
-- Run once in: Supabase Dashboard → SQL Editor → New Query → Run

-- ── Users ────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id            text primary key,
  provider      text not null,
  provider_id   text not null,
  name          text not null,
  email         text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  unique (provider, provider_id)
);

-- ── User Profiles ─────────────────────────────────────────────────────────
create table if not exists public.user_profiles (
  user_id       text primary key references public.users(id) on delete cascade,
  family_type   text    not null default 'couple',
  baby_birthday text,
  shopping_day  integer not null default 6,
  partner_name  text,
  updated_at    timestamptz not null default now()
);

-- ── RLS (Row Level Security) ───────────────────────────────────────────────
-- Disable RLS so the anon key can read/write from server-side functions.
alter table public.users         disable row level security;
alter table public.user_profiles disable row level security;

-- ── Grants for anon role ───────────────────────────────────────────────────
-- Required when SUPABASE_SERVICE_ROLE_KEY is not set; anon key is used instead.
grant usage  on schema public                  to anon;
grant select, insert, update, delete on public.users         to anon;
grant select, insert, update, delete on public.user_profiles to anon;
