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
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window); globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
HTMLElement.prototype.scrollTo = function ({ top = 0 }) { this.scrollTop = top; };
dom.window.Range.prototype.getClientRects = () => [];
dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
const wait = async check => { for (let i = 0; i < 150; i++) { if (check()) return; await act(async () => new Promise(resolve => setTimeout(resolve, 20))); } throw Error('Timed out waiting for inline emoji UI'); };
const key = async value => act(async () => document.querySelector('.tiptap').dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })));


test('folder shelf supports creation, drag moves, accessible moves and both deletion choices',async()=>{
 let doc=empty();doc.tables.decks=[{rootId:'d',createdAt:1,pinned:0},{rootId:'second',createdAt:1,pinned:0}];
 doc=withNodes(doc,[bullet('d',{text:'ML'}),bullet('q',{parentId:'d',text:'Why?',kind:'QUESTION'}),bullet('a',{parentId:'q',text:'Because.'}),bullet('second',{text:'Quiz',position:1}),bullet('sq',{parentId:'second',text:'Second?',kind:'QUESTION'}),bullet('sa',{parentId:'sq',text:'Yes.'})]);await save(null,doc);let app;
 const click=async selector=>act(async()=>{const el=document.querySelector(selector);assert.ok(el,selector);el.click();});
 const textClick=async text=>act(async()=>{const el=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text);assert.ok(el,text);el.click();});
 const input=async(selector,value)=>act(async()=>{const el=document.querySelector(selector);Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));});
 const select=async(selector,value)=>act(async()=>{const el=document.querySelector(selector);el.value=value;el.dispatchEvent(new window.Event('change',{bubbles:true}));});
 const stored=async()=>{await act(async()=>new Promise(r=>setTimeout(r,250)));return load();};
 try{
 await act(async()=>{app=await import('./.build/app.mjs');});await wait(()=>document.querySelector('.outline-row'));await textClick('Study Desk');
 await textClick('New folder');await input('[aria-label="Folder name"]','Learning');await click('[aria-label="Teal folder"]');await input('[aria-label="Find a subject logo"]','phys');await click('[aria-label="Physics logo"]');
 await act(async()=>document.querySelector('.study-library-dialog form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.ok(document.querySelector('[aria-label="Open Learning folder"]'));
 const folder=(await stored()).web.studyFolders[0];assert.equal(folder.color,'teal');assert.equal(folder.logo,'physics');assert.ok(document.querySelector('.study-folder-art svg svg path'));
 // Exercise native drag handlers with the browser's DataTransfer contract.
 const data=new Map(),transfer={effectAllowed:'',dropEffect:'',setData:(k,v)=>data.set(k,v),getData:k=>data.get(k)||''};
 const drag=async(target,type)=>act(async()=>{const event=new window.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:transfer});target.dispatchEvent(event);});
 const deck=[...document.querySelectorAll('.study-deck')].find(el=>el.textContent.includes('ML'));
 await drag(deck,'dragstart');await drag(document.querySelector('.study-folder'),'dragover');assert.ok(document.querySelector('.study-folder.is-drop-target'));await drag(document.querySelector('.study-folder'),'drop');
 assert.equal((await stored()).web.deckFolders.d,folder.id);assert.equal(document.querySelector('[aria-label="Manage ML deck"]'),null);
 await click('[aria-label="Open Learning folder"]');assert.ok(document.querySelector('[aria-label="Manage ML deck"]'));assert.equal(document.querySelector('[aria-label="Manage Quiz deck"]'),null);
 await click('[aria-label="Manage ML deck"]');await select('[aria-label="Move deck to folder"]','');await textClick('Move deck');
 assert.match(document.querySelector('.study-folder-empty').textContent,/folder is ready/);
 await textClick('Back to all decks');await click('[aria-label="Manage ML deck"]');await textClick('Delete deck…');
 assert.equal(document.querySelector('input[name="delete-source"]').checked,true);await textClick('Delete deck, keep notes');
 let state=await stored();assert.equal(state.tables.decks.some(d=>d.rootId==='d'),false);assert.ok(state.tables.bullets.some(n=>n.id==='q'));assert.equal(state.tables.cards.find(c=>c.id==='q').state,'INACTIVE');
 await click('[aria-label="Manage Quiz deck"]');await textClick('Delete deck…');
 // Radios live in separate labels; choose the second explicitly.
 await act(async()=>document.querySelectorAll('input[name="delete-source"]')[1].click());
 await textClick('Delete deck & move notes to Trash');state=await stored();assert.equal(state.tables.bullets.some(n=>n.id==='second'),false);assert.equal(state.tables.trash.length,1);
 await act(async()=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim().startsWith('Trash')).click());await textClick('Restore');state=await stored();assert.ok(state.tables.bullets.some(n=>n.id==='second'));assert.ok(state.tables.decks.some(d=>d.rootId==='second'));
 }finally{if(app)await act(async()=>app.appRoot.unmount());dom.window.close();}
});
