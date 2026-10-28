import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {brandGraph,publicPaths,renderPublicPage,productDescription,guides} from '../src/public-site.mjs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const robots=readFileSync(new URL('../public/robots.txt',import.meta.url),'utf8');
const sitemap=readFileSync(new URL('../public/sitemap.xml',import.meta.url),'utf8');
const stagingBuild=readFileSync(new URL('../scripts/build-environment.mjs',import.meta.url),'utf8');
const stagingHeaders=readFileSync(new URL('../cloud/staging-headers',import.meta.url),'utf8');
const landing=readFileSync(new URL('../src/Landing.tsx',import.meta.url),'utf8');

test('public homepage has consistent crawl and social metadata',()=>{
  assert.match(html,/<title>RemoNook \| Nested Notes, Flashcards & Spaced Repetition<\/title>/);
  assert.match(html,/<meta name="description" content="[^"]*flashcards?[^"]*">/i);
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
  assert.deepEqual(schema['@graph'].map(item=>item['@type']),['Organization','WebSite','SoftwareApplication']);
  assert.equal(schema['@graph'][1].url,'https://remonook.com/');
  assert.equal(schema['@graph'][2].applicationCategory,'EducationalApplication');
  assert.deepEqual(schema['@graph'],brandGraph());
});

test('sitemap lists public canonical pages and is advertised by robots',()=>{
  assert.match(robots,/Sitemap: https:\/\/remonook.com\/sitemap.xml/);
  assert.match(sitemap,/<loc>https:\/\/remonook.com\/<\/loc>/);
  assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>new URL(m[1]).pathname),publicPaths);
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
  assert.match(landing,/productDescription/);
  assert.match(productDescription,/independent, outline-first/);
});

test('Google-facing favicon uses stable, crawlable square elephant PNG assets',()=>{
  assert.match(html, /rel="icon" type="image\/png" sizes="192x192" href="\/brand\/icon-192.png"/);
  assert.match(html, /rel="icon" type="image\/png" sizes="48x48" href="\/brand\/favicon-48.png"/);
  assert.doesNotMatch(html, /rel="icon"[^>]*href="[^"]*\?v=/);
  for (const [path,dimension] of [['icon-192.png',192],['favicon-48.png',48]]) {
    const url=new URL('../public/brand/'+path,import.meta.url);
    assert.ok(existsSync(url), 'Missing branded favicon: '+path);
    const png=readFileSync(url);
    assert.equal(png.subarray(1,4).toString('ascii'),'PNG');
    assert.equal(png.readUInt32BE(16),dimension);
    assert.equal(png.readUInt32BE(20),dimension);
  }
  assert.match(robots,/User-agent: \*/);
  assert.match(robots,/Allow: \//);
});


test('built homepage includes visible identity, guides, and FAQ without JavaScript',()=>{
  const dom=new JSDOM(readFileSync('dist/index.html','utf8')),document=dom.window.document;
  assert.match(document.querySelector('.landing-description').textContent,/RemoNook is an independent, outline-first/);
  assert.equal(document.querySelector('#landing-identity-title').textContent,'What is RemoNook?');
  assert.match(document.querySelector('.landing-faq').textContent,/not affiliated with RemNote/);
  assert.ok(document.querySelector('.landing a[href="/about"]'));
  assert.ok(document.querySelector('.landing a[href="/guides/mcqs"]'));
  assert.equal(document.querySelectorAll('h1').length,1);
  dom.window.close();
});

test('all public pages are statically built with unique canonicals, consistent identity, valid links, and structured data',()=>{
  const docs=new Map();
  for(const path of publicPaths){
    const file=path==='/'?'dist/index.html':'dist'+path+'.html';
    const dom=new JSDOM(readFileSync(file,'utf8'));docs.set(path,dom);
  }
  try{
    const titles=new Set();
    for(const [path,dom] of docs){
      const document=dom.window.document;
      assert.equal(document.querySelector('meta[name="robots"]')?.content,docs.get('/').window.document.querySelector('meta[name="robots"]')?.content,'consistent environment indexing '+path);
      assert.equal(document.querySelectorAll('h1').length,1,path);
      const title=document.title;assert.ok(title);assert.ok(!titles.has(title),'unique title '+path);titles.add(title);
      assert.equal(document.querySelectorAll('link[rel="canonical"]').length,1,path);
      assert.equal(document.querySelector('link[rel="canonical"]').getAttribute('href'),'https://remonook.com'+path,path);
      const graph=JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'];
      assert.deepEqual(graph.slice(0,3),brandGraph(),path);
      assert.ok(document.querySelector('meta[name="description"]').content.length>30,path);
      for(const link of document.querySelectorAll('a[href]')){
        const url=new URL(link.getAttribute('href'),'https://remonook.com'+path);
        if(url.origin!=='https://remonook.com')continue;
        assert.ok(docs.has(url.pathname),'unknown public link '+url.href);
        if(url.hash&&url.hash!=='#app'&&url.hash!=='#home')assert.ok(docs.get(url.pathname).window.document.getElementById(url.hash.slice(1)),'missing fragment '+url.href);
      }
      if(path!=='/')assert.equal(document.querySelectorAll('script[src]').length,0,'guides work without the app runtime');
    }
  }finally{for(const dom of docs.values())dom.window.close();}
});

test('staging excludes every generated public page, not just the homepage',()=>{
  for(const path of publicPaths.filter(p=>p!=='/')){
    const dom=new JSDOM(renderPublicPage(path,{noindex:true}));
    assert.equal(dom.window.document.querySelector('meta[name="robots"]').content,'noindex, nofollow');dom.window.close();
    assert.doesNotMatch(renderPublicPage(path),/name="robots" content="noindex/);
  }
});

test('public guides and stylesheet ship in the offline cache with page-aware navigation',()=>{
  const sw=readFileSync('dist/sw.js','utf8');
  for(const path of publicPaths.filter(p=>p!=='/'))assert.ok(sw.includes(JSON.stringify(path+'.html')),path);
  assert.ok(sw.includes('/learn.css'));
  assert.match(sw,/c.match\(path\+'\.html'\)/);
  for(const guide of guides)assert.ok(guide.sections.length>=3,guide.slug);
});
