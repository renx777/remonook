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
globalThis.localStorage=window.localStorage;
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




test('panes maintain separate navigation/search, share edits, resize, close, persist and support countdown creation',async()=>{
 await save(null,withNodes(empty(),[bullet('alpha',{text:'Alpha'}),bullet('fact',{parentId:'alpha',text:'Shared fact #imp @Ambar'}),bullet('beta',{position:1,text:'Beta'}),bullet('other',{parentId:'beta',text:'Unrelated'})]));let app;
 const click=async selector=>act(async()=>{const el=document.querySelector(selector);assert.ok(el,selector);el.click();});
 const input=async(selector,value)=>act(async()=>{const el=document.querySelector(selector);Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));});
 const panes=()=>[...document.querySelectorAll('.note-pane')];const newPane=()=>act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'r',altKey:true,bubbles:true,cancelable:true})));
 try{
 await act(async()=>{app=await import('./.build/app.mjs');});await wait(()=>document.querySelector('[data-node-id="alpha"]'));
 await click('[data-node-id="alpha"] .bullet-dot-btn');await newPane();assert.equal(panes().length,2);const firstId=panes()[0].dataset.paneId,secondId=panes()[1].dataset.paneId;
 await click(`[data-pane-id="${secondId}"] [aria-label="Search this pane"]`);await input(`[data-pane-id="${secondId}"] [aria-label="Search pane"]`,'#imp');assert.equal(panes()[0].querySelector('[aria-label="Search pane"]'),null);assert.equal(panes()[1].querySelector('[aria-label="Search pane"]').value,'#imp');
 await click(`[data-pane-id="${secondId}"] [data-node-id="fact"] .text-button`);let editor=document.querySelector('.tiptap').editor;await act(async()=>editor.commands.setContent('<p>Updated fact #imp @Ambar</p>'));assert.match(panes()[0].querySelector('[data-node-id="fact"] .text-button').textContent,/Updated fact/);
 await key('Escape');await click(`[data-pane-id="${secondId}"] [data-node-id="fact"] .bullet-dot-btn`);assert.equal(panes()[1].querySelector('.zoomed-title').value,'Updated fact #imp @Ambar');assert.equal(panes()[0].querySelector('.zoomed-title').value,'Alpha');await click(`[data-pane-id="${secondId}"] [aria-label="Pane back"]`);assert.equal(panes()[1].querySelector('.zoomed-title').value,'Alpha');
 const before=panes()[0].style.flexBasis;await act(async()=>document.querySelector('.pane-divider').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})));assert.notEqual(panes()[0].style.flexBasis,before);
 await newPane();assert.equal(panes().length,3);const thirdId=panes()[2].dataset.paneId;await click(`[data-pane-id="${thirdId}"] [aria-label="Close pane"]`);assert.equal(panes().length,2);assert.equal(JSON.parse(localStorage.getItem('remo-panes-v1')).length,2);

 const calendar=[...document.querySelectorAll('[aria-label="Main navigation"] button')].find(e=>e.textContent==='Calendar');await act(async()=>calendar.click());
 const add=[...document.querySelectorAll('button')].find(e=>e.textContent==='Add reminder');await act(async()=>add.click());await input('[aria-label="Reminder title"]','Final exam');await act(async()=>{const el=document.querySelector('[aria-label="Reminder category"]');el.value='exam';el.dispatchEvent(new window.Event('change',{bubbles:true}));});assert.equal(document.querySelector('[aria-label="Show countdown in top bar"]').checked,true);await input('[aria-label="Reminder date"]','2027-03-01');await act(async()=>document.querySelector('.reminder-editor').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));assert.match(document.querySelector('.reminder-current').textContent,/Final exam.*days left/);

 }finally{if(app)await act(async()=>app.appRoot.unmount());dom.window.close();}
});
