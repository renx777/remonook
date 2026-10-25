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




test('slash after text, inline links, backlinks, tags and editable mirrored branches work through the app',async()=>{
 const seed=withNodes(empty(),[bullet('source',{text:'Physics #imp'}),bullet('answer',{parentId:'source',text:'Original answer'}),bullet('ref',{text:'Reference',position:1}),bullet('place',{text:'Project',position:2}),bullet('slot',{parentId:'place',text:''})]);await save(null,seed);let app;
 const click=async selector=>act(async()=>{const el=document.querySelector(selector);assert.ok(el,selector);el.click();});
 const stored=async()=>{await act(async()=>new Promise(r=>setTimeout(r,250)));return load();};
 try{
 await act(async()=>{app=await import('./.build/app.mjs');});await wait(()=>document.querySelector('[data-node-id="ref"] .text-button'));
 await click('[data-node-id="ref"] .text-button');let editor=document.querySelector('.tiptap').editor;
 await act(async()=>{editor.commands.focus('end');editor.commands.insertContent(' /h2');});await wait(()=>document.querySelector('[aria-label="Bullet commands"]'));await key('Enter');
 assert.equal(editor.getText(),'Reference ');assert.equal((await stored()).tables.bullets.find(n=>n.id==='ref').blockStyle,'h2');
 await act(async()=>{editor.commands.focus('end');editor.commands.insertContent('[[Phys');});await wait(()=>document.querySelector('[aria-label="Link suggestions"]'));await key('Enter');assert.match(editor.getText(),/\[\[Physics #imp\|source\]\]/);
 await key('Escape');await click('[data-node-id="ref"] .note-reference');assert.equal(document.querySelector('.zoomed-title').value,'Physics #imp');assert.match(document.querySelector('.backlinks-panel').textContent,/1 backlink/);
 await click('[aria-label="Go to parent"]');await click('[data-node-id="source"] .note-tag');assert.equal(document.querySelector('.topbar-search input').value,'#imp');assert.ok(document.querySelector('[data-node-id="source"].is-important'));assert.equal(document.querySelector('[data-node-id="ref"]'),null,'A tag inside a link label is not a tag on its referring bullet');
 // Clear filtering by navigating home, then insert a mirror into an empty bullet.
 await click('.sidebar-home');await click('[data-node-id="slot"] .text-button');editor=document.querySelector('.tiptap').editor;
 await act(async()=>{editor.commands.focus();editor.commands.insertContent('((Phys');});await wait(()=>document.querySelector('[aria-label="Mirror suggestions"]'));await key('Enter');let state=await stored();assert.equal(state.tables.bullets.find(n=>n.id==='slot').mirrorSourceId,'source');
 const child=state.tables.bullets.find(n=>n.mirrorRootId==='slot'&&n.mirrorSourceId==='answer');await click(`[data-node-id="${child.id}"] .text-button`);editor=document.querySelector('.tiptap').editor;await act(async()=>{editor.commands.setContent('<p>Edited through mirror</p>');});state=await stored();assert.equal(state.tables.bullets.find(n=>n.id==='answer').text,'Edited through mirror');
 await act(async()=>editor.commands.focus('end'));await key('Enter');state=await stored();const created=state.tables.bullets.find(n=>n.parentId==='source'&&n.id!=='answer');assert.ok(created,'Enter creates a source child');assert.equal(document.querySelector('.tiptap').closest('[data-node-id]').dataset.nodeId,state.tables.bullets.find(n=>n.mirrorRootId==='slot'&&n.mirrorSourceId===created.id).id,'Focus remains in mirrored branch');
 await key('Escape');await click('[data-node-id="slot"] [aria-label="Bullet actions"]');const detach=[...document.querySelectorAll('button')].find(el=>el.textContent.includes('Detach mirror'));assert.ok(detach);await act(async()=>detach.click());state=await stored();assert.equal(state.tables.bullets.find(n=>n.id==='slot').mirrorSourceId,undefined);assert.ok(state.tables.bullets.some(n=>n.id==='source'));
 }finally{if(app)await act(async()=>app.appRoot.unmount());dom.window.close();}
});
