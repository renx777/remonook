import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { EmojiProvider, EmojiText } from './.build/AnimatedEmoji.mjs';
import { notoEmojis, notoPosterPath } from '../src/noto-emojis.mjs';

test('inserted Noto emoji uses local animated/static images, pauses offscreen, and never falls back to a remote URL', async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const media = { matches: true, addEventListener(_name, callback) { this.listener = callback; }, removeEventListener() {} };
  window.matchMedia = () => media;
  let observer;
  globalThis.IntersectionObserver = class { constructor(callback) { observer = callback; } observe() { observer([{ isIntersecting: true }]); } disconnect() {} };
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL, revoked = [];
  URL.createObjectURL = blob => { assert.ok(['image/svg+xml', 'image/webp'].includes(blob.type), 'Restored untyped backup blobs receive their correct image MIME'); return blob.type === 'image/webp' ? 'blob:animation' : 'blob:poster'; };
  URL.revokeObjectURL = url => revoked.push(url);
  const item = notoEmojis[0], assets = new Map([['emoji/' + item.fileName, new Blob(['webp'])], [notoPosterPath(item), new Blob(['svg'])]]), root = createRoot(document.querySelector('#root'));
  const render = map => act(async () => root.render(React.createElement(EmojiProvider, { emojis: [item], assets: map, animate: true }, React.createElement(EmojiText, { text: item.token }))));
  try {
    await render(assets);
    assert.equal(document.querySelector('img').getAttribute('src'), 'blob:poster');
    await act(async () => { media.matches = false; media.listener(); });
    assert.equal(document.querySelector('img').getAttribute('src'), 'blob:animation');
    await act(async () => observer([{ isIntersecting: false }]));
    assert.equal(document.querySelector('img'), null, 'Offscreen animated image is detached');
    await act(async () => observer([{ isIntersecting: true }]));
    assert.equal(document.querySelector('img').getAttribute('src'), 'blob:animation');
    await act(async () => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new window.Event('visibilitychange')); });
    assert.equal(document.querySelector('img').getAttribute('src'), 'blob:poster');
    await render(new Map());
    assert.equal(document.querySelector('img'), null);
    assert.ok(!document.body.innerHTML.includes('fonts.gstatic.com'), 'Missing saved assets never cause network requests while reading notes');
  } finally { await act(async () => root.unmount()); URL.createObjectURL = create; URL.revokeObjectURL = revoke; dom.window.close(); }
  assert.ok(revoked.includes('blob:animation') && revoked.includes('blob:poster'));
});
