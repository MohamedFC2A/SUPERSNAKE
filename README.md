# SUPERSNAKE

Snake Survival is a Vite + TypeScript browser game with a simple multi-page UI (hash routing).

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Deploy to Vercel

This repo works on Vercel as a static Vite build.

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm ci` (recommended)

## Supabase (Google login + real leaderboards)

The app supports optional online features using Supabase:

- Google sign-in (Supabase Auth)
- Online Profile (username)
- Online Leaderboards (best score per player)

### 1) Create tables (SQL)

Run this in Supabase SQL editor:

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text,
  avatar_url text,
  updated_at timestamptz default now()
);

create table if not exists public.scores (
  id bigserial primary key,
  user_id uuid references auth.users on delete cascade,
  username text,
  score int not null,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.scores enable row level security;

create policy "Public read profiles" on public.profiles
for select using (true);

create policy "Users upsert own profile" on public.profiles
for insert with check (auth.uid() = id);

create policy "Users update own profile" on public.profiles
for update using (auth.uid() = id);

create policy "Public read scores" on public.scores
for select using (true);

create policy "Users insert own scores" on public.scores
for insert with check (auth.uid() = user_id);
```

### 2) Enable Google provider

In Supabase Dashboard → Authentication → Providers:

- Enable `Google`
- Add redirect URLs:
  - `https://YOUR_DOMAIN/auth/callback`

### 3) Add Vercel env vars

In Vercel Project → Settings → Environment Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
