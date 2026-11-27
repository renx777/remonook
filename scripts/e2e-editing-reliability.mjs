// Synthetic guest data only. Tests fast bullet switches and reports keydown-to-next-frame
// latency (an input-to-paint proxy, not a physical-device benchmark).
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
const results=[];
try {
 for(const mobile of [false,true])for(const count of [1000,10000]){
  const context=await browser.newContext(mobile?{viewport:{width:412,height:915},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:1000}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5197');
  await page.getByText('Try as a guest',{exact:true}).click();
  await page.locator('.app').waitFor();
  await page.evaluate(async count=>{
   const d=await import('/src/data.ts'),{bullet}=await import('/src/domain.mjs');
   const before=await d.load(),nodes=[bullet('editing-fixture',{text:'Editing fixture',collapsed:true})];
   for(let i=0;i<count;i++)nodes.push(bullet(`fixture-${i}`,{parentId:i%10===0?'editing-fixture':`fixture-${i-i%10}`,position:i%10===0?i/10:i%10-1,text:`Reference ${i} 日本語`,collapsed:true}));
   nodes.push(bullet('typing-fixture',{text:'Typing fixture',position:1}),bullet('typing-start',{parentId:'typing-fixture',text:'Start'}));
   await d.save(before,d.withNodes(before||d.empty(),nodes),'synthetic editing fixture');
  },count);
  await page.reload();
  await page.getByRole('button',{name:mobile?'Notes':/^Notes/,exact:mobile}).last().click();
  await page.locator('[data-node-id="typing-fixture"] [aria-label="Zoom into bullet"]').click();
  await page.locator('[data-node-id="typing-start"] .text-button').click();
  await page.keyboard.press('End');
  await page.evaluate(()=>{
   window.editingSamples=[];
   document.addEventListener('keydown',e=>{
    if(e.key.length!==1&&e.key!=='Enter')return;
    const started=performance.now();requestAnimationFrame(()=>window.editingSamples.push({key:e.key,ms:performance.now()-started}));
   },true);
  });
  const profiler=process.env.EDITING_PROFILE?await context.newCDPSession(page):null;
  if(profiler){await profiler.send('Profiler.enable');await profiler.send('Profiler.start');}
  const expected=['Start'];
  for(let i=0;i<30;i++){
   const text=`Line ${String(i).padStart(2,'0')} alpha`;
   expected.push(text);await page.keyboard.press('Enter');await page.keyboard.type(text,{delay:10});
  }
  if(profiler){const {profile}=await profiler.send('Profiler.stop');await writeFile(`/tmp/editing-${mobile?'phone':'desktop'}-${count}.cpuprofile`,JSON.stringify(profile));}
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const actual=await page.evaluate(async()=>{
   const d=await import('/src/data.ts');const doc=await d.load();
   return doc.tables.bullets.filter(n=>n.parentId==='typing-fixture').sort((a,b)=>a.position-b.position).map(n=>n.text);
  });
  assert.deepEqual(actual,expected,'Fast typing after Enter must preserve every character and bullet');
  // Re-enter from the keyboard, navigate twice and retain focus at each boundary.
  await page.locator('[data-node-id="typing-start"] .text-button').focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('.tiptap:focus').count(),1);
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.locator('[data-node-id="typing-start"] .tiptap:focus').count(),1);
  // A sidebar toggle should settle without a width/grid animation on every frame.
  if(!mobile){
   const toggle=page.getByRole('button',{name:'Collapse sidebar',exact:true}).first();
   if(await toggle.count()){
    await toggle.click();await page.waitForTimeout(220);
    await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
   }
  }
  const samples=await page.evaluate(()=>window.editingSamples);
  const percentile=items=>{const sorted=items.map(s=>s.ms).sort((a,b)=>a-b);return +sorted[Math.floor(sorted.length*.95)].toFixed(1);};
  const p95=percentile(samples.filter(s=>s.key!=='Enter')),enterP95=percentile(samples.filter(s=>s.key==='Enter'));

  assert.deepEqual(errors,[]);
  const result={viewport:mobile?'phone-emulation':'desktop',bullets:count,typedBullets:30,samples:samples.length,typingKeyToFrameP95Ms:p95,enterKeyToFrameP95Ms:enterP95,targetMs:mobile?100:50,withinTarget:p95<(mobile?100:50)};
  results.push(result);console.log(JSON.stringify(result));
  await page.reload();await page.locator('.app').waitFor();
  const reloaded=await page.evaluate(async()=>{const d=await import('/src/data.ts');return (await d.load()).tables.bullets.filter(n=>n.parentId==='typing-fixture').sort((a,b)=>a.position-b.position).map(n=>n.text);});
  assert.deepEqual(reloaded,expected,'Every typed character must survive reload');
  await context.close();
 }
 if(process.env.EDITING_REPORT)await writeFile(process.env.EDITING_REPORT,JSON.stringify({metric:'keydown to next animation frame; not physical input-to-paint',results},null,2));
 if(process.env.EDITING_STRICT)assert.ok(results.every(r=>r.withinTarget),'Reference latency target exceeded: '+JSON.stringify(results));
}finally{await browser.close();}
