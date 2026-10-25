import {tableText} from '../src/table.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { act } from 'react';
import { empty, withNodes, save, load, getAssets } from './.build/data.mjs';
import { bullet } from '../src/domain.mjs';
import { configureMcq } from '../src/mcq.mjs';

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


test('table edge controls and fullscreen gallery navigation',async()=>{
 let doc=empty();doc.tables.bullets=[bullet('table',{text:tableText([['10','=A1*2']])}),bullet('linked',{position:1,text:'![](https://example.com/photo.png)'})];doc.tables.bullets.push(bullet('album',{position:2,text:'Album'}),bullet('album-child',{parentId:'album',text:'![](https://example.com/one.gif) ![](https://example.com/two.mp4)'}));doc.web.galleryNodes={album:true};await save(null,doc);let app;
 try{await act(async()=>{app=await import('./.build/app.mjs');});await wait(()=>document.querySelector('.note-table'));
 assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent==='Edit table'),false);
 await act(async()=>document.querySelector('[aria-label="column 2 options"]').click());assert.ok(document.querySelector('[aria-label="Delete column 2"]'));
 await act(async()=>document.querySelector('[aria-label="Add row"]').click());assert.equal(document.querySelectorAll('.note-table tbody tr').length,2);
 await act(async()=>document.querySelector('[aria-label="row 2 options"]').click());await act(async()=>document.querySelector('[aria-label="Delete row 2"]').click());assert.equal(document.querySelectorAll('.note-table tbody tr').length,1);
 await act(async()=>{const el=document.querySelector('[aria-label="Add row"]');for(const [type,y] of [['pointerdown',0],['pointermove',80],['pointerup',80]]){const event=new window.MouseEvent(type,{bubbles:true,cancelable:true,clientY:y});Object.defineProperty(event,'pointerId',{value:1});el.dispatchEvent(event);}el.click();});assert.equal(document.querySelectorAll('.note-table tbody tr').length,4);
 await act(async()=>document.querySelector('[aria-label^="Open gallery item 1"]').click());assert.ok(document.querySelector('.gallery-viewer[open]'));await act(async()=>document.querySelector('[aria-label="Next gallery item"]').click());assert.ok(document.querySelector('.gallery-viewer video'));await act(async()=>document.querySelector('.gallery-viewer [aria-label="Close image dialog"]').click());
 
 await act(async()=>document.querySelector('[aria-label="Edit cell B1"]').click());await wait(()=>document.querySelector('[aria-label="Cell B1"]'));
 assert.equal(document.activeElement.getAttribute('aria-label'),'Cell B1');
 assert.equal(document.querySelector('[aria-label="Cell B1"]').value,'=A1*2');
 await act(async()=>document.querySelector('[aria-label="Edit embedded image bullet"]').click());await wait(()=>document.querySelector('[data-node-id="linked"] .tiptap'));
 assert.match(document.querySelector('[data-node-id="linked"] .tiptap').textContent,/example.com/);
 }finally{await act(async()=>app?.appRoot.unmount());dom.window.close();}
});
