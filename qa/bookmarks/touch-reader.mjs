const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'@playwright/test');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.REMONOOK_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,colorScheme:'dark',serviceWorkers:'block',permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4193/#app');
 await page.getByRole('button',{name:'Commands & notes',exact:true}).waitFor();
 await page.keyboard.press('Control+k');await page.getByRole('combobox').fill('Open Bookmarks');await page.keyboard.press('Enter');
 await page.getByRole('button',{name:'Add bookmark',exact:true}).click();
 await page.getByRole('textbox',{name:'Webpage URL'}).fill('https://fixture.example/touch-'+crypto.randomUUID());await page.getByRole('button',{name:'Save webpage',exact:true}).click();
 await page.locator('.reader-touch-selection').waitFor();
 const p=page.locator('article p:not(.web-byline)').first();
 const point=await p.evaluate(el=>{const r=document.createRange();r.setStart(el.firstChild,2);r.setEnd(el.firstChild,8);const b=r.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};});
 const cdp=await context.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await page.waitForTimeout(480);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const tools=page.getByRole('dialog',{name:'Selected passage'});await tools.waitFor();
 assert.ok(await page.evaluate(()=>CSS.highlights.get('reader-selection')?.size===1&&getSelection().isCollapsed),'touch selection avoids native Selection');
 assert.equal(await page.locator('.reader-selection-handle').count(),2);
 await page.setViewportSize({width:320,height:844});const toolBox=await tools.boundingBox();assert.ok(toolBox.x>=0&&toolBox.x+toolBox.width<=320,'toolbar fits narrow mobile viewport');await page.setViewportSize({width:390,height:844});await tools.getByRole('button',{name:'Copy selected text'}).click();const first=await page.evaluate(()=>navigator.clipboard.readText());assert.match(first,/reliable/);
 const end=page.getByRole('button',{name:'Adjust selection end'}),box=await end.boundingBox();await page.mouse.move(box.x+15,box.y+10);await page.mouse.down();await page.mouse.move(box.x+65,box.y+10,{steps:5});await page.mouse.up();
 await tools.getByRole('button',{name:'Copy selected text'}).click();assert.ok((await page.evaluate(()=>navigator.clipboard.readText())).length>first.length,'custom end handle expands selection');
 await context.route('https://www.google.com/search?**',route=>route.fulfill({body:'Search fixture'}));const popup=context.waitForEvent('page');await tools.getByRole('button',{name:'Search web for selected text'}).click();const search=await popup;await search.waitForLoadState();assert.ok(new URL(search.url()).searchParams.get('q').length);await search.close();
 await tools.getByRole('button',{name:'Select all article text'}).click();await tools.getByRole('button',{name:'Copy selected text'}).click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/A reliable reader\n/);assert.ok(await page.evaluate(()=>getSelection().isCollapsed));
 await tools.getByRole('button',{name:'Dismiss selection tools'}).click();
 // A short swipe remains scrolling, rather than becoming a selection gesture.
 const scroll=page.locator('.web-article-scroll');const before=await scroll.evaluate(el=>el.scrollTop);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:200,y:600}]});for(let y=580;y>=350;y-=20){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:200,y}]});await page.waitForTimeout(20);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(350);assert.ok(await scroll.evaluate(el=>el.scrollTop)>before,JSON.stringify(await scroll.evaluate(el=>({scroll:el.scrollTop,height:el.clientHeight,total:el.scrollHeight,overflow:getComputedStyle(el).overflow,touch:getComputedStyle(el).touchAction}))));assert.equal(await tools.count(),0);
 await scroll.evaluate(el=>el.scrollTop=0);
 await p.evaluate(el=>{const r=document.createRange();r.setStart(el.firstChild,0);r.setEnd(el.firstChild,71);const s=getSelection();s.removeAllRanges();s.addRange(r);el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
 await tools.getByRole('button',{name:'Choose highlight colour'}).click();await page.getByRole('button',{name:'Highlight green',exact:true}).waitFor();await page.keyboard.press('Escape');assert.ok(await tools.isVisible(),'Escape closes the colour palette before its parent toolbar');await tools.getByRole('button',{name:'Choose highlight colour'}).click();await page.getByRole('button',{name:'Highlight green',exact:true}).click();
 await page.locator('.web-reader-toolbar').getByRole('button',{name:'Notes',exact:true}).click();
 await page.getByRole('button',{name:/Note actions:/}).click();const menu=page.getByRole('menu');await menu.waitFor();const bounds=await menu.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=391);
 await page.keyboard.press('Escape');await page.getByRole('heading',{name:/^Article notes/}).waitFor();assert.equal(await menu.count(),0,'Escape closes nested menu without closing notes');
 await page.getByRole('button',{name:/Note actions:/}).click();await page.getByRole('menuitem',{name:/Remove highlight/}).click();assert.equal(await page.locator('.article-note-card').count(),1,'removing formatting preserves saved note');assert.equal(await page.locator('.article-note-source').count(),0);
 await page.screenshot({path:'/tmp/article-notes-compact-mobile.png'});
 await page.getByRole('button',{name:/Note actions:/}).click();await page.getByRole('menuitem',{name:/Open in Notes/}).click();await page.locator('.web-reader').waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);console.log('Touch long press, handles, copy, select all, web search, scrolling, colour palette and nested note actions passed');await context.close();
} finally {await browser.close();}
