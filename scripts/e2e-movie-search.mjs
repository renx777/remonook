// MovieSearch v2 acceptance with a mocked TMDB: connect once, update a shelf, add a movie, match one note.
import {chromium} from '@playwright/test';import {build} from 'esbuild';import assert from 'node:assert/strict';
const url=process.env.MOVIE_TEST_URL||'http://127.0.0.1:5219';if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url))throw Error('Local guest testing only.');
const fixture=(await build({stdin:{contents:"import * as data from './src/data.ts';import {bullet} from './src/domain.mjs';globalThis.fixture={data,bullet};",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},logLevel:'silent'})).outputFiles[0].text;
const MOVIES={1:{id:1,title:'The Thing',release_date:'1982-06-25',poster_path:'/thing.jpg',popularity:30,runtime:109,vote_average:8.1,vote_count:10,genres:[{name:'Horror'}],credits:{crew:[{job:'Director',name:'John Carpenter'}]}},2:{id:2,title:'Alien',release_date:'1979-05-25',poster_path:'/alien.jpg',popularity:40,runtime:117,vote_average:8.2,vote_count:10,genres:[{name:'Horror'},{name:'Science Fiction'}],credits:{crew:[{job:'Director',name:'Ridley Scott'}]}},3:{id:3,title:'Dune',release_date:'2021-09-15',poster_path:'/dune.jpg',popularity:90,runtime:155,vote_average:7.8,vote_count:10,genres:[{name:'Science Fiction'}],credits:{crew:[{job:'Director',name:'Denis Villeneuve'}]}}};
const KEY='synthetic-test-key-0123456789';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const mobile of [false,true]){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://api.themoviedb.org/**',route=>{const u=new URL(route.request().url());assert.equal(u.searchParams.get('api_key'),KEY);
  if(u.pathname.endsWith('/configuration'))return route.fulfill({json:{images:{}}});
  if(u.pathname.includes('/search/movie')){const q=(u.searchParams.get('query')||'').toLowerCase();return route.fulfill({json:{results:Object.values(MOVIES).filter(m=>m.title.toLowerCase().includes(q))}});}
  const id=u.pathname.match(/\/movie\/(\d+)/)?.[1];return route.fulfill({json:MOVIES[id]});});
 await page.goto(url+'/#app');await page.locator('.outline-scroll').waitFor();await page.evaluate(fixture);
 await page.evaluate(async()=>{const {data,bullet}=globalThis.fixture;const d=data.withNodes(data.empty(),[bullet('shelf',{text:'Movies #MovieSearch'}),bullet('thing',{parentId:'shelf',text:'The Thing (1982)'}),bullet('alien',{parentId:'shelf',position:1,text:'Alien'})]);await data.save(await data.load(),d,'isolated movie fixture');});
 await page.reload();await page.locator('.outline-scroll').waitFor();
 // Connect once in Settings → Connections.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('remo-open-settings',{detail:'connections'})));
 await page.getByLabel('TMDB key',{exact:true}).fill(KEY);await page.getByRole('group',{name:'TMDB connection'}).getByRole('button',{name:'Connect',exact:true}).click();
 await page.getByRole('group',{name:'TMDB connection'}).getByText(/Connected · remembered on this device/).waitFor();
 // Move the key to all signed-in devices: it leaves this device's storage and rides with the account.
 await page.getByRole('group',{name:'TMDB key location'}).getByRole('button',{name:'All my devices'}).click();await page.getByRole('group',{name:'TMDB connection'}).getByText(/Connected · synced to your devices/).waitFor();
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes('remo-movie-key')&&localStorage.getItem(k)).length),0);await page.keyboard.press('Escape');
 // Update the shelf: both movies match exactly and get Traits.
 await page.locator('[data-node-id="shelf"] [aria-label="Zoom into bullet"]').click();
 await page.getByRole('button',{name:'Update from TMDB'}).click();await page.getByRole('button',{name:'Check 2 movies'}).click();
 await page.getByRole('button',{name:'Apply to 2 movies'}).click();await page.getByText(/Updated 2 movies/).waitFor();await page.keyboard.press('Escape');
 // Add a new movie from search.
 await page.getByRole('button',{name:'Add movie'}).click();await page.getByLabel('Search movies').fill('Dune');await page.getByRole('button',{name:'Add Dune 2021'}).click();await page.getByText('✓ Added').waitFor();await page.keyboard.press('Escape');
 // The key is remembered after a reload; a movie note offers Match.
 await page.reload();await page.locator('.outline-scroll').waitFor();
 await page.locator('[data-node-id="alien"] [aria-label="Zoom into bullet"]').first().click();await page.getByRole('button',{name:'Match on TMDB'}).waitFor();
 await page.evaluate(fixture);const doc=await page.evaluate(async()=>globalThis.fixture.data.load());const texts=doc.tables.bullets.map(n=>n.text);
 for(const t of ['Director: John Carpenter','Director: Ridley Scott','Runtime: 117 min','TMDB: https://www.themoviedb.org/movie/2','Cover: https://image.tmdb.org/t/p/w500/alien.jpg','Dune','Director: Denis Villeneuve'])assert.ok(texts.includes(t),'missing '+t);
 assert.ok(!JSON.stringify(doc.tables).includes(KEY),'the key never enters notes');assert.equal(doc.web.providerKeys.tmdb.key,KEY,'synced setting holds the key');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow');assert.deepEqual(errors,[]);
 console.log(`MovieSearch v2 ${mobile?'phone':'desktop'}: connect + remember, shelf update with review, add from search, match entry, key kept out of notes passed`);await context.close();
}}finally{await browser.close();}
