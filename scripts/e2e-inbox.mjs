// Guest-only UI acceptance test; safe on local or web staging. No signed-in data is used.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const url=process.env.INBOX_URL||'http://127.0.0.1:5198';
if(!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(url)&&url!=='https://staging.remonook.com')throw Error('Only local or staging guest tests are supported.');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({...process.env.INBOX_TEST_IGNORE_TLS?{ignoreHTTPSErrors:true}:{},viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,colorScheme:mobile?'dark':'light'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.getByText('Try as a guest',{exact:true}).click();
  if(mobile)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await page.locator('.sidebar-nav').filter({visible:true}).getByRole('button',{name:/^Inbox/}).click();
  await page.getByRole('heading',{name:'Room for your next thought.'}).waitFor();
  await page.getByRole('button',{name:'New capture',exact:true}).click();await page.locator('.tiptap:focus').waitFor();
  await page.keyboard.type('Plan weekly review',{delay:15});await page.keyboard.press('Enter');await page.keyboard.press('Tab');await page.keyboard.type('Keep this context',{delay:15});await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Process Inbox',exact:true}).click();
  const item=page.locator('.inbox-item').filter({hasText:'Plan weekly review'});
  await item.getByText('1 child note',{exact:true}).waitFor();
  await context.setOffline(true);
  await item.getByRole('button',{name:'Link',exact:true}).click();
  await page.getByRole('radio',{name:/^Ideas/}).check();await page.getByRole('button',{name:'Add link',exact:true}).click();
  await item.getByText('2 child notes',{exact:true}).waitFor();
  await item.getByRole('button',{name:'Make task',exact:true}).click();await item.getByRole('button',{name:'Task added',exact:true}).waitFor();
  await page.getByRole('button',{name:'Undo Inbox action'}).click();await item.getByRole('button',{name:'Make task',exact:true}).waitFor();
  await item.getByRole('button',{name:'Schedule',exact:true}).click();await page.getByLabel('Capture reminder date').fill('2027-01-15');await page.getByLabel('Capture reminder time').fill('09:30');await page.getByRole('button',{name:'Save reminder',exact:true}).click();await item.getByRole('button',{name:'Reschedule',exact:true}).waitFor();
  await page.getByRole('button',{name:'Undo Inbox action'}).click();await item.getByRole('button',{name:'Schedule',exact:true}).waitFor();
  await page.getByRole('button',{name:'Redo Inbox action'}).click();await item.getByRole('button',{name:'Reschedule',exact:true}).waitFor();
  const file=item.getByRole('button',{name:'File',exact:true});await file.click();await page.getByLabel('Find destination note').press('Escape');
  assert.equal(await file.evaluate(el=>el===document.activeElement),true,'Escape returns focus to the action');
  await file.click();await page.getByRole('radio',{name:/^Ideas/}).check();await page.getByRole('button',{name:'File note',exact:true}).click();
  await page.getByRole('heading',{name:'Room for your next thought.'}).waitFor();
  await page.getByRole('button',{name:'Undo Inbox action'}).click();await item.getByText('2 child notes',{exact:true}).waitFor();
  await item.getByRole('button',{name:/^Move capture to Trash/}).click();await page.getByRole('heading',{name:'Room for your next thought.'}).waitFor();
  await page.getByRole('button',{name:'Undo Inbox action'}).click();await item.getByText('2 child notes',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No page overflow');
  await context.setOffline(false);await page.waitForTimeout(700);
  if(process.env.INBOX_SCREENSHOTS)await page.screenshot({path:`${process.env.INBOX_SCREENSHOTS}-${mobile?'phone':'desktop'}.png`,fullPage:true});
  await page.reload();await page.locator('.app').waitFor();
  if(mobile)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await page.locator('.sidebar-nav').filter({visible:true}).getByRole('button',{name:/^Inbox/}).click();
  const reloaded=page.locator('.inbox-item').filter({hasText:'Plan weekly review'});await reloaded.getByText('2 child notes',{exact:true}).waitFor();await reloaded.getByRole('button',{name:'Reschedule',exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log(`Inbox ${mobile?'phone dark':'desktop light'}: offline processing, file/link/task/reminder, undo/redo, trash recovery, focus and reload passed`);
  await context.close();
 }
}finally{await browser.close();}
