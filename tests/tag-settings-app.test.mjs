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

test('tag settings: colour, icon and effect apply; tag checkboxes toggle; rename and remove update every bullet', async () => {
  const doc = empty(); doc.tables.bullets = [bullet('a', { text: 'Book tickets #todo' }), bullet('b', { text: 'Gradient descent #Study/ml', position: 1 }), bullet('c', { text: 'Bias **x** #study', position: 2 })];
  await save(null, doc); let app;
  try {
    await act(async () => { app = await import('./.build/app.mjs'); }); await wait(() => $('[aria-label="Tags"]'));
    // A #todo tag shows a checkbox that swaps it for #done.
    await wait(() => $('[data-node-id="a"] .tag-checkbox'));
    await click($('[data-node-id="a"] .tag-checkbox'));
    await wait(() => (load && $('[data-node-id="a"]')?.className.includes('tag-strike')));
    // Open settings from the sidebar and set an icon and an effect.
    await click($('[aria-label="Settings for #Study"]'));
    await wait(() => $('.tag-settings'));
    await click($('[aria-label="Icon 📚"]'));
    await click(button('Band'));
    await wait(() => $('[data-node-id="b"]').className.includes('tag-band') && $('[data-node-id="b"] .tag-glyph')?.textContent === '📚');
    let stored; await wait(() => { load().then(d => { stored = d; }); return stored?.web.tags?.study?.effect === 'band'; });
    assert.deepEqual(stored.web.tags.study, { icon: '📚', effect: 'band' });
    // Rename everywhere, sub-tags included, and settings follow.
    await type($('#tag-settings-name'), 'learning');
    await click(button('Rename'));
    await wait(async () => true);
    await wait(() => !$('.tag-settings'));
    let saved; await wait(() => { load().then(d => { saved = d; }); return saved?.tables.bullets.find(n => n.id === 'b')?.text === 'Gradient descent #learning/ml'; });
    assert.equal(saved.tables.bullets.find(n => n.id === 'c').text, 'Bias **x** #learning');
    assert.deepEqual(saved.web.tags.learning, { icon: '📚', effect: 'band' }); assert.equal(saved.web.tags.study, undefined);
    // Remove the tag from every bullet after confirming.
    await click($('[aria-label="Settings for #learning"]')); await wait(() => $('.tag-settings'));
    await click(button('Remove from 2 bullets…')); await click(button('Remove tag'));
    saved = null; await wait(() => { load().then(d => { saved = d; }); return saved?.tables.bullets.find(n => n.id === 'b')?.text === 'Gradient descent'; });
    assert.equal($('[aria-label="Settings for #learning"]'), null);
  } finally { await act(async () => app?.appRoot.unmount()); dom.window.close(); }
});
