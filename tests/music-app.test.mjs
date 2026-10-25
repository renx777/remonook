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


test('collapsed media hides previews; music survives navigation and fullscreen',async()=>{
 const nodes=[bullet('album',{text:'Pictures',collapsed:true}),bullet('pic',{parentId:'album',text:'![](https://example.com/pic.gif)'}),bullet('music',{position:1,text:'Focus music',kind:'QUESTION'}),bullet('track',{parentId:'music',text:'https://music.youtube.com/watch?v=dQw4w9WgXcQ https://youtu.be/abcdefghijk'})];
 let plays=0,pauses=0;(window).YT={Player:class{constructor(el,options){this.options=options;queueMicrotask(()=>options.events.onReady());}playVideo(){plays++;this.options.events.onStateChange({data:1});}pauseVideo(){pauses++;this.options.events.onStateChange({data:2});}getCurrentTime(){return 0;}destroy(){}}};
 let doc=withNodes(empty(),nodes);doc.web.galleryNodes={album:true};doc.web.musicNodes={music:true};await save(null,doc);let app;
 const click=async selector=>act(async()=>document.querySelector(selector).click());
 const text=async label=>act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label).click());
 try{await act(async()=>{app=await import('./.build/app.mjs');});await wait(()=>document.querySelector('[data-node-id="album"]'));
 assert.equal(document.querySelector('[data-node-id="album"] .bullet-gallery'),null);assert.ok(document.querySelector('[data-node-id="album"] [aria-label="Images in this branch"]'));
 await click('[data-node-id="album"] [aria-label="Expand branch"]');assert.ok(document.querySelector('[data-node-id="album"] .bullet-gallery'));await click('[data-node-id="album"] [aria-label="Collapse branch"]');assert.equal(document.querySelector('[data-node-id="album"] .bullet-gallery'),null);
 assert.ok(document.querySelector('[data-node-id="music"] .text-button .bullet-inline-media [aria-label="YouTube in this branch"]'));assert.equal(document.querySelector('[data-node-id="music"] .row-end [aria-label="YouTube in this branch"]'),null);await click('[aria-label="Play music in Focus music"]');const frame=document.querySelector('.music-floating iframe');assert.ok(frame);assert.match(frame.src,/autoplay=1/);
 await click('[data-node-id="music"] [aria-label="Collapse branch"]');assert.equal(document.querySelector('.music-floating iframe'),frame);
 await text('Study Desk');assert.equal(document.querySelector('.music-floating iframe'),frame);await text('Cram');await click('[aria-label="Open All flashcards notebook"]');
 let fullscreen=null;Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>fullscreen});HTMLElement.prototype.requestFullscreen=async function(){fullscreen=this;document.dispatchEvent(new window.Event('fullscreenchange'));};document.exitFullscreen=async()=>{fullscreen=null;document.dispatchEvent(new window.Event('fullscreenchange'));};
 await click('[aria-label="Enter immersive mode"]');assert.equal(fullscreen,document.querySelector('.app'));assert.equal(document.querySelector('.music-floating iframe'),frame);assert.notEqual(document.querySelector('.music-player-host').inert,true);
 await click('[aria-label="Exit immersive mode"]');assert.equal(document.querySelector('.music-floating iframe'),frame);await click('[aria-label="Pause music"]');assert.equal(pauses,1);await click('[aria-label="Play music"]');assert.ok(plays>=2);await click('[aria-label="Minimize music controls"]');assert.ok(!document.querySelector('.music-floating').classList.contains('is-open'));assert.ok(document.querySelector('[aria-label="Pause music"]'));assert.equal(document.querySelector('.music-floating iframe'),frame);await click('[aria-label="Next music track"]');assert.notEqual(document.querySelector('.music-floating iframe'),frame);await click('[aria-label="Previous music track"]');assert.match(document.querySelector('.music-floating iframe').src,/dQw4/);await click('[aria-label="Show music controls"]');await click('[aria-label="Stop music"]');assert.equal(document.querySelector('.music-floating'),null);
 }finally{await act(async()=>app?.appRoot.unmount());dom.window.close();}
});
