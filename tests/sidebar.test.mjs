import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { bullet } from '../src/domain.mjs';
import { OutlineSidebar } from './.build/OutlineChrome.mjs';

test('sidebar lists tags (nested, case-insensitive, most used first) instead of notes', async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const nodes = [
    bullet('a', { text: 'Gradient descent #study/ml #imp' }), bullet('b', { text: 'RAG notes #Study/rag', position: 1 }),
    bullet('c', { text: 'Bias #study/ML', position: 2 }), bullet('d', { text: 'Pay bill #imp', position: 3 }),
    bullet('e', { text: 'Linked [[Note|x#nottag]] and code', position: 4 }),
  ], searched = [];
  const root = createRoot(document.querySelector('#root'));
  const render = async search => act(async () => root.render(React.createElement(OutlineSidebar, { nodes, scope: null, starred: [], savedSearches: [], search, onNavigate() {}, onSearch: q => searched.push(q) })));
  await render('');
  assert.equal(document.querySelector('[aria-label="Notes tree"]'), null, 'no notes tree in the sidebar');
  const names = () => [...document.querySelectorAll('[aria-label="Tags"] .sidebar-tag-name')].map(n => n.textContent);
  assert.deepEqual(names(), ['study', 'imp'], 'top-level tags, most used first');
  assert.equal(document.querySelector('[aria-label="Tags"] [role="treeitem"] small').textContent, '3');
  await act(async () => document.querySelector('[aria-label="Expand #study"]').click());
  assert.deepEqual(names(), ['study', 'ml', 'rag', 'imp'], 'nested tags merge across case and fold under their parent');
  await act(async () => [...document.querySelectorAll('.sidebar-tag')].find(b => b.textContent.startsWith('ml')).click());
  assert.deepEqual(searched, ['#study/ml']);
  await render('#study/rag');
  assert.equal(document.querySelector('[aria-selected="true"] .sidebar-tag-name').textContent, 'rag');
  await act(async () => root.unmount()); dom.window.close();
});
