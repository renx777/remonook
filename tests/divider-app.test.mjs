import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { act } from 'react';
import { empty, withNodes, save, load } from './.build/data.mjs';
import { bullet } from '../src/domain.mjs';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Node', 'DOMParser', 'MutationObserver', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: key === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[key], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = undefined;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
HTMLElement.prototype.scrollTo = function ({ top = 0 }) { this.scrollTop = top; };
dom.window.Range.prototype.getClientRects = () => [];
dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
const wait = async check => {
  for (let i = 0; i < 150; i++) {
    if (check()) return;
    await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
  }
  throw Error('Timed out waiting for divider element');
};
const key = async value => act(async () => document.querySelector('.tiptap').dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })));

test('horizontal line divider supports title, custom styles/colors, backspace deletion, and study exclusion', async () => {
  const initialNodes = [
    bullet('b1', { text: 'Intro bullet' }),
    bullet('div1', { text: '', blockStyle: 'divider', dividerStyle: 'squiggly', dividerColor: '#e06c75', position: 1 }),
    bullet('b2', { text: 'Conclusion bullet', position: 2 }),
  ];
  await save(null, withNodes(empty(), initialNodes));

  let app;
  try {
    await act(async () => { app = await import('./.build/app.mjs'); });
    await wait(() => document.querySelector('[data-node-id="div1"]'));

    // Converting an active editor must mount its editable DOM in the center slot.
    await act(async()=>document.querySelector('[data-node-id="b1"] .text-button').click());
    await wait(()=>document.querySelector('[data-node-id="b1"] .tiptap'));
    const originalEditor=document.querySelector('.tiptap').editor;
    const changeStyle=async value=>act(async()=>{const select=document.querySelector('[aria-label="Text block style"]');select.value=value;select.dispatchEvent(new window.Event('change',{bubbles:true}));});
    await changeStyle('divider');
    await wait(()=>document.querySelector('[data-node-id="b1"] .note-divider-title-editor .tiptap'));
    assert.equal(originalEditor.isDestroyed,true,'Conversion disposes the editor attached to the former container');
    assert.equal(document.querySelectorAll('.tiptap').length,1,'Conversion leaves no orphan editor at the left edge');
    assert.equal(document.querySelector('.tiptap').editor.getText(),'Intro bullet','Conversion preserves the title');
    await changeStyle('paragraph');
    await wait(()=>document.querySelector('[data-node-id="b1"] .bullet-editor:not(.note-divider-editor) .tiptap'));
    assert.equal(document.querySelectorAll('.tiptap').length,1);
    await key('Escape');

    // Verify divider wrapper and line rendering
    const divRow = document.querySelector('[data-node-id="div1"]');
    assert.ok(divRow.classList.contains('is-divider'), 'Outline row has is-divider class');
    const wrap = divRow.querySelector('.note-divider-wrap');
    assert.ok(wrap, 'Divider wrap is rendered');
    assert.ok(wrap.classList.contains('style-squiggly'), 'Squiggly style class applied');
    assert.equal(wrap.style.getPropertyValue('--divider-color'), '#e06c75');

    // Click divider text button to edit title
    const textBtn = divRow.querySelector('.text-button');
    assert.ok(textBtn, 'Divider has clickable text button');
    await act(async () => textBtn.click());
    await wait(() => document.querySelector('.note-divider-editor .tiptap'));

    let editor = document.querySelector('.tiptap').editor;
    assert.ok(editor, 'Tiptap editor active in divider');
    const centeredEditor=document.querySelector('.note-divider-wrap.is-editing');
    assert.equal(centeredEditor.children[0].tagName,'HR');
    assert.ok(centeredEditor.children[1].contains(document.querySelector('.tiptap')));
    assert.equal(centeredEditor.children[2].tagName,'HR');

    // Exercise the browser DOM-input path, rather than replacing the whole title.
    for (const character of 'Music') {
      await act(async () => {
        const paragraph = editor.view.dom.querySelector('p');
        paragraph.querySelector('br')?.remove();
        if (!paragraph.firstChild) paragraph.append(document.createTextNode(''));
        const text = paragraph.firstChild;
        text.appendData(character);
        const selection = window.getSelection();
        selection.collapse(text, text.length);
        editor.view.dom.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'insertText', data: character }));
        await new Promise(resolve => setTimeout(resolve, 30));
      });
      assert.equal(editor.state.selection.from, editor.getText().length + 1, 'Caret advances after each typed character');
    }
    assert.equal(editor.getText(), 'Music');
    await act(async () => editor.commands.setContent('<p></p>'));

    // A plain pasted title must stay in the divider, including when it was empty.
    await act(async () => {
      const event=new window.Event('paste',{bubbles:true,cancelable:true});
      Object.defineProperty(event,'clipboardData',{value:{files:[],getData:type=>type==='text/plain'?'Part 1':''}});
      editor.view.dom.dispatchEvent(event);
    });
    await wait(()=>document.querySelector('[data-node-id="div1"] .note-divider-editor .tiptap')?.textContent==='Part 1');
    // Blur/save by pressing Escape or clicking outside
    await key('Escape');
    await wait(() => document.querySelector('[data-node-id="div1"] .note-divider-title'));
    assert.equal(document.querySelector('[data-node-id="div1"] .note-divider-title').textContent, 'Part 1');

    // Test backspace on empty divider deletes the divider
    await act(async () => document.querySelector('[data-node-id="div1"] .text-button').click());
    await wait(() => document.querySelector('.note-divider-editor .tiptap'));
    editor = document.querySelector('.tiptap').editor;
    assert.equal(editor.state.selection.from, 'Part 1'.length + 1, 'Reopening a divider starts after its last letter');
    await act(async () => {
      editor.commands.setContent('<p></p>');
    });
    await key('Backspace');
    await wait(() => !document.querySelector('[data-node-id="div1"]'));
    assert.ok(!document.querySelector('[data-node-id="div1"]'), 'Empty divider deleted on backspace');

    await act(async () => new Promise(resolve => setTimeout(resolve, 300)));
    const updated = await load();
    assert.ok(!updated.tables.bullets.some(n => n.id === 'div1'), 'Divider deleted from database');
  } finally {
    if (app) await act(async () => app.appRoot.unmount());
    dom.window.close();
  }
});
