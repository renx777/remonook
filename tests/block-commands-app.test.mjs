import {installOverlayGlobals} from './dom-overlays.mjs';
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
installOverlayGlobals(dom);
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

test('slash commands convert blocks, highlight code, preserve text and open MCQs', async () => {
  await save(null, withNodes(empty(), [bullet('command', { text: '' })]));
  let app;
  try {
    await act(async () => { app = await import('./.build/app.mjs'); });
    await wait(() => document.querySelector('[data-node-id="command"] .text-button'));
    await act(async () => document.querySelector('[data-node-id="command"] .text-button').click());
    await wait(() => document.querySelector('.tiptap'));
    // The .tiptap element can exist before its editor instance is attached; wait for both.
    await wait(() => document.querySelector('.tiptap')?.editor);
    let editor = document.querySelector('.tiptap').editor;
    // The app may re-create the editor (for example after a block-style change).
    const type = async text => {
      // Keep the editor the test chose; only if the app destroyed it, switch to the live one.
      if (editor.isDestroyed) { await wait(() => [...document.querySelectorAll('.tiptap')].some(e => e.editor && !e.editor.isDestroyed)); editor = [...document.querySelectorAll('.tiptap')].map(e => e.editor).find(e => e && !e.isDestroyed); }
      await act(async () => { editor.commands.focus(); editor.commands.insertContent(text); });
    };
    await type('/h2'); await key('Enter');
    assert.equal(document.querySelector('.row-content').dataset.blockStyle, 'h2');
    await type('Section title');
    await act(async () => document.querySelector('.tiptap').dispatchEvent(new window.KeyboardEvent('keydown', { key: '1', altKey: true, ctrlKey: true, bubbles: true, cancelable: true })));
    assert.equal(document.querySelector('.row-content').dataset.blockStyle, 'h1');
    assert.equal(editor.getText(), 'Section title', 'Changing block style preserves the text');
    await act(async () => document.querySelector('.tiptap').dispatchEvent(new window.KeyboardEvent('keydown', { key: '0', altKey: true, ctrlKey: true, bubbles: true, cancelable: true })));
    assert.equal(document.querySelector('.row-content').dataset.blockStyle, 'paragraph');
    await act(async () => editor.commands.setContent('<p></p>'));
    await type('/code');
    await wait(() => document.querySelector('[aria-label="Bullet commands"]'));
    assert.equal(document.querySelectorAll('.slash-menu [role="option"]').length, 1);
    await key('Enter');
    await wait(() => document.querySelector('[aria-label="Code language"]'));
    assert.equal(editor.getText(), '');
    await type('const answer = 42;');
    assert.ok(document.querySelector('.tiptap .hljs-keyword'));
    await key('Enter'); await key('Tab'); await type('console.log(answer)');
    assert.equal(editor.getText({ blockSeparator: '\n' }), 'const answer = 42;\n  console.log(answer)');
    assert.equal(document.querySelectorAll('.outline-row').length, 1);
    await act(async () => {
      const select = document.querySelector('[aria-label="Code language"]'); select.value = 'python'; select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    assert.equal(document.querySelector('[aria-label="Code language"]').value, 'python');
    await act(async () => document.querySelector('.tiptap').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })));
    // The outline count can publish before the old editor is destroyed and its
    // replacement mounts. Wait for the new live editor before issuing commands.
    await wait(() => document.querySelectorAll('.outline-row').length === 2 && document.querySelector('.tiptap')?.editor && document.querySelector('.tiptap').editor !== editor && !document.querySelector('.tiptap').editor.isDestroyed);
    editor = document.querySelector('.tiptap').editor;
    await type('/number'); await key('Enter');
    await type('First item'); await key('Escape');
    assert.match(document.querySelector('.outline-row:last-of-type')?.textContent || document.body.textContent, /1\. First item/);
    await act(async () => document.querySelector('[aria-label="First item"]').click());
    editor = document.querySelector('.tiptap').editor;
    await act(async () => document.querySelector('.tiptap').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'm', altKey: true, ctrlKey: true, bubbles: true, cancelable: true })));
    await wait(() => document.querySelector('dialog'));
    assert.match(document.querySelector('dialog').textContent, /MCQ/);
    await act(async () => new Promise(resolve => setTimeout(resolve, 300)));
    const stored = await load();
    assert.equal(stored.tables.bullets.find(n => n.id === 'command').codeLanguage, 'python');
    assert.equal(stored.tables.bullets.find(n => n.id === 'command').text, 'const answer = 42;\n  console.log(answer)');
    await act(async () => document.querySelector('[aria-label="Close MCQ editor"]').click());
    const itemId = stored.tables.bullets.find(node => node.text === 'First item').id;
    await act(async () => document.querySelector(`[data-node-id="${itemId}"] [aria-label="Bullet actions"]`).click());
    await act(async () => document.querySelector('[data-category="0"]').click());
    await wait(() => document.querySelector('[aria-label="Bullet text style"]'));
    await act(async () => { const select = document.querySelector('[aria-label="Bullet text style"]'); select.value = 'h3'; select.dispatchEvent(new window.Event('change', {bubbles:true})); });
    await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Insert horizontal divider')).click());
    await wait(() => document.querySelector('hr.note-divider'));
    assert.ok(document.querySelector('[aria-label="First item"]'), 'Inserting a divider after text preserves that bullet');
    assert.equal(document.querySelector('.tiptap').textContent, '', 'Typing continues in a fresh paragraph after the divider');
    await act(async () => new Promise(resolve => setTimeout(resolve, 300)));
    const final = await load();
    assert.ok(final.tables.bullets.some(node => node.text === 'First item' && node.blockStyle === 'h3'));
    assert.equal(final.tables.bullets.filter(node => node.blockStyle === 'divider').length, 1);
  } finally { if (app) await act(async () => app.appRoot.unmount()); dom.window.close(); }
});
