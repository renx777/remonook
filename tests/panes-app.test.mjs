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
 const panes=()=>[...document.querySelectorAll('.note-pane')];const newPane=()=>act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'r',code:'KeyR',altKey:true,bubbles:true,cancelable:true})));
 try{
 await act(async()=>{app=await import('./.build/app.mjs');});await wait(()=>document.querySelector('[data-node-id="alpha"]'));
 await click('[data-node-id="alpha"] .bullet-dot-btn');await newPane();assert.equal(panes().length,2);const firstId=panes()[0].dataset.paneId,secondId=panes()[1].dataset.paneId;
 assert.equal(panes()[0].style.flexBasis,panes()[1].style.flexBasis);assert.equal(document.querySelector('.pane-header'),null);assert.ok(document.querySelector('[aria-label="Pane back"]'));assert.equal(document.querySelector('[aria-label="Pane back"]').disabled,true);assert.ok(document.querySelector('[aria-label="Pane forward"]'));assert.ok(document.querySelector('[aria-label="Close pane"]'));
 assert.ok(panes()[1].classList.contains('is-active'));assert.ok(!panes()[0].classList.contains('is-active'));
 const keydown=async init=>act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{bubbles:true,cancelable:true,...init})));
 await keydown({key:'ArrowLeft',code:'ArrowLeft',ctrlKey:true,altKey:true});assert.ok(panes()[0].classList.contains('is-active'));assert.ok(!panes()[1].classList.contains('is-active'));
 await keydown({key:'ArrowRight',code:'ArrowRight',ctrlKey:true,altKey:true});assert.ok(panes()[1].classList.contains('is-active'));
 await act(async()=>panes()[0].dispatchEvent(new window.Event('pointerdown',{bubbles:true})));assert.ok(panes()[0].classList.contains('is-active'));assert.ok(!panes()[1].classList.contains('is-active'));
 await act(async()=>panes()[1].dispatchEvent(new window.Event('pointerdown',{bubbles:true})));await input('[aria-label="Search visible outline"]','#imp');assert.equal(document.querySelector('[aria-label="Search visible outline"]').value,'#imp');
 await act(async()=>document.querySelector('[aria-label="Search visible outline"]').dispatchEvent(new window.FocusEvent('focusout',{bubbles:true})));
 await act(async()=>panes()[0].dispatchEvent(new window.Event('pointerdown',{bubbles:true})));assert.equal(document.querySelector('[aria-label="Search visible outline"]').value,'');
 await act(async()=>panes()[1].dispatchEvent(new window.Event('pointerdown',{bubbles:true})));assert.equal(document.querySelector('[aria-label="Search visible outline"]').value,'#imp');
 await click(`[data-pane-id="${secondId}"] [data-node-id="fact"] .text-button`);let editor=document.querySelector('.tiptap').editor;await act(async()=>editor.commands.setContent('<p>Updated fact #imp @Ambar</p>'));await wait(()=>panes()[0].querySelector('[data-node-id="fact"] .text-button')?.textContent.includes('Updated fact'));
 await key('Escape');await click(`[data-pane-id="${secondId}"] [data-node-id="fact"] .bullet-dot-btn`);assert.equal(panes()[1].querySelector('.zoomed-title').value,'Updated fact #imp @Ambar');assert.equal(panes()[0].querySelector('.zoomed-title').value,'Alpha');await click('[aria-label="Pane back"]');assert.equal(panes()[1].querySelector('.zoomed-title').value,'Alpha');
 const before=panes()[0].style.flexBasis;await act(async()=>document.querySelector('.pane-divider').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})));assert.notEqual(panes()[0].style.flexBasis,before);
 assert.equal(document.querySelectorAll('.pane-search input').length,2,'each pane gets its own search bar');
 await act(async()=>document.querySelector('[aria-label="Search pane 1"]').dispatchEvent(new window.FocusEvent('focusin',{bubbles:true})));
 assert.ok(panes()[0].classList.contains('is-active'),'focusing a pane search activates its pane');
 await input('[aria-label="Search pane 1"]','Unrelated');
 await wait(()=>!panes()[0].querySelector('[data-node-id="fact"]'));
 assert.equal(panes()[0].querySelector('[data-node-id="fact"]'),null,'pane 1 search filters only pane 1');
 assert.ok(panes()[1].querySelector('[data-node-id="fact"]'),'pane 2 keeps its rows');
 await input('[aria-label="Search pane 1"]','');
 await wait(()=>panes()[0].querySelector('[data-node-id="fact"]'));
 const w0=panes()[0].style.flexBasis,w1=panes()[1].style.flexBasis;
 await newPane();assert.equal(panes().length,3);assert.equal(panes()[0].style.flexBasis,w0);assert.equal(panes()[1].style.flexBasis,w1);assert.ok(panes()[2].classList.contains('is-active'));
 const thirdId=panes()[2].dataset.paneId;await click('[aria-label="Close pane 3"]');assert.equal(panes().length,2);assert.equal(JSON.parse(localStorage.getItem('remo-panes-v1')).length,2);
 await keydown({key:'w',code:'KeyW',altKey:true});assert.equal(panes().length,1);assert.equal(document.querySelector('[aria-label="Close pane"]'),null);assert.equal(document.querySelector('[aria-label="Pane back"]'),null);assert.ok(document.querySelector('.notes-panes').classList.contains('is-single'));assert.equal(JSON.parse(localStorage.getItem('remo-panes-v1')).length,1);

 const calendar=[...document.querySelectorAll('[aria-label="Main navigation"] button')].find(e=>e.textContent==='Calendar');await act(async()=>calendar.click());
 const add=[...document.querySelectorAll('button')].find(e=>e.textContent==='Add reminder');await act(async()=>add.click());await input('[aria-label="Reminder title"]','Final exam');await act(async()=>{const el=document.querySelector('[aria-label="Reminder category"]');el.value='exam';el.dispatchEvent(new window.Event('change',{bubbles:true}));});assert.equal(document.querySelector('[aria-label="Show countdown in top bar"]').checked,true);await input('[aria-label="Reminder date"]','2027-03-01');await act(async()=>document.querySelector('.reminder-editor').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));assert.match(document.querySelector('.reminder-current').textContent,/Final exam.*days left/);

 }finally{if(app)await act(async()=>app.appRoot.unmount());dom.window.close();}
});
