// Collection toolbar acceptance: in-list search, sort by created/edited, layout and movie actions in one bar.
import {chromium} from '@playwright/test';import {build} from 'esbuild';import assert from 'node:assert/strict';
const url=process.env.COLLECTION_TEST_URL||'http://127.0.0.1:5219';if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url))throw Error('Local guest testing only.');
const fixture=(await build({stdin:{contents:"import * as data from './src/data.ts';import {bullet} from './src/domain.mjs';globalThis.fixture={data,bullet};",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},logLevel:'silent'})).outputFiles[0].text;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const mobile of [false,true]){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,colorScheme:mobile?'dark':'light'});const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/#app');await page.locator('.outline-scroll').waitFor();await page.evaluate(fixture);
 await page.evaluate(async()=>{const {data,bullet}=globalThis.fixture;const rows=[];const movies=[['alien','Alien','Ridley Scott',300,1000],['brazil','Brazil','Terry Gilliam',100,900],['clue','Clue','Jonathan Lynn',200,200]];
  rows.push(bullet('shelf',{text:'Movies #views #MovieSearch'}));movies.forEach(([id,title,dir],i)=>{rows.push(bullet(id,{parentId:'shelf',position:i,text:title}),{...bullet('t'+id,{parentId:id,text:'Traits'}),traitsBlock:true},bullet('d'+id,{parentId:'t'+id,text:'Director: '+dir}));});
  let d=data.withNodes(data.empty(),rows);const times={};movies.forEach(([id,,,c,u])=>{times[id]={createdAt:c,updatedAt:c};times['d'+id]={createdAt:c,updatedAt:u};});d={...d,web:{...d.web,noteTimes:{...d.web.noteTimes,...times},bulletViews:{shelf:'list'}}};
  await data.save(await data.load(),d,'isolated collection fixture');});
 await page.reload();await page.locator('.outline-scroll').waitFor();
 await page.locator('[data-node-id="shelf"] [aria-label="Zoom into bullet"]').click();
 const bar=page.locator('.collection-bar');await bar.waitFor();
 // Layout switch, movie actions and New all live in the one toolbar.
 for(const name of ['Compact list view','Add movie','Update from TMDB','New item','Configure','Filter','Sort'])await bar.getByRole('button',{name,exact:true}).waitFor();
 const titles=async()=>page.locator('.bullet-collection .collection-title').allInnerTexts();
 await page.getByLabel('Search this collection').fill('ridley');await page.waitForTimeout(150);assert.deepEqual(await titles(),['Alien']);
 await page.getByLabel('Search this collection').fill('zzz');await page.getByText(/Nothing matches/).waitFor();await page.getByRole('button',{name:'Clear search'}).click();assert.equal((await titles()).length,3);
 await bar.getByRole('button',{name:'Sort',exact:true}).click();await page.getByRole('radio',{name:'Last edited'}).click();
 await bar.getByRole('button',{name:'Sort',exact:true}).filter({hasText:'Last edited ↓'}).waitFor();assert.deepEqual(await titles(),['Alien','Brazil','Clue']);
 await page.getByRole('radio',{name:'Date created'}).click();await page.getByRole('button',{name:'Oldest first'}).click();await page.waitForTimeout(200);assert.deepEqual(await titles(),['Brazil','Clue','Alien']);
 // Move an item to Trash from the list, then Undo from the toast.
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Move Clue to Trash'}).click();await page.getByText('Moved “Clue” to Trash').waitFor();assert.ok(!(await titles()).includes('Clue'));
 await page.locator('.rn-toast').getByRole('button',{name:/^Undo/}).click();await page.waitForTimeout(300);assert.ok((await titles()).includes('Clue'),'Undo brings it back');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow');assert.deepEqual(errors,[]);
 console.log(`Collection toolbar ${mobile?'phone dark':'desktop light'}: one-row bar, in-list search, sort by edited/created with direction passed`);await context.close();
}}finally{await browser.close();}
