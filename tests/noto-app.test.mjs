import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { act } from 'react';
import { empty, withNodes, save, load, getAssets } from './.build/data.mjs';
import { bullet } from '../src/domain.mjs';
import { NOTO_CREDIT_PATH } from '../src/noto-emojis.mjs';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Node', 'DOMParser', 'MutationObserver', 'getComputedStyle']) Object.defineProperty(globalThis, key, { value: key === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.ResizeObserver = undefined;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window); globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
HTMLElement.prototype.scrollTo = function ({ top = 0 }) { this.scrollTop = top; };
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
const wait = async check => { for (let i = 0; i < 150; i++) { if (check()) return; await act(async () => new Promise(resolve => setTimeout(resolve, 20))); } throw Error('Timed out waiting for Noto UI'); };
const click = async element => { assert.ok(element); await act(async () => element.click()); };
const button = text => [...document.querySelectorAll('button')].find(element => element.textContent.trim().endsWith(text));
const search = async value => act(async () => { const input = document.querySelector('[aria-label="Find an animated emoji"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
const open = async () => { await click(document.querySelector('[data-node-id="welcome"] .row-hover-more')); await click(button('Insert animated emoji…')); await wait(() => document.querySelector('.emoji-grid')); };

test('Noto picker searches the full catalog, saves an offline insertion, reuses it and cancels failed/pending downloads', async () => {
  const doc = withNodes(empty(), [bullet('welcome', { text: 'Nice work! ' })]); await save(null, doc);
  const originalFetch = globalThis.fetch, requests = [];
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); return new Response(await readFile(new URL(`./fixtures/noto/1f642_200d_2195_fe0f.${url.endsWith('webp') ? 'webp' : 'svg'}`, import.meta.url))); };
  let app;
  try {
    await act(async () => { app = await import('./.build/app.mjs'); });
    await wait(() => document.querySelector('[data-node-id="welcome"]'));
    await open();
    assert.equal(document.querySelectorAll('.emoji-grid button').length, 48, 'The full catalog is paginated, not mounted all at once');
    assert.match(document.querySelector('.emoji-result-count').textContent, /881/);
    assert.equal(document.querySelectorAll('.emoji-category option').length, 10);
    await click(button('Next')); assert.match(document.querySelector('.emoji-pagination').textContent, /Page 2/);
    await search('head nod'); assert.equal(document.querySelectorAll('.emoji-grid button').length, 1);
    await click(document.querySelector('[aria-label="Insert Head nod"]'));
    await wait(() => !document.querySelector('.emoji-picker'));
    await act(async () => new Promise(resolve => setTimeout(resolve, 250)));
    let stored = await load(), assets = await getAssets();
    assert.equal(stored.tables.emojis.length, 1);
    assert.equal(stored.tables.emojis[0].token, ':noto_1f642_200d_2195_fe0f:');
    assert.equal(requests.length, 2);
    assert.ok(assets.has('emoji/noto_1f642_200d_2195_fe0f.webp'));
    assert.ok(assets.has('emoji/noto_1f642_200d_2195_fe0f.svg'));
    assert.ok(assets.has(NOTO_CREDIT_PATH));
    assert.ok(document.querySelector('[data-emoji-token=":noto_1f642_200d_2195_fe0f:"]'));
    // Cached selection must work with the network unavailable.
    globalThis.fetch = async () => { throw Error('offline'); };
    await open(); await search('head nod'); await click(document.querySelector('[aria-label="Insert Head nod"]'));
    await wait(() => !document.querySelector('.emoji-picker'));
    await act(async () => new Promise(resolve => setTimeout(resolve, 250)));
    stored = await load();
    assert.equal(stored.tables.emojis.length, 1);
    assert.equal(stored.tables.bullets[0].text.split(':noto_1f642_200d_2195_fe0f:').length, 3);
    await open(); await search('head shake'); await click(document.querySelector('[aria-label="Insert Head shake"]'));
    await wait(() => document.querySelector('.emoji-import-error'));
    assert.match(document.querySelector('.emoji-import-error').textContent, /connection/);
    assert.equal(document.querySelector('.error-banner'), null, 'Network errors do not pause saving');
    assert.equal((await load()).tables.emojis.length, 1);
    await click(document.querySelector('dialog [aria-label="Close dialog"]'));
    // Closing a pending insertion must abort both image requests without inserting text.
    let aborted = 0;
    globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted++; reject(new DOMException('Cancelled', 'AbortError')); }, { once: true }));
    await open(); await search('head shake'); await click(document.querySelector('[aria-label="Insert Head shake"]'));
    await wait(() => document.querySelector('.emoji-result-count').textContent.includes('Saving'));
    await click(document.querySelector('dialog [aria-label="Close dialog"]'));
    await wait(() => !document.querySelector('.emoji-picker'));
    assert.equal(aborted, 2);
    assert.equal((await load()).tables.emojis.length, 1);
  } finally { globalThis.fetch = originalFetch; if (app) await act(async () => app.appRoot.unmount()); dom.window.close(); }
});
