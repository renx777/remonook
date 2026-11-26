// Isolated guest acceptance; never operates on a signed-in workspace.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const url=process.env.TASKS_URL||'http://127.0.0.1:5199';
if(!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(url)&&url!=='https://staging.remonook.com')throw Error('Only local or staging guest tests are supported.');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({...process.env.TASKS_TEST_IGNORE_TLS?{ignoreHTTPSErrors:true}:{},viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,colorScheme:mobile?'dark':'light'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  const go=async name=>{
   if(mobile){const nav=page.getByRole('navigation',{name:'Mobile navigation'});await nav.locator('button').last().click();await page.getByRole('menu',{name:'More views'}).getByRole('menuitem',{name,exact:true}).click();}
   else await page.locator('.sidebar-nav').getByRole('button',{name,exact:true}).click();
  };
  const view=async name=>{await page.getByRole('navigation',{name:'Task views'}).getByRole('button',{name:new RegExp('^'+name+'\\b')}).click();};
  await page.goto(url);await page.getByText('Try as a guest',{exact:true}).click();await go('Tasks');
  await page.getByRole('heading',{name:'A clear day.',exact:true}).waitFor();
  await page.getByRole('button',{name:'New task',exact:true}).click();await page.locator('.tiptap:focus').waitFor();
  await page.keyboard.type('Review the learning plan',{delay:20});await page.keyboard.press('Escape');await go('Tasks');await view('Inbox');
  const row=page.locator('.task-row').filter({hasText:'Review the learning plan'});await row.waitFor();
  await context.setOffline(true);await row.getByRole('button',{name:'Plan',exact:true}).click();
  const today=await page.evaluate(()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');});
  await page.getByLabel('Task scheduled date',{exact:true}).fill(today);await page.getByLabel('Task deadline',{exact:true}).fill('2029-12-31');await page.getByLabel('Task priority',{exact:true}).selectOption('3');await page.getByLabel('Task estimated minutes',{exact:true}).fill('25');await page.getByRole('button',{name:'Save task details',exact:true}).click();
  await view('Today');await row.getByText('25 min',{exact:true}).waitFor();await row.getByText('Due 2029-12-31',{exact:true}).waitFor();
  await page.getByLabel('Undo task action',{exact:true}).click();await row.waitFor({state:'detached'});await page.getByLabel('Redo task action',{exact:true}).click();await row.getByText('25 min',{exact:true}).waitFor();
  await row.getByRole('button',{name:'Plan',exact:true}).click();await page.getByLabel('Task planning status',{exact:true}).selectOption('SOMEDAY');await page.getByRole('button',{name:'Save task details',exact:true}).click();await view('Someday');await row.waitFor();
  await row.getByRole('button',{name:'Plan',exact:true}).click();await page.getByLabel('Task planning status',{exact:true}).selectOption('WAITING');await page.getByRole('button',{name:'Save task details',exact:true}).click();await view('Waiting');await row.waitFor();
  await row.getByRole('button',{name:'Plan',exact:true}).click();await page.getByLabel('Task planning status',{exact:true}).selectOption('ACTIVE');await page.getByRole('button',{name:'Save task details',exact:true}).click();await view('Today');await row.waitFor();
  await page.getByLabel('Search tasks',{exact:true}).fill('does not exist');await page.getByRole('heading',{name:'No matching tasks.',exact:true}).waitFor();await page.getByLabel('Search tasks',{exact:true}).fill('learning');await row.waitFor();await page.getByLabel('Search tasks',{exact:true}).fill('');
  await page.getByLabel('Filter tasks by project',{exact:true}).selectOption({label:'Inbox'});await row.waitFor();await page.getByLabel('Filter tasks by project',{exact:true}).selectOption('');
  await row.getByRole('checkbox',{name:'Complete task Review the learning plan',exact:true}).click();await view('Completed');await row.waitFor();await row.getByRole('checkbox',{name:'Reopen task Review the learning plan',exact:true}).click();await view('Today');await row.waitFor();
  await context.setOffline(false);
  if(!mobile){await page.locator('.sidebar-nav').getByRole('button',{name:/^Calendar/}).click();await page.getByRole('region',{name:'Tasks for this day'}).getByRole('button',{name:/Review the learning plan/}).waitFor();await page.getByRole('checkbox',{name:'Complete calendar task Review the learning plan',exact:true}).click();await go('Tasks');await view('Completed');await row.waitFor();await row.getByRole('checkbox',{name:'Reopen task Review the learning plan',exact:true}).click();await view('Today');}
  await page.getByRole('group',{name:'Task source'}).getByRole('button',{name:'Google Tasks',exact:true}).click();await page.getByRole('region',{name:'Google Tasks connection'}).waitFor();await page.getByRole('group',{name:'Task source'}).getByRole('button',{name:'RemoNook',exact:true}).click();await row.waitFor();
  assert.ok(await page.locator('.task-views button').first().evaluate(el=>el.getBoundingClientRect().width<160),'Task tabs size to their labels, not full-width hidden pages');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No page overflow');
  if(process.env.TASKS_SCREENSHOTS)await page.screenshot({path:`${process.env.TASKS_SCREENSHOTS}-${mobile?'phone':'desktop'}.png`,fullPage:true});
  await context.setOffline(false);await page.waitForTimeout(800);await page.reload();await page.locator('.app').waitFor();await go('Tasks');
  await row.getByText('25 min',{exact:true}).waitFor();await row.getByText('Due 2029-12-31',{exact:true}).waitFor();assert.equal(await page.locator('.task-row').count(),1,'The same original task persists without copies');assert.deepEqual(errors,[]);
  console.log(`Tasks ${mobile?'phone dark':'desktop light'}: offline planning, deadlines, priority, filters, completion, undo/redo, Google opt-in and reload passed`);await context.close();
 }
}finally{await browser.close();}
