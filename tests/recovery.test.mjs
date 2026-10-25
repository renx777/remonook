import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { RecoveryBoundary } from './.build/RecoveryBoundary.mjs';

test('render failure shows diagnostic and preserves backup callback', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('root'));
  let backups = 0;
  const onBackup = async () => { backups++; };
  function Content({ fail }) { if (fail) throw new Error('Expected render failure'); return React.createElement('p', null, 'Notes loaded'); }
  const render = fail => root.render(React.createElement(RecoveryBoundary, { onBackup }, React.createElement(Content, { fail })));
  await act(async () => render(false));
  assert.match(document.body.textContent, /Notes loaded/);
  const report = console.error;
  console.error = () => {};
  try { await act(async () => render(true)); } finally { console.error = report; }
  assert.match(document.body.textContent, /Expected render failure/);
  const backup = [...document.querySelectorAll('button')].find(b => b.textContent === 'Download recovery backup');
  await act(async () => backup.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  assert.equal(backups, 1);
  await act(async () => root.unmount());
  dom.window.close();
});
