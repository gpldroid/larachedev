-- Tighten integrity for content, domains and deployment tracking.
-- Existing records were checked for duplicate content slugs and primary domains before applying.
create unique index if not exists content_items_slug_unique_idx
  on public.content_items (slug);
create unique index if not exists site_domains_one_primary_per_site_idx
  on public.site_domains (site_id) where is_primary = true;
create unique index if not exists site_deployments_workflow_run_unique_idx
  on public.site_deployments (workflow_run_id) where workflow_run_id is not null;

create or replace function public.larachedev_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists larachedev_touch_updated_at on public.managed_sites;
create trigger larachedev_touch_updated_at
before update on public.managed_sites
for each row execute function public.larachedev_touch_updated_at();

drop trigger if exists larachedev_touch_updated_at on public.site_domains;
create trigger larachedev_touch_updated_at
before update on public.site_domains
for each row execute function public.larachedev_touch_updated_at();

drop trigger if exists larachedev_touch_updated_at on public.repository_connections;
create trigger larachedev_touch_updated_at
before update on public.repository_connections
for each row execute function public.larachedev_touch_updated_at();

drop trigger if exists larachedev_touch_updated_at on public.deployment_providers;
create trigger larachedev_touch_updated_at
before update on public.deployment_providers
for each row execute function public.larachedev_touch_updated_at();

drop trigger if exists larachedev_touch_updated_at on public.content_items;
create trigger larachedev_touch_updated_at
before update on public.content_items
for each row execute function public.larachedev_touch_updated_at();
