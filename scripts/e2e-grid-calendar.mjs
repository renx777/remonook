// Isolated guest checks. No signed-in account or existing notes are modified.
import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
const url=process.env.UI_FIX_URL||'http://127.0.0.1:5199';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)&&url!=='https://staging.remonook.com')throw Error('Local or staging only.');
const fixture=(await build({stdin:{contents:"import * as data from './src/data.ts';import {bullet} from './src/domain.mjs';import {builtinEmojis} from './src/emoji-builtins.mjs';globalThis.fixture={data,bullet,builtinEmojis};",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},logLevel:'silent'})).outputFiles[0].text;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
try{for(const mobile of [false,true]){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,colorScheme:mobile?'dark':'light'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/#app');await page.locator('.outline-scroll').waitFor();await page.evaluate(fixture);
 await page.evaluate(async()=>{const {data,bullet,builtinEmojis}=globalThis.fixture;const d=data.withNodes(data.empty(),[bullet('shelf',{text:'Movies #views'}),bullet('movie',{parentId:'shelf',text:'A movie '+builtinEmojis[0].token})]);d.tables.emojis=[builtinEmojis[0]];d.web.bulletViews={shelf:'grid'};await data.save(await data.load(),d,'isolated UI fixture');});await page.reload();
 await page.locator('[data-node-id="shelf"] [aria-label="Zoom into bullet"]').click();
 const title=page.locator('.poster-title,.collection-card .collection-title');await title.waitFor();assert.equal(await title.locator('.animated-emoji').count(),1,'Grid title renders emoji artwork');assert.ok(!(await title.innerText()).includes(':remo_'),'No raw emoji code');assert.equal(await page.getByRole('button',{name:'Change where results come from',exact:true}).count(),0,'Default children label removed');
 for(const name of ['Compact list view','Table view','Grid view']){await page.getByRole('button',{name,exact:true}).click();await page.locator('.poster-title .animated-emoji,.collection-title .animated-emoji').first().waitFor();}
 if(!mobile)await page.locator('.sidebar-nav').getByRole('button',{name:'Calendar',exact:true}).click();else await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('button',{name:'Calendar',exact:true}).click();
 const aside=page.locator('.cal2-aside');
 if(mobile){assert.equal(await aside.isVisible(),false);await page.getByRole('button',{name:'Show month and agenda',exact:true}).click();}
 await page.getByRole('button',{name:'Collapse calendar panel',exact:true}).click();assert.equal(await aside.isVisible(),false,'Panel collapses');
 if(!mobile){await page.reload();await page.locator('.sidebar-nav').getByRole('button',{name:'Calendar',exact:true}).click();await page.locator('.calendar-view').waitFor();assert.equal(await aside.isVisible(),false,'Desktop preference survives reload');}
 const toggle=page.getByRole('button',{name:'Show month and agenda',exact:true});await toggle.focus();await page.keyboard.press('Enter');assert.equal(await aside.isVisible(),true,'Panel reopens by keyboard');assert.equal(await page.getByRole('button',{name:'Hide month and agenda',exact:true}).getAttribute('aria-expanded'),'true');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');assert.deepEqual(errors,[]);
 if(process.env.UI_FIX_SCREENSHOTS)await page.screenshot({path:process.env.UI_FIX_SCREENSHOTS+(mobile?'-phone.png':'-desktop.png')});
 console.log(`Grid and calendar ${mobile?'phone dark':'desktop light'}: emoji titles in grid/list/table, clean count, collapse/reopen, keyboard and persisted desktop preference passed`);await context.close();
}}finally{await browser.close();}
