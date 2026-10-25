import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { bullet } from '../src/domain.mjs';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Node', 'DOMParser', 'MutationObserver']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
HTMLElement.prototype.scrollTo = function ({ top = 0 }) { this.scrollTop = top; };
Object.defineProperty(HTMLElement.prototype, 'clientWidth', { get: () => 800, configurable: true });
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { get: () => 600, configurable: true });
let attachmentHeight = 180;
HTMLElement.prototype.getBoundingClientRect = function () {
  const top = Number.parseFloat(this.style.top) || 0;
  const height = this.classList.contains('outline-row') ? (this.querySelector('.image-fallback') ? 90 : this.querySelector('.note-image') ? attachmentHeight : 28) : 600;
  return { x: 0, y: top, top, left: 0, right: 800, bottom: top + height, width: 800, height, toJSON() { return this; } };
};
const observers = new Set();
class TestResizeObserver {
  elements = new Set();
  constructor(callback) { this.callback = callback; observers.add(this); }
  observe(element) { this.elements.add(element); }
  disconnect() { this.elements.clear(); observers.delete(this); }
  emit(element) { if (this.elements.has(element)) this.callback([{ target: element }]); }
}
const { createRoot } = await import('react-dom/client');
const { OutlineView } = await import('./.build/OutlineView.mjs');
const nodes = [bullet('parent', { text: 'Types of learning' }), bullet('image', { text: 'Reinforcement learning', parentId: 'parent', orderKey: 0 }), bullet('next', { text: 'Semi-supervised learning', parentId: 'parent', orderKey: 1 }), bullet('after', { text: 'Next question', orderKey: 1 })];
const media = [{ id: 'picture', bulletId: 'image', fileName: 'test.png', mimeType: 'image/png', credit: 'Diagram' }];
const assets = new Map([['media/test.png', new Blob(['test'], { type: 'image/png' })]]);
const noop = () => {};
const base = { nodes, scope: null, search: '', showCompleted: true, editing: null, caret: null, disabled: false, assets, media: [], onEdit: noop, onZoom: noop, onToggle: noop, onChange: noop, onCommand: noop, onOutlinePaste: noop, onReady: noop, onMove: noop, onTask: noop, onMenu: noop };
const row = id => document.querySelector(`[data-node-id="${id}"]`);
const gap = () => parseFloat(row('next').style.top) - parseFloat(row('image').style.top);

test('adding, loading, resizing and removing an image reflows nested bullets without stale row heights', async () => {
  globalThis.ResizeObserver = TestResizeObserver;
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(OutlineView, base)));
    assert.equal(gap(), 28);
    await act(async () => root.render(React.createElement(OutlineView, { ...base, media })));
    assert.equal(gap(), 180, 'Attachment insertion invalidates the previously measured text-only row before paint');
    assert.ok(row('image').querySelector('.note-image'));
    assert.equal(row('next').querySelector('.note-image'), null, 'The attachment stays with its intended bullet');
    attachmentHeight = 520;
    await act(async () => row('image').querySelector('img').dispatchEvent(new window.Event('load')));
    assert.equal(gap(), 520, 'A decoded image pushes all following rows down');
    attachmentHeight = 310;
    await act(async () => {
      for (const observer of [...observers]) observer.emit(row('image'));
      // Reconnect observers in the same turn as a resize measurement. A queued,
      // cancellable paint must not discard the new height's render notification.
      root.render(React.createElement(OutlineView, { ...base, media, nodes: [...nodes] }));
    });
    assert.equal(gap(), 310);
    await act(async () => root.render(React.createElement(OutlineView, base)));
    assert.equal(gap(), 28, 'Removing the image closes the gap without reloading');
  } finally { await act(async () => root.unmount()); }
});

test('image load and failure reflow rows even when ResizeObserver is unavailable', async () => {
  globalThis.ResizeObserver = undefined;
  const root = createRoot(document.getElementById('root'));
  try {
    attachmentHeight = 180;
    await act(async () => root.render(React.createElement(OutlineView, { ...base, media })));
    attachmentHeight = 460;
    await act(async () => row('image').querySelector('img').dispatchEvent(new window.Event('load')));
    assert.equal(gap(), 460);
    await act(async () => row('image').querySelector('img').dispatchEvent(new window.Event('error')));
    await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
    assert.equal(gap(), 90);
    assert.ok(row('image').querySelector('.image-fallback'));
    assert.equal(observers.size, 0, 'Observers are released on unmount');
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
