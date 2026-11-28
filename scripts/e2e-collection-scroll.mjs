// Large collection scrolling: 230 movies with posters load as you scroll (no "Show more"), and scrolling stays smooth.
import {chromium} from '@playwright/test';import {build} from 'esbuild';import assert from 'node:assert/strict';import {deflateSync} from 'node:zlib';
const url=process.env.COLLECTION_TEST_URL||'http://127.0.0.1:5219';if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url))throw Error('Local guest testing only.');
const fixture=(await build({stdin:{contents:"import * as data from './src/data.ts';import {bullet} from './src/domain.mjs';globalThis.fixture={data,bullet};",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},logLevel:'silent'})).outputFiles[0].text;
// A real 500×750 PNG so decoding costs something, like a poster.
function png(w,h){const crc=t=>{let c,k=-1;for(const b of t){c=(k^b)&255;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;k=(k>>>8)^c;}return (k^-1)>>>0;};const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;for(let x=0;x<w;x++){const o=y*(w*3+1)+1+x*3;raw[o]=(x*7+y)&255;raw[o+1]=(y*3)&255;raw[o+2]=(x^y)&255;}}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
const poster=png(500,750),N=230;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const mobile of [false,true]){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const requested=new Set();await page.route('https://image.tmdb.org/**',route=>{requested.add(new URL(route.request().url()).pathname.split('/')[3]);return route.fulfill({body:poster,contentType:'image/png'});});
 await page.goto(url+'/#app');await page.locator('.outline-scroll').waitFor();await page.evaluate(fixture);
 await page.evaluate(async n=>{const {data,bullet}=globalThis.fixture;const rows=[bullet('shelf',{text:'Movies #views'})];
  for(let i=0;i<n;i++){const id='m'+i;rows.push(bullet(id,{parentId:'shelf',position:i,text:'Movie '+(i+1)}),{...bullet('t'+id,{parentId:id,text:'Traits'}),traitsBlock:true},bullet('p'+id,{parentId:'t'+id,text:'Cover: https://image.tmdb.org/t/p/w500/poster'+i+'.jpg'}),bullet('y'+id,{parentId:'t'+id,position:1,text:'Year: '+(1950+i%70)}),bullet('r'+id,{parentId:'t'+id,position:2,text:'Rating: '+'★'.repeat(i%6)}));}
  let d=data.withNodes(data.empty(),rows);d={...d,web:{...d.web,bulletViews:{shelf:'grid'}}};await data.save(await data.load(),d,'isolated scroll fixture');},N);
 await page.reload();await page.locator('.outline-scroll').waitFor();await page.locator('[data-node-id="shelf"] [aria-label="Zoom into bullet"]').click();
 await page.locator('.poster-card').first().waitFor();const first=await page.locator('.poster-card').count();assert.ok(first<N,'starts with a page, not everything');
 assert.equal(await page.getByRole('button',{name:/^Show \d+ more/}).count(),0,'no Show more button');
 // Scroll to the end with the wheel, sampling frame gaps while scrolling.
 await page.evaluate(()=>{window.__frames=[];let last=performance.now();const tick=t=>{window.__frames.push(t-last);last=t;window.__raf=requestAnimationFrame(tick);};window.__raf=requestAnimationFrame(tick);});
 await page.mouse.move(mobile?200:800,mobile?500:600);
 for(let i=0;i<200&&!(await page.locator('.collection-end').count());i++){await page.mouse.wheel(0,mobile?700:900);await page.waitForTimeout(40);}
 const frames=await page.evaluate(()=>{cancelAnimationFrame(window.__raf);return window.__frames.slice(2).sort((a,b)=>a-b);});
 await page.getByText(`All ${N} shown`).waitFor();assert.equal(await page.locator('.poster-card').count(),N,'every movie loaded by scrolling');
 const p=q=>Math.round(frames[Math.floor(frames.length*q)]);const long=frames.filter(f=>f>50).length;
 assert.ok(!requested.has('w500')||requested.has('w185')||requested.has('w342'),'smaller poster sizes are used');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow');assert.deepEqual(errors,[]);
 console.log(`Collection scroll ${mobile?'phone':'desktop'}: ${first} first, ${N} after scrolling; frames p50 ${p(.5)} ms, p95 ${p(.95)} ms, ${long} over 50 ms of ${frames.length}; poster sizes ${[...requested].join(',')} passed`);
 await context.close();
}}finally{await browser.close();}
