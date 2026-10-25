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


function pointer(element,type,x,y){const event=new window.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperties(event,{pointerId:{value:1},pointerType:{value:'mouse'},isPrimary:{value:true}});element.dispatchEvent(event);}
test('drag image resize persists; full view and drawn image occlusion work through the study deck',async()=>{
 let doc=empty();doc.tables.bullets=[bullet('image-note',{text:'Biology image'})];doc.tables.media=[{id:'img',bulletId:'image-note',fileName:'diagram.svg',mimeType:'image/svg+xml',credit:'Diagram.svg',sourceUrl:'',licenseUrl:''}];await save(null,doc,'fixture',new Map([['media/diagram.svg',new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500"></svg>'],{type:'image/svg+xml'})]]));
 const original=HTMLElement.prototype.getBoundingClientRect;HTMLElement.prototype.getBoundingClientRect=function(){if(this.matches('figure.note-image'))return{left:0,top:0,width:600,height:300};if(this.matches('.occlusion-draw-area'))return{left:0,top:0,width:1000,height:500};return original.call(this);};
 const clickText=async text=>act(async()=>{const el=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(text));assert.ok(el,text);el.click();});let app;
 try{
 await act(async()=>{app=await import('./.build/app.mjs');});await wait(()=>document.querySelector('.image-resize-handle'));
 const handle=document.querySelector('.image-resize-handle');await act(async()=>{pointer(handle,'pointerdown',600,300);pointer(handle,'pointermove',300,300);pointer(handle,'pointerup',300,300);});await act(async()=>new Promise(r=>setTimeout(r,250)));assert.equal((await load()).tables.media[0].displayWidth,50);
 await clickText('View full screen');assert.ok(document.querySelector('.image-viewer[open] img'));await act(async()=>document.querySelector('.image-viewer').dispatchEvent(new window.Event('cancel',{bubbles:true,cancelable:true})));assert.equal(document.querySelector('.image-viewer'),null);
 await clickText('Image occlusion');const stage=document.querySelector('.occlusion-draw-area');await act(async()=>stage.querySelector('img').dispatchEvent(new window.Event('load')));
 await act(async()=>{pointer(stage,'pointerdown',100,100);pointer(stage,'pointermove',400,200);pointer(stage,'pointerup',400,200);pointer(stage,'pointerdown',550,250);pointer(stage,'pointerup',850,400);});assert.equal(document.querySelectorAll('.occlusion-region-list li').length,2);
 await act(async()=>{const input=document.querySelector('[aria-label="Occlusion title"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'Anatomy');input.dispatchEvent(new window.Event('input',{bubbles:true}));});
 await clickText('Create 2 study cards');await wait(()=>!document.querySelector('.occlusion-editor'));await act(async()=>new Promise(r=>setTimeout(r,250)));assert.equal(Object.keys((await load()).web.occlusions).length,2);
 await clickText('Study Desk');await clickText('Cram');await act(async()=>document.querySelector('[aria-label="Open Anatomy notebook"]').click());await wait(()=>document.querySelector('.occlusion-study'));
 assert.equal(document.querySelectorAll('.occlusion-study .occlusion-mask:not(.is-revealed)').length,2);await clickText('View full screen');assert.equal(document.querySelectorAll('.image-viewer .occlusion-mask:not(.is-revealed)').length,2);await act(async()=>document.querySelector('.image-viewer').dispatchEvent(new window.Event('cancel',{cancelable:true})));
 await clickText('Show answer');assert.ok(document.querySelector('.occlusion-mask.is-revealed'));assert.equal(document.querySelectorAll('.occlusion-study .occlusion-mask:not(.is-revealed)').length,1);
 const queue=JSON.parse((await load()).tables.study_sessions[0]?.queueJson||'[]');await clickText('Edit card');await wait(()=>document.querySelector('.occlusion-editor'));assert.equal(document.querySelectorAll('.occlusion-region-list li').length,2);await clickText('Cancel');assert.ok(document.querySelector('.occlusion-mask.is-revealed'));
 }finally{HTMLElement.prototype.getBoundingClientRect=original;await act(async()=>app?.appRoot.unmount());dom.window.close();}
});
