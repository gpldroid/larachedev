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
  for (const marker of ['signInWithOAuth',"provider:'github'",'monaco-editor@0.52.2','github-manager','write-file','triggerDeploy','loadWorkflowRuns','managed_sites']) {
    assert.ok(html.includes(marker), 'missing '+marker);
  }
});

test('inline script blocks are extracted and non-library scripts parse', () => {
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
