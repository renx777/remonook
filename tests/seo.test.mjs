import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const robots=readFileSync(new URL('../public/robots.txt',import.meta.url),'utf8');
const sitemap=readFileSync(new URL('../public/sitemap.xml',import.meta.url),'utf8');
const stagingBuild=readFileSync(new URL('../scripts/build-environment.mjs',import.meta.url),'utf8');
const stagingHeaders=readFileSync(new URL('../cloud/staging-headers',import.meta.url),'utf8');
const landing=readFileSync(new URL('../src/Landing.tsx',import.meta.url),'utf8');

test('public homepage has consistent crawl and social metadata',()=>{
  assert.match(html,/<title>RemoNook \| Nested Notes, Flashcards & Spaced Repetition<\/title>/);
  assert.match(html,/<meta name="description" content="[^"]*flashcards[^"]*">/i);
  assert.match(html,/<link rel="canonical" href="https:\/\/remonook.com\/">/);
  assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
  assert.match(html,/<meta property="og:image" content="https:\/\/remonook.com\/brand\/icon-512.png">/);
  assert.doesNotMatch(html,/name="robots" content="noindex/i);
});

test('structured data describes only the public website and app',()=>{
  const match=html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match,'static JSON-LD must be present in the initial HTML');
  const schema=JSON.parse(match[1]);
  assert.equal(schema['@context'],'https://schema.org');
  assert.deepEqual(schema['@graph'].map(item=>item['@type']),['Organization','WebSite','WebApplication']);
  assert.equal(schema['@graph'][1].url,'https://remonook.com/');
  assert.equal(schema['@graph'][2].applicationCategory,'ProductivityApplication');
});

test('sitemap lists only public canonical page and is advertised by robots',()=>{
  assert.match(robots,/Sitemap: https:\/\/remonook.com\/sitemap.xml/);
  assert.match(sitemap,/<loc>https:\/\/remonook.com\/<\/loc>/);
  assert.equal((sitemap.match(/<loc>/g)||[]).length,1);
  assert.doesNotMatch(sitemap,/staging|localhost|#app/i);
});

test('staging remains excluded even if static hosting ignores _headers',()=>{
  assert.match(stagingHeaders,/X-Robots-Tag: noindex, nofollow/);
  assert.match(stagingBuild,/noindex, nofollow/);
  assert.match(stagingBuild,/rmSync\('dist\/sitemap.xml'/);
  assert.match(stagingBuild,/writeFileSync\('dist\/robots.txt'/);
});

test('landing visibly explains RemoNook search topics',()=>{
  assert.match(landing,/Outline notes · Flashcards · Spaced repetition/);
  assert.match(landing,/Organize ideas in nested notes/);
});
