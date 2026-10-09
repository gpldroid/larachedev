alter table public.developer_tool_runs
  drop constraint if exists developer_tool_runs_tool_key_check;
alter table public.developer_tool_runs
  add constraint developer_tool_runs_tool_key_check
  check (tool_key in (
    'repository_importer',
    'file_manager',
    'html_editor',
    'website_viewer',
    'seo_audit',
    'performance_audit',
    'content_studio',
    'deployment_manager',
    'github_repository_manager'
  ));
