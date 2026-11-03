import { installOverlayGlobals } from './dom-overlays.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { act } from 'react';
import { empty, withNodes, save, load } from './.build/data.mjs';
import { bullet } from '../src/domain.mjs';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/#app', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Node', 'Element', 'DOMParser', 'MutationObserver', 'getComputedStyle']) Object.defineProperty(globalThis, key, { value: key === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[key], configurable: true });
installOverlayGlobals(dom);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { constructor(callback) { this.callback = callback; } observe(target) { this.callback([{ target, contentRect: { width: 1040, height: 800 } }]); } unobserve() { } disconnect() { } };
const realInterval = globalThis.setInterval; globalThis.setInterval = (fn, delay, ...args) => realInterval(fn, delay === 1000 ? 3600000 : delay, ...args);
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window); globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.matchMedia = () => ({ matches: true, addEventListener() { }, removeEventListener() { } });
HTMLElement.prototype.scrollTo = function ({ top = 0 }) { this.scrollTop = top; };
dom.window.Range.prototype.getClientRects = () => [];
dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
window.DOMMatrixReadOnly = class {
  constructor(transform = '') {
    const scale = parseFloat(/scale\(([^)]+)\)/.exec(transform)?.[1]?.split(',')[0] ?? 1);
    Object.assign(this, { a: scale, b: 0, c: 0, d: scale, e: 0, f: 0, m11: scale, m12: 0, m21: 0, m22: scale, m41: 0, m42: 0 });
  }
};
let containerWidth = 1040, containerHeight = 800;
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { get() { return containerWidth; } });
Object.defineProperty(HTMLElement.prototype, 'clientWidth', { get() { return containerWidth; } });
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { get() { return containerHeight; } });
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { get() { return containerHeight; } });
HTMLElement.prototype.getBoundingClientRect = function () { return { x: 0, y: 0, top: 0, left: 0, right: containerWidth, bottom: 0, width: containerWidth, height: 0, toJSON() { } }; };
window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
const wait = async check => { for (let i = 0; i < 150; i++) { if (check()) return; await act(async () => new Promise(resolve => setTimeout(resolve, 20))); } throw Error('Timed out waiting for mindmap'); };
const click = async selector => act(async () => { const target = typeof selector === 'string' ? document.querySelector(selector) : selector; assert.ok(target, selector); target.click(); });
const textButton = (selector, text) => [...document.querySelectorAll(selector)].find(button => button.textContent.trim() === text);
const navButton = text => [...document.querySelectorAll('[aria-label="Main navigation"] button')].find(button => button.textContent.trim().startsWith(text));
const key = async value => act(async () => document.querySelector('.tiptap').dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })));


import {addBookmark,patchBookmark} from '../src/bookmarks.mjs';
test('saved article opens safely and selection atomically becomes a source-linked note',async()=>{
 let d=empty(),result=addBookmark(d,'https://example.com/article');d=patchBookmark(result.doc,result.bookmark.id,{snapshotHash:'a'.repeat(64),snapshotPath:'articles/test.json'});const snapshot={title:'A saved article',html:'<p>A passage worth keeping.</p><script>alert(1)</script><img src="x" onerror="alert(1)">'};
 await save(null,d,'fixture',new Map([['articles/test.json',new Blob([JSON.stringify(snapshot)],{type:'application/json'})]]));let app;
 try{await act(async()=>{app=await import('./.build/app.mjs');});await wait(()=>navButton('Bookmarks'));await click(navButton('Bookmarks'));await wait(()=>document.querySelector('.bookmark-open'));await click('.bookmark-open');await wait(()=>document.querySelector('.web-article-scroll article p:not(.web-byline)'));assert.equal(document.querySelector('.web-article-scroll script'),null);assert.equal(document.querySelector('.web-article-scroll [onerror]'),null);
 const paragraph=document.querySelector('.web-article-scroll article p:not(.web-byline)'),range=document.createRange();range.selectNodeContents(paragraph);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);await act(async()=>paragraph.dispatchEvent(new window.MouseEvent('mouseup',{bubbles:true})));await wait(()=>document.querySelector('.web-selection'));await click(document.querySelector('.web-selection [aria-label="Highlight selection"]'));await act(async()=>new Promise(r=>setTimeout(r,500)));const stored=await load();assert.equal(Object.values(stored.web.webHighlights).length,1);const annotation=Object.values(stored.web.webHighlights)[0];assert.equal(stored.tables.bullets.find(n=>n.id===annotation.bulletId).text,'A passage worth keeping.');assert.equal(stored.web.bookmarkSources[annotation.bulletId].url,'https://example.com/article');
 }finally{if(app)await act(async()=>app.appRoot.unmount());dom.window.close();}
});
