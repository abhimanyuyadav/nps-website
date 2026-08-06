# NPS Digital Campus

Premium Nepal Police School Garuda website built with Next.js 16, TypeScript, Tailwind CSS, Motion, and Supabase-ready CMS tooling.

## Run locally

1. Copy `.env.example` to `.env.local` and add your Supabase project URL and publishable key.
2. Run `npm install`.
3. Run the SQL in `supabase/migrations/20260805_initial_cms.sql` in the Supabase SQL Editor (or use `supabase db push`).
4. In Supabase Auth, create the initial staff user. Then run the documented `update public.profiles ...` statement at the top of the migration to assign the `admin` role.
5. Start the site with `npm run dev`.

## Security model

- Supabase Auth manages password hashing, recovery, and session tokens.
- `/admin` uses a server-side authenticated-user check plus a role check.
- RLS restricts CMS writes and media uploads to `admin` or `editor` profiles.
- Only an `admin` can manage user profiles and roles.
- `site-media` accepts JPEG, PNG, WebP, AVIF, PDF, and MP4 up to 10 MB.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.

## Verification

`npm run lint` and `node node_modules/next/dist/bin/next build` both pass on the delivered project.
