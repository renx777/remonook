import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { act } from 'react';
import { empty, save, load } from './.build/data.mjs';
import { bullet } from '../src/domain.mjs';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Node', 'DOMParser', 'MutationObserver', 'getComputedStyle']) Object.defineProperty(globalThis, key, { value: key === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
dom.window.HTMLCanvasElement.prototype.getContext = () => null;
globalThis.ResizeObserver = undefined;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window); globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
HTMLElement.prototype.scrollTo = function ({ top = 0 }) { this.scrollTop = top; };
dom.window.Range.prototype.getClientRects = () => [];
dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
const wait = async check => { for (let i = 0; i < 150; i++) { if (check()) return; await act(async () => new Promise(resolve => setTimeout(resolve, 20))); } throw Error('Timed out'); };
const $ = s => document.querySelector(s);
const click = async el => act(async () => { assert.ok(el, 'element exists'); el.click(); });
const button = text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);
const type = async (el, value) => act(async () => { const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set; set.call(el, value); el.dispatchEvent(new window.Event('input', { bubbles: true })); });


test('notebook theme: off by default; switching it on and off in Settings is saved per device', async () => {
  const doc = empty(); doc.tables.bullets = [bullet('a', { text: 'Photosynthesis' })];
  await save(null, doc); let app;
  try {
    await act(async () => { app = await import('./.build/app.mjs'); }); await wait(() => $('.outline-row'));
    assert.equal($('.app').classList.contains('notebook'), false, 'normal look by default');
    await click(button('Settings & backups') || [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Settings')));
    await wait(() => $('.nb-settings'));
    const toggle = $('.nb-switch-row input'); assert.equal(toggle.checked, false);
    await click(toggle); await wait(() => $('.nb-papers'));
    assert.equal(JSON.parse(dom.window.localStorage.getItem('remo-notebook')).on, true);
    await click([...document.querySelectorAll('.nb-paper')].find(b => b.textContent.includes('Dotted')));
    await click([...document.querySelectorAll('.nb-fonts button')].find(b => b.textContent.startsWith('Kalam')));
    assert.deepEqual((({ paper, font }) => ({ paper, font }))(JSON.parse(dom.window.localStorage.getItem('remo-notebook'))), { paper: 'dotted', font: 'kalam' });
    await click($('.nb-switch-row input')); await wait(() => !$('.nb-papers'));
    assert.equal(JSON.parse(dom.window.localStorage.getItem('remo-notebook')).on, false);
    assert.equal($('.app').classList.contains('notebook'), false, 'off restores the normal look');
  } finally { await act(async () => app?.appRoot.unmount()); dom.window.close(); }
});
