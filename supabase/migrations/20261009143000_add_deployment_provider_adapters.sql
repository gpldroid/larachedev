-- Provider adapter registry: configuration contains non-secret metadata only.
-- Credentials must remain in Supabase Edge Function secrets, never in browser or this table.
create table if not exists public.deployment_providers (
 id uuid primary key default gen_random_uuid(),
 provider_key text not null unique,
 display_name text not null,
 enabled boolean not null default false,
 configuration jsonb not null default '{}'::jsonb,
 secret_reference text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.deployment_providers enable row level security;
drop policy if exists "enabled admins read deployment providers" on public.deployment_providers;
create policy "enabled admins read deployment providers" on public.deployment_providers for select to authenticated using(public.is_enabled_admin());
drop policy if exists "owners manage deployment providers" on public.deployment_providers;
create policy "owners manage deployment providers" on public.deployment_providers for all to authenticated
 using(exists(select 1 from public.admin_users au where au.user_id=auth.uid() and au.enabled and au.role in ('owner','admin')))
 with check(exists(select 1 from public.admin_users au where au.user_id=auth.uid() and au.enabled and au.role in ('owner','admin')));
grant select,insert,update,delete on public.deployment_providers to authenticated;
insert into public.deployment_providers(provider_key,display_name,enabled,configuration)
values('github-actions','GitHub Actions',true,'{"dispatch_action":"workflow_dispatch","supports_runs":true}'::jsonb)
on conflict(provider_key) do update set display_name=excluded.display_name,configuration=excluded.configuration,updated_at=now();
