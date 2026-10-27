import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useState } from 'react';
import { JSDOM } from 'jsdom';
import { bullet } from '../src/domain.mjs';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'DOMParser', 'MutationObserver']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
HTMLElement.prototype.scrollTo = function ({ top = 0 }) { this.scrollTop = top; };
HTMLElement.prototype.getBoundingClientRect = function () {
  const top = parseFloat(this.style.top) || 0, height = this.classList.contains('outline-row') ? 28 : 600;
  return { x: 0, y: top, top, left: 0, right: 800, bottom: top + height, width: 800, height, toJSON() {} };
};
window.Range.prototype.getClientRects = () => [];
window.Range.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
const { createRoot } = await import('react-dom/client');
const { OutlineView } = await import('./.build/OutlineView.mjs');
const { sourceOffset } = await import('./.build/outline-selection.mjs');
const noop = () => {};
let editor, deleted, copied, menuCalls = [];
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { copied = text; } } });
const nodes = [
  bullet('a', { text: 'Alpha beta gamma', position: 0, collapsed: true }),
  bullet('child', { text: 'Hidden child', parentId: 'a' }),
  bullet('b', { text: 'Delta epsilon', position: 1 }),
  bullet('c', { text: 'Last bullet', position: 2 }),
];
function Harness() {
  const [editing, onEdit] = useState(null);
  return React.createElement(OutlineView, { nodes, scope: null, search: '', showCompleted: true, editing, caret: null, disabled: false, assets: new Map(), media: [], onEdit, onZoom: noop, onToggle: noop, onChange: noop, onCommand: noop, onOutlinePaste: noop, onReady: e => { editor = e; }, onMove: noop, onTask: noop, onMenu: id => menuCalls.push(id), onDeleteNodes: ids => { deleted = ids; } });
}
const row = id => document.querySelector(`[data-node-id="${id}"]`);
const pointer = (target, type, x, y) => target.dispatchEvent(new window.MouseEvent(type, { button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true }));
const click = async (target, options = {}) => act(async () => target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, ...options })));

test('text drags stay native and transfer forward/backward selections into the editor', async () => {
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(Harness)));
    let source = row('a').querySelector('.bullet-read-source'), text = source.querySelector('span').firstChild;
    await act(async () => {
      pointer(text.parentElement, 'pointerdown', 100, 50);
      window.getSelection().setBaseAndExtent(text, 6, text, 10);
      pointer(window, 'pointermove', 140, 50);
      pointer(window, 'pointerup', 140, 50);
    });
    assert.equal(document.querySelector('.is-multi-selected'), null);
    assert.equal(window.getSelection().toString(), 'beta');
    await click(row('a').querySelector('.text-button'), { detail: 1 });
    assert.equal(editor.state.selection.anchor, 7);
    assert.equal(editor.state.selection.head, 11);
    await act(async () => root.unmount());
  } finally { if (document.querySelector('.outline-scroll')) await act(async () => root.unmount()); }
  const reverseRoot = createRoot(document.getElementById('root'));
  try {
    await act(async () => reverseRoot.render(React.createElement(Harness)));
    const text = row('a').querySelector('.bullet-read-source span').firstChild;
    window.getSelection().setBaseAndExtent(text, 10, text, 6);
    await click(row('a').querySelector('.text-button'), { detail: 1 });
    assert.equal(editor.state.selection.anchor, 11);
    assert.equal(editor.state.selection.head, 7);
  } finally { await act(async () => reverseRoot.unmount()); }
});

test('cross-row drags select whole branches, copy collapsed children, and delete only selected roots', async () => {
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(Harness)));
    await act(async () => {
      pointer(row('a').querySelector('.bullet-read-source'), 'pointerdown', 100, 50);
      pointer(window, 'pointermove', 160, 85);
      pointer(window, 'pointerup', 160, 85);
    });
    assert.ok(row('a').classList.contains('is-multi-selected'));
    assert.ok(row('b').classList.contains('is-multi-selected'));
    assert.ok(!row('c').classList.contains('is-multi-selected'));
    assert.match(document.querySelector('.selection-count').textContent, /2 bullets/);
    await click(document.querySelector('[aria-label="Copy selected"]'));
    assert.equal(copied, '- Alpha beta gamma\n\t- Hidden child\n- Delta epsilon');
    await click(document.querySelector('[aria-label="Delete selected"]'));
    assert.deepEqual(new Set(deleted), new Set(['a', 'b']));
    await click(row('b').querySelector('.text-button'));
    assert.ok(editor);
    // Selection also begins in the active editor and releases it on crossing.
    await act(async () => {
      pointer(row('b').querySelector('.tiptap'), 'pointerdown', 100, 85);
      pointer(window, 'pointermove', 100, 115);
      pointer(window, 'pointerup', 100, 115);
    });
    assert.equal(editor, null);
    assert.ok(row('b').classList.contains('is-multi-selected'));
    assert.ok(row('c').classList.contains('is-multi-selected'));
    await act(async () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(document.querySelector('.is-multi-selected'), null);
  } finally { await act(async () => root.unmount()); }
});

test('source offsets account for emoji tokens, equations and line breaks', () => {
  const root = document.createElement('span');
  root.innerHTML = 'A<span data-emoji-token=":wave:">👋</span><br><span data-selection-source="$x^2$">x²</span><b>end</b>';
  const end = root.querySelector('b').firstChild;
  assert.equal(sourceOffset(root, end, 2), 1 + 6 + 1 + 5 + 2);
});

test('click position, modifier selection, outside dismissal and touch scrolling do not interfere', async () => {
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(Harness)));
    const text = row('b').querySelector('.bullet-read-source span').firstChild;
    document.caretPositionFromPoint = () => ({ offsetNode: text, offset: 3 });
    window.getSelection().removeAllRanges();
    await click(row('b').querySelector('.text-button'), { detail: 1, clientX: 125, clientY: 85 });
    assert.equal(editor.state.selection.from, 4, 'The click opens the editor at the pointed character');
    delete document.caretPositionFromPoint;
    await click(row('a').querySelector('.text-button'), { ctrlKey: true });
    assert.equal(editor, null);
    assert.match(document.querySelector('.selection-count').textContent, /1 bullet/);
    await click(row('c').querySelector('.text-button'), { shiftKey: true });
    assert.equal(document.querySelectorAll('.is-multi-selected').length, 3);
    assert.match(document.querySelector('.selection-count').textContent, /3 bullets/);
    await act(async () => pointer(document.body, 'pointerdown', 0, 0));
    assert.equal(document.querySelector('.is-multi-selected'), null);
    await act(async () => {
      const event = new window.MouseEvent('pointerdown', { button: 0, clientX: 100, clientY: 50, bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: 'touch' });
      row('a').querySelector('.text-button').dispatchEvent(event);
      pointer(window, 'pointermove', 100, 115);
      pointer(window, 'pointerup', 100, 115);
    });
    assert.equal(document.querySelector('.is-multi-selected'), null, 'Touch gestures remain available for native scrolling');
  } finally { await act(async () => root.unmount()); }
});

test('touch long-press keeps native selection while explicit dots and desktop right-click open actions', async () => {
 const root = createRoot(document.getElementById('root')), originalMedia = window.matchMedia;
 menuCalls = [];
 try {
  await act(async () => root.render(React.createElement(Harness)));
  window.matchMedia = () => ({matches:true,addEventListener(){},removeEventListener(){}});
  const longPress = new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true});
  await act(async () => row('a').querySelector('.text-button').dispatchEvent(longPress));
  assert.deepEqual(menuCalls,[]);
  assert.equal(longPress.defaultPrevented,false,'Native text selection is not suppressed');
  await click(row('a').querySelector('.row-end [aria-label="Bullet actions"]'));
  assert.deepEqual(menuCalls,['a']);
  window.matchMedia = originalMedia;
  const rightClick = new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true});
  await act(async () => row('b').dispatchEvent(rightClick));
  assert.deepEqual(menuCalls,['a','b']);
  assert.equal(rightClick.defaultPrevented,true);
 } finally {window.matchMedia=originalMedia;await act(async()=>root.unmount());}
});
