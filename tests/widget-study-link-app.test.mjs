import {studyLibrary} from './view-outline-navigation.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { act } from 'react';
import { empty, withNodes, save, load } from './.build/data.mjs';
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


test('a widget study link preserves edits made after Study Desk mounted',async()=>{
 const doc=withNodes(empty(),[bullet('qa',{text:'First question',kind:'QUESTION'}),bullet('answer',{parentId:'qa',text:'First answer'})]);
 await save(null,doc);
 let app;
 const click=async text=>act(async()=>{
  const button=[...document.querySelectorAll('button')].find(button=>button.textContent.trim().startsWith(text));
  assert.ok(button,text);button.click();
 });
 try{
  await act(async()=>{app=await import('./.build/app.mjs');});
  await studyLibrary();
  await click('Study Desk');await click('Cram');
  await act(async()=>document.querySelector('[aria-label="Open All flashcards notebook"]').click());
  await click('Edit card');
  await act(async()=>document.querySelector('[aria-label="Edit question"]').click());
  await wait(()=>document.querySelector('.study-inline-editor-wrap .tiptap'));
  await act(async()=>{
   const editor=document.querySelector('.study-inline-editor-wrap .tiptap').editor;
   editor.commands.focus('end');editor.commands.insertContent(' revised');
  });
  await click('Done editing');
  await act(async()=>{
   window.remoWidgetStudy={deck:'__all_flashcards__',card:'qa',voice:false};
   window.dispatchEvent(new window.Event('remo-widget-study'));
  });
  await act(async()=>new Promise(resolve=>setTimeout(resolve,300)));
  const saved=await load();
  assert.equal(saved.tables.bullets.find(node=>node.id==='qa').text,'First question revised');
 }finally{
  if(app)await act(async()=>app.appRoot.unmount());
  dom.window.close();
 }
});
