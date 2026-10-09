import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../admin/dashboard.html', import.meta.url), 'utf8');
const edgeFunction = readFileSync(new URL('../supabase/functions/github-manager/index.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/migrations/20261009170000_harden_content_domain_and_deployment_constraints.sql', import.meta.url), 'utf8');

test('admin dashboard includes platform modules', () => {
  for (const marker of ['page-sites','page-repositories','page-content','page-files','page-editor','page-viewer','page-deployments','page-domains','page-tools','page-settings']) {
    assert.ok(html.includes('id="'+marker+'"'), 'missing '+marker);
  }
});

test('authentication, CMS, Monaco and deploy workflows are wired', () => {
  for (const marker of ['signInWithOAuth',"provider:'github'",'monaco-editor@0.52.2','github-manager','write-file','triggerDeploy','loadWorkflowRuns','loadDeployWorkflows','syncDeploymentRows','loadContents','content_revisions','managed_sites','deployment_providers']) {
    assert.ok(html.includes(marker), 'missing '+marker);
  }
});

test('website form uses one submit handler for create and update', () => {
  const handlers = html.match(/\$\('siteForm'\)\.onsubmit\s*=/g) || [];
  assert.equal(handlers.length, 1, 'website create/update should share one submit handler');
  assert.ok(html.includes('if(editingSiteId){const {error}=await sb.from(\'managed_sites\').update(payload)'), 'edit path must update existing row');
});

test('registered repository allowlist is enforced server-side', () => {
  for (const marker of ['sb.auth.getUser()','from("admin_users")','from("repository_connections")','Repository is not registered or is disabled','const targetOwner=connection.owner','const targetRepo=connection.repository','const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")']) {
    assert.ok(edgeFunction.includes(marker), 'missing security control '+marker);
  }
});

test('database migration includes integrity protections', () => {
  for (const marker of ['content_items_slug_unique_idx','site_domains_one_primary_per_site_idx','site_deployments_workflow_run_unique_idx','larachedev_touch_updated_at']) {
    assert.ok(schema.includes(marker), 'missing schema protection '+marker);
  }
});

test('inline JavaScript blocks parse without executing browser code', () => {
  const scriptTag = String.fromCharCode(60)+'script';
  const closeTag = String.fromCharCode(60)+'/script'+String.fromCharCode(62);
  const scripts = [];
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf(scriptTag, cursor);
    if (start < 0) break;
    const tagEnd = html.indexOf('>', start);
    if (tagEnd < 0) break;
    const close = html.indexOf(closeTag, tagEnd + 1);
    if (close < 0) break;
    const openingTag = html.slice(start, tagEnd + 1);
    const body = html.slice(tagEnd + 1, close);
    if (openingTag.indexOf('src=') === -1 && body.trim()) scripts.push(body);
    cursor = close + closeTag.length;
  }
  assert.ok(scripts.length, 'no inline scripts found');
  for (const [index, source] of scripts.entries()) {
    assert.doesNotThrow(() => new vm.Script(source, {filename:'admin-inline-'+index+'.js'}), 'inline script '+index+' should parse');
  }
});
