import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { act } from 'react';
import { empty, withNodes, save, load, getAssets } from './.build/data.mjs';
import { bullet } from '../src/domain.mjs';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Node', 'DOMParser', 'MutationObserver', 'getComputedStyle']) Object.defineProperty(globalThis, key, { value: key === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = undefined;
globalThis.IntersectionObserver=class{constructor(callback){this.callback=callback;}observe(target){this.callback([{isIntersecting:true,target}]);}disconnect(){}};
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window); globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
HTMLElement.prototype.scrollTo = function ({ top = 0 }) { this.scrollTop = top; };
dom.window.Range.prototype.getClientRects = () => [];
dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
const wait = async check => { for (let i = 0; i < 150; i++) { if (check()) return; await act(async () => new Promise(resolve => setTimeout(resolve, 20))); } throw Error('Timed out waiting for inline emoji UI'); };
const key = async value => act(async () => document.querySelector('.tiptap').dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })));



test('calendar reminders create recurring items, rotate top tabs, complete occurrences and edit/delete independently of notes',async()=>{
 await save(null,empty());let app;
 const click=async selector=>act(async()=>{const el=document.querySelector(selector);assert.ok(el,selector);el.click();});
 const textClick=async text=>act(async()=>{const el=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text);assert.ok(el,text);el.click();});
 const input=async(selector,value)=>act(async()=>{const el=document.querySelector(selector);Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));});
 const select=async(selector,value)=>act(async()=>{const el=document.querySelector(selector);el.value=value;el.dispatchEvent(new window.Event('change',{bubbles:true}));});
 const stored=async()=>{await act(async()=>new Promise(r=>setTimeout(r,250)));return load();};
 const submit=async()=>act(async()=>document.querySelector('.reminder-editor').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 try{
 await act(async()=>{app=await import('./.build/app.mjs');});await wait(()=>document.querySelector('.outline-row')||document.querySelector('.outline-scroll'));
 await click('[aria-label="Calendar reminders"]');await wait(()=>document.querySelector('.cal2-agenda'));
 await textClick('Add reminder');await input('[aria-label="Reminder title"]','Electricity bill');await select('[aria-label="Reminder category"]','bill');assert.equal(document.querySelector('[aria-label="Reminder repeat"]').value,'monthly');
 const date=document.querySelector('[aria-label="Reminder date"]').value;await submit();assert.match(document.querySelector('.reminder-current').textContent,/Electricity bill.*Today/);assert.ok(document.querySelector('.has-reminder'));
 await textClick('Add reminder');await input('[aria-label="Reminder title"]','Birthday');await submit();assert.ok(document.querySelector('[aria-label="Next reminder"]'));
 assert.equal(document.querySelector('.reminder-controls').open,false,'Navigation stays tucked away');await click('.reminder-controls summary');
 const before=document.querySelector('.reminder-current').textContent;await click('[aria-label="Next reminder"]');assert.notEqual(document.querySelector('.reminder-current').textContent,before);assert.equal(document.querySelector('.reminder-emoji [data-emoji-token]').getAttribute('data-emoji-token'),':noto_26a1:');assert.match(document.querySelector('.reminder-emoji img').getAttribute('src'),/^\/reminder-emojis\/noto_26a1\.svg$/,'Reduced motion uses a bundled static poster');
 await click('[aria-label="Pause reminder rotation"]');assert.ok(document.querySelector('[aria-label="Resume reminder rotation"]'));
 await click(`[aria-label="Complete Electricity bill on ${date}"]`);assert.doesNotMatch(document.querySelector('.reminder-current').textContent,/Electricity bill/);
 assert.ok(document.querySelector(`[aria-label="Reopen Electricity bill on ${date}"]`));let state=await stored();assert.equal(state.web.calendarEvents.find(e=>e.title==='Electricity bill').completed[0],date);
 const nodes=structuredClone(state.tables.bullets);await click('[aria-label="Edit Birthday"]');await input('[aria-label="Reminder title"]','Annual birthday');await submit();state=await stored();assert.ok(state.web.calendarEvents.some(e=>e.title==='Annual birthday'));
 await click('[aria-label="Edit Annual birthday"]');await textClick('Delete reminder');await textClick('Delete this reminder');state=await stored();assert.equal(state.web.calendarEvents.length,1);assert.deepEqual(state.tables.bullets,nodes);
 await textClick('All reminders (1)');assert.ok(document.querySelector('.cal2-row'));assert.ok(document.querySelector('[aria-label="Edit Electricity bill"]'));
 }finally{if(app)await act(async()=>app.appRoot.unmount());dom.window.close();}
});
