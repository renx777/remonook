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

const wait = async check => {
  for (let i = 0; i < 150; i++) {
    if (check()) return;
    await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
  }
  throw Error('Timed out waiting for condition');
};

test('flashcard study mode reveals child bullets one by one with option to show all at once', async () => {
  const nodes = [
    bullet('deck', { text: 'Deck with multi bullets' }),
    bullet('q1', { parentId: 'deck', text: 'What are the three pillars of OOP?' }),
    bullet('b1', { parentId: 'q1', position: 0, text: 'Encapsulation', listType: 'ORDERED' }),
    bullet('b2', { parentId: 'b1', position: 0, text: 'Inheritance', listType: 'ORDERED' }),
    bullet('b3', { parentId: 'q1', position: 2, text: 'Polymorphism', listType: 'ORDERED' }),
  ];
  let doc = empty();
  doc.tables.decks = [{ rootId: 'deck', createdAt: Date.now(), pinned: 0 }];
  await save(null, withNodes(doc, nodes));
  let app;

  const click = async selector => act(async () => {
    const el = document.querySelector(selector);
    assert.ok(el, selector);
    el.click();
  });
  const clickText = async text => act(async () => {
    const el = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(text));
    assert.ok(el, text);
    el.click();
  });
  const keyDown = async (key, shift = false) => act(async () => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true }));
  });

  try {
    await act(async () => { app = await import('./.build/app.mjs'); });
    await wait(() => document.querySelector('.outline-row'));

    // Navigate to Study Desk
    await clickText('Study Desk');
    await clickText('Cram');
    await act(async () => document.querySelector('[aria-label="Open Deck with multi bullets notebook"]').click());
    await wait(() => document.querySelector('.flashcard-question'));

    // Initially, question is shown and answer is hidden
    assert.match(document.querySelector('.flashcard-question').textContent, /three pillars of OOP/);
    assert.equal(document.querySelector('.flashcard-answer'), null, 'Answer is initially hidden');
    assert.match(document.querySelector('.study-keyboard-hint').textContent, /Press Space/);
    assert.match(document.querySelector('.study-touch-hint').textContent, /Tap the card/);
    assert.ok(document.querySelector('.study-card-tools [aria-label="Card actions"]'));
    assert.equal(document.querySelector('.study-action-dock [aria-label="Card actions"]'), null);
    await click('[aria-label="Card actions"]');
    assert.ok(document.querySelector('.flashcard [role="menu"]'));
    await keyDown('Escape');

    // Reveal answer via Space bar
    await keyDown(' ');
    assert.ok(document.querySelector('.flashcard-answer'), 'Answer container is revealed');
    assert.deepEqual([...document.querySelectorAll('.flashcard-answer-row .answer-dot')].map(el=>el.textContent), ['1.'], 'Step reveal retains the ordered marker');

    // In step mode, Bullet 1 of 3 is shown first
    assert.equal(document.querySelector('.flashcard-step-badge'),null);
    assert.equal(document.querySelector('[aria-label="Answer reveal progress"]').getAttribute('aria-valuenow'),'1');
    assert.match(document.querySelector('.flashcard-answer').textContent, /Encapsulation/);
    assert.doesNotMatch(document.querySelector('.flashcard-answer').textContent, /Inheritance/);
    assert.doesNotMatch(document.querySelector('.flashcard-answer').textContent, /Polymorphism/);

    // Keep the primary control and progress cues, without duplicate footer bars.
    assert.ok(document.querySelector('.study-step-actions'), 'Step actions in dock');
    assert.match(document.querySelector('.dock-primary').textContent, /^Next bullet$/);
    assert.ok(document.querySelector('.flashcard-show-all-btn'), 'Card header Show full bullets button exists');
    assert.equal(document.querySelector('.dock-show-all'),null,'Full-bullet action is kept in the card header only');
    assert.equal(document.querySelector('.study-dock-hint').textContent,'','Step mode reserves the footer space without shortcut text');
    assert.equal(document.querySelectorAll('.flashcard-bullet-dots .bullet-dot').length,3,'All bullet progress circles remain visible');
    assert.equal(document.querySelectorAll('.flashcard-bullet-dots .is-revealed').length,1,'Only the revealed bullet is filled');

    // Trigger next bullet via ArrowDown or tap Next bullet
    await keyDown('ArrowDown');
    assert.equal(document.querySelectorAll('.flashcard-bullet-dots .is-revealed').length,2);
    assert.deepEqual([...document.querySelectorAll('.flashcard-answer-row .answer-dot')].map(el=>el.textContent), ['1.','1.'], 'Nested answers restart numbering within their parent');
    assert.equal(document.querySelectorAll('.flashcard-answer-row')[1].style.paddingLeft,'20px');
    assert.equal(document.querySelector('[aria-label="Answer reveal progress"]').getAttribute('aria-valuenow'),'2');
    assert.match(document.querySelector('.flashcard-answer').textContent, /Encapsulation/);
    assert.match(document.querySelector('.flashcard-answer').textContent, /Inheritance/);
    assert.doesNotMatch(document.querySelector('.flashcard-answer').textContent, /Polymorphism/);
    assert.match(document.querySelector('.dock-primary').textContent, /^Next bullet$/);

    // Step back 1 bullet using ArrowUp
    await keyDown('ArrowUp');
    assert.equal(document.querySelector('.flashcard-step-badge'),null);
    assert.equal(document.querySelector('[aria-label="Answer reveal progress"]').getAttribute('aria-valuenow'),'1');
    assert.doesNotMatch(document.querySelector('.flashcard-answer').textContent, /Inheritance/);

    // Press 'a' keyboard action to show full bullets at once
    await keyDown('a');
    assert.equal(document.querySelector('[aria-label="Answer reveal progress"]').getAttribute('aria-valuenow'),'3');
    assert.deepEqual([...document.querySelectorAll('.flashcard-answer-row .answer-dot')].map(el=>el.textContent), ['1.','1.','2.'], 'Full reveal retains sibling numbering across nested answers');
    assert.match(document.querySelector('.flashcard-answer').textContent, /Encapsulation/);
    assert.match(document.querySelector('.flashcard-answer').textContent, /Inheritance/);
    assert.match(document.querySelector('.flashcard-answer').textContent, /Polymorphism/);
    assert.match(document.querySelector('.dock-primary').textContent, /Next card/);
    assert.equal(document.querySelector('.flashcard-show-all-btn'), null, 'Show full bullets button disappears when all bullets shown');

    // Test toggle reveal mode button
    await click('.flashcard-toggle-reveal-mode');
    assert.equal(window.localStorage.getItem('remo-study-bullet-reveal'), 'all', 'Switched mode to all in localStorage');

    // Toggle back to 1-by-1
    await click('.flashcard-toggle-reveal-mode');
    assert.equal(window.localStorage.getItem('remo-study-bullet-reveal'), 'step', 'Switched mode back to step in localStorage');

    // Test tap interaction on the card to advance bullets
    const pointer = (target, type, x, y = 30) => {
      const e = new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
      Object.defineProperties(e, { pointerType: { value: 'touch' }, pointerId: { value: 1 }, isPrimary: { value: true } });
      target.dispatchEvent(e);
    };
    const tap = async (x, target = document.querySelector('.flashcard')) => act(async () => {
      document.querySelector('.flashcard').getBoundingClientRect = () => ({ left: 0, width: 800, top: 0, bottom: 500 });
      pointer(target, 'pointerdown', x);
      pointer(target, 'pointerup', x);
    });

    // Reset bullets to 1 by tapping previous bullet or setting
    await keyDown('ArrowUp');
    await keyDown('ArrowUp');
    assert.equal(document.querySelector('.flashcard-step-badge'),null);
    assert.equal(document.querySelector('[aria-label="Answer reveal progress"]').getAttribute('aria-valuenow'),'1');

    // Tap right side (x = 600 > 400) to advance bullet via tap
    await tap(600);
    assert.equal(document.querySelector('[aria-label="Answer reveal progress"]').getAttribute('aria-valuenow'),'2','Tap right side advances the progress circles');
    assert.match(document.querySelector('.flashcard-answer').textContent, /Inheritance/);

    // Tap right side again to advance to bullet 3
    await tap(600);
    assert.equal(document.querySelector('[aria-label="Answer reveal progress"]').getAttribute('aria-valuenow'),'3','Tap right side completes the progress circles');
    assert.match(document.querySelector('.flashcard-answer').textContent, /Polymorphism/);
  } finally {
    if (app) await act(async () => app.appRoot.unmount());
    dom.window.close();
  }
});
