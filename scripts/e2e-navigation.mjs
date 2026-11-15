// Browser acceptance for navigation and Settings. No account or personal data required.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>{if(!e.message.startsWith('ResizeObserver'))errors.push(e.message);});
 await page.goto(process.env.NAVIGATION_URL||'http://127.0.0.1:5204');await page.getByText('Try as a guest',{exact:true}).click();
 await page.locator('.sidebar-nav').getByRole('button',{name:/^Calendar/}).click();
 await page.getByRole('button',{name:'Hide month and agenda',exact:true}).click();
 const desktopPreference=await page.evaluate(()=>localStorage.getItem('remo-calendar-aside'));assert.equal(desktopPreference,'hidden');
 assert.equal(await page.locator('.cal2-aside').isVisible(),false);
 await page.getByRole('button',{name:'Show month and agenda',exact:true}).click();assert.equal(await page.locator('.cal2-aside').isVisible(),true);
 await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
 const sidebarPreference=await page.evaluate(()=>localStorage.getItem('remo_sidebar_open'));
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('.cal2-aside').isVisible(),false,'mobile starts collapsed independently of desktop');
 const calendarPreference=await page.evaluate(()=>localStorage.getItem('remo-calendar-aside'));
 await page.getByRole('button',{name:'Show month and agenda',exact:true}).click();assert.equal(await page.locator('.cal2-aside').isVisible(),true);assert.equal(await page.evaluate(()=>localStorage.getItem('remo-calendar-aside')),calendarPreference);
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.keyboard.press('Escape');
 assert.equal(await page.locator('.mobile-sidebar-dialog').count(),0);assert.equal(await page.getByRole('button',{name:'Open navigation',exact:true}).evaluate(el=>el===document.activeElement),true);
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.locator('.mobile-sidebar-dialog .sidebar-nav').getByRole('button',{name:/^Notes/}).click();
 assert.equal(await page.locator('.mobile-sidebar-dialog').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('remo_sidebar_open')),sidebarPreference);
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.locator('.mobile-sidebar-dialog').getByRole('button',{name:'Settings',exact:true}).click();
 for(const label of ['Appearance','Account and sync','Study','Storage','Backups','AI apps','Connections','Keyboard shortcuts','About']){
  await page.locator('.settings-navigation').getByRole('button',{name:label,exact:true}).click();assert.equal(await page.locator('.settings-content').isVisible(),true);
  assert.equal(await page.locator('.settings-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'no Settings horizontal overflow: '+label);
  await page.getByRole('button',{name:'All settings',exact:true}).click();
 }
 await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:960});
 assert.equal(await page.locator('.sidebar').getAttribute('aria-hidden'),'true');
 assert.deepEqual(errors,[]);console.log('Passed: responsive calendar, separate preferences, mobile drawer, Escape/focus, navigation, and all Settings panels.');await context.close();
}finally{await browser.close();}
