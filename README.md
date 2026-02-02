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

Run `supabase/schema.sql` in Supabase Dashboard → SQL Editor.

It includes:
- `profiles` + `scores` tables
- RLS policies for public read + user-owned writes
- profile auto-create trigger
- a seed template (requires real `auth.users` UUIDs)

### 2) Enable Google provider

In Supabase Dashboard → Authentication → Providers:

- Enable `Google`
- Add redirect URLs:
  - `https://YOUR_DOMAIN/auth/callback`

### 3) Add Vercel env vars

In Vercel Project → Settings → Environment Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
