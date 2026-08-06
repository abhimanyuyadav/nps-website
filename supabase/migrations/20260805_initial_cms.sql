-- Nepal Police School CMS: run this migration with `supabase db push` or in the Supabase SQL editor.
-- Auth registrations should be disabled in Supabase Dashboard. Create the first user there, then promote it:
-- update public.profiles set role = 'admin' where id = '<auth-user-uuid>';

create extension if not exists "pgcrypto";

create type public.app_role as enum ('admin', 'editor');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'editor',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_settings (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.leadership (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug in ('principal', 'vice_principal', 'commandant')),
  name text not null,
  designation text not null,
  message text not null,
  photo_url text,
  signature_url text,
  office_hours text,
  is_enabled boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  designation text not null check (char_length(designation) between 2 and 120),
  department text not null check (char_length(department) between 2 and 120),
  qualification text,
  bio text,
  photo_url text,
  social_links jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  excerpt text,
  body jsonb not null default '{}'::jsonb,
  cover_url text,
  published_at timestamptz,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue text,
  cover_url text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  category text not null default 'General',
  published_at timestamptz,
  is_published boolean not null default false,
  attachment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  alt_text text not null,
  image_url text not null,
  category text,
  position integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  relationship text not null,
  quote text not null,
  photo_url text,
  position integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  file_url text not null,
  file_type text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  subject text,
  message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('admin', 'editor'));
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
create trigger profiles_updated before update on public.profiles for each row execute procedure public.set_updated_at();

do $$ declare t text; begin
  foreach t in array array['site_settings','leadership','teachers','news','events','announcements','gallery_items','testimonials','documents'] loop
    execute format('create trigger %I_updated before update on public.%I for each row execute procedure public.set_updated_at()', t, t);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.site_settings enable row level security;
alter table public.leadership enable row level security;
alter table public.teachers enable row level security;
alter table public.news enable row level security;
alter table public.events enable row level security;
alter table public.announcements enable row level security;
alter table public.gallery_items enable row level security;
alter table public.testimonials enable row level security;
alter table public.documents enable row level security;
alter table public.contact_messages enable row level security;

create policy "Profiles visible to owner or staff" on public.profiles for select using (auth.uid() = id or public.is_staff());
create policy "Admins manage profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

create policy "Public reads site settings" on public.site_settings for select using (true);
create policy "Staff manage site settings" on public.site_settings for all using (public.is_staff()) with check (public.is_staff());

create policy "Public reads enabled leadership" on public.leadership for select using (is_enabled or public.is_staff());
create policy "Staff manage leadership" on public.leadership for all using (public.is_staff()) with check (public.is_staff());
create policy "Public reads enabled teachers" on public.teachers for select using (is_enabled or public.is_staff());
create policy "Staff manage teachers" on public.teachers for all using (public.is_staff()) with check (public.is_staff());

create policy "Public reads published news" on public.news for select using (is_published or public.is_staff());
create policy "Staff manage news" on public.news for all using (public.is_staff()) with check (public.is_staff());
create policy "Public reads published events" on public.events for select using (is_published or public.is_staff());
create policy "Staff manage events" on public.events for all using (public.is_staff()) with check (public.is_staff());
create policy "Public reads published announcements" on public.announcements for select using (is_published or public.is_staff());
create policy "Staff manage announcements" on public.announcements for all using (public.is_staff()) with check (public.is_staff());
create policy "Public reads published gallery" on public.gallery_items for select using (is_published or public.is_staff());
create policy "Staff manage gallery" on public.gallery_items for all using (public.is_staff()) with check (public.is_staff());
create policy "Public reads published testimonials" on public.testimonials for select using (is_published or public.is_staff());
create policy "Staff manage testimonials" on public.testimonials for all using (public.is_staff()) with check (public.is_staff());
create policy "Public reads published documents" on public.documents for select using (is_published or public.is_staff());
create policy "Staff manage documents" on public.documents for all using (public.is_staff()) with check (public.is_staff());
create policy "Anyone can submit a contact message" on public.contact_messages for insert with check (char_length(name) >= 2 and char_length(message) >= 5);
create policy "Staff reads contact messages" on public.contact_messages for select using (public.is_staff());
create policy "Staff updates contact messages" on public.contact_messages for update using (public.is_staff()) with check (public.is_staff());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 10485760, array['image/jpeg','image/png','image/webp','image/avif','application/pdf','video/mp4'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Public reads published site media" on storage.objects for select using (bucket_id = 'site-media');
create policy "Staff uploads site media" on storage.objects for insert to authenticated with check (bucket_id = 'site-media' and public.is_staff());
create policy "Staff updates site media" on storage.objects for update to authenticated using (bucket_id = 'site-media' and public.is_staff()) with check (bucket_id = 'site-media' and public.is_staff());
create policy "Staff deletes site media" on storage.objects for delete to authenticated using (bucket_id = 'site-media' and public.is_staff());
