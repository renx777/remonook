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


const click = async el => act(async () => { assert.ok(el, 'element exists'); el.click(); });
const $ = s => document.querySelector(s);

test('table format bar, row and column colours, table options and keyboard navigation',async()=>{
 let doc=empty();doc.tables.bullets=[bullet('table',{text:tableText([['Item','Cost'],['Tea','2']])})];await save(null,doc);let app;
 try{await act(async()=>{app=await import('./.build/app.mjs');});await wait(()=>$('.note-table'));
  assert.equal($('.nt-floating'),null,'no toolbar at rest');
  await click($('[aria-label="Edit cell A2"]'));await wait(()=>$('[aria-label="Cell A2"]'));
  await act(async()=>$('[aria-label="Cell A2"]').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  await wait(()=>$('[role="toolbar"][aria-label="Format cell"]'));
  await click($('[aria-label="Background colour"]'));await click($('[aria-label="Background colour: green"]'));
  await wait(()=>$('[data-td="1:0"][data-bg="green"]'));
  await click($('[aria-label="Bold"]'));await wait(()=>$('[data-td="1:0"].is-bold'));
  await click($('[aria-label="column 2 options"]'));await wait(()=>$('[role="menu"]'));
  await click($('[aria-label="Column colour: blue"]'));await wait(()=>$('[data-td="0:1"][data-bg="blue"]')&&$('[data-td="1:1"][data-bg="blue"]'));
  await click($('[aria-label="Align right"]'));await wait(()=>$('[data-td="1:1"]').style.textAlign==='right');
  await click($('[aria-label="Table options"]'));await wait(()=>$('[role="menu"][aria-label="Table options"]'));
  await click([...document.querySelectorAll('[role="menuitemcheckbox"]')].find(b=>b.textContent.startsWith('Header row')));await wait(()=>document.querySelectorAll('td.is-head').length===2);
  await click([...document.querySelectorAll('.nt-borders button')].find(b=>b.textContent==='Rows'));await wait(()=>$('.note-table').dataset.border==='rows');
  await click($('[aria-label="Border colour: purple"]'));await wait(()=>$('.note-table').dataset.borderColor==='purple');
  // Tab from the last cell adds a row and keeps typing flow.
  await click($('[aria-label="Edit cell B2"]'));await wait(()=>$('[aria-label="Cell B2"]'));
  await act(async()=>$('[aria-label="Cell B2"]').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));
  await wait(()=>document.querySelectorAll('.note-table tbody tr').length===3&&$('[aria-label="Cell A3"]'));
  assert.equal($('[data-td="1:0"]').dataset.bg,'green','formatting stayed on its cell');
 }finally{await act(async()=>app?.appRoot.unmount());dom.window.close();}
});
