import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../admin/dashboard.html', import.meta.url), 'utf8');
test('admin dashboard has required platform modules', () => {
  for (const marker of ['page-sites','page-repositories','page-files','page-editor','page-viewer','page-deployments','page-domains','page-tools','page-settings']) {
    assert.ok(html.includes('id="'+marker+'"'), 'missing '+marker);
  }
});
test('authentication and developer tooling integrations are present', () => {
  for (const marker of ['signInWithOAuth','provider:\'github\'','monaco-editor@0.52.2','github-manager','write-file','triggerDeploy','loadWorkflowRuns','managed_sites']) {
    assert.ok(html.includes(marker), 'missing '+marker);
  }
});
test('inline JavaScript parses without executing browser code', () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
  assert.ok(scripts.length, 'no inline scripts found');
  for (const [index, source] of scripts.entries()) { try { new vm.Script(source, {filename:'admin-inline-'+index+'.js'}); } catch (error) { throw new Error('Inline script '+index+': '+error.message); } }
});
