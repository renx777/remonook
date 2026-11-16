import assert from 'node:assert/strict';
import {act} from 'react';
export async function studyOutline(){
 for(let i=0;i<150&&!document.querySelector('.sidebar nav button');i++)await act(()=>new Promise(r=>setTimeout(r,20)));
 const button=[...document.querySelectorAll('.sidebar nav button')].find(b=>b.textContent.trim().startsWith('Study Desk'));
 assert.ok(button,'Study Desk navigation');await act(async()=>button.click());
 const toggle=document.querySelector('.outline-view-toggle');assert.ok(toggle,'Dedicated outline toggle');
 if(toggle.getAttribute('aria-pressed')!=='true')await act(async()=>toggle.click());
}
export async function studyLibrary(){
 for(let i=0;i<150&&!document.querySelector('.sidebar nav button');i++)await act(()=>new Promise(r=>setTimeout(r,20)));
 const button=[...document.querySelectorAll('.sidebar nav button')].find(b=>b.textContent.trim().startsWith('Study Desk'));assert.ok(button);await act(async()=>button.click());
}
