import {installOverlayGlobals} from './dom-overlays.mjs';
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import "fake-indexeddb/auto";
import React, { act } from "react";
import { load } from "./.build/data.mjs";
import { builtinEmojis } from '../src/emoji-builtins.mjs';
import { gzipSync } from 'node:zlib';
const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: "http://localhost/", pretendToBeVisual: true },
);
for (const k of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "Node",
  "DOMParser",
  "MutationObserver",
  "getComputedStyle",
])
  Object.defineProperty(globalThis, k, {
    value:
      typeof dom.window[k] === "function" && k === "getComputedStyle"
        ? dom.window[k].bind(dom.window)
        : dom.window[k],
    configurable: true,
  });
installOverlayGlobals(dom);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
class PointerEvent extends dom.window.MouseEvent {
  constructor(type, init = {}) {
    super(type, init);
    this.pointerId = init.pointerId || 1;
    this.width = init.width || 1;
    this.height = init.height || 1;
    this.pressure = init.pressure || 0;
  }
}
window.PointerEvent = dom.window.PointerEvent = globalThis.PointerEvent = PointerEvent;
window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
HTMLElement.prototype.scrollIntoView=function(){};
HTMLElement.prototype.scrollTo = function ({ top = 0 }) {
  this.scrollTop = top;
};
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
// React DOM must detect input support after the jsdom document exists.
const { createRoot } = await import("react-dom/client");
const wait = async (check) => {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
  }
  throw Error("Timed out waiting for DOM state");
};
const click = async (el) => {
  assert.ok(el);
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
};
test("DOM integration: blank persistence, keyboard split, nesting, undo and Trash restore", async t => {
  let app, currentRoot;
  t.after(async () => { if (currentRoot) await act(async () => currentRoot.unmount()); dom.window.close(); });
  await act(async () => {
    app = await import("./.build/app.mjs"); currentRoot = app.appRoot;
  });
  await wait(() => document.querySelector(".page-heading"));
  await click(
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Add bullet",
    ),
  );
  await wait(() => document.querySelector(".tiptap"));
  const row = document.querySelector(".outline-row.selected"),
    id = row.dataset.nodeId;
  assert.equal(row.querySelector(".tiptap").textContent, "");
  await act(async () => {
    document
      .querySelector(".tiptap")
      .dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
  });
  await wait(
    () => document.querySelector(".outline-row.selected").dataset.nodeId !== id,
  );
  const next = document.querySelector(".outline-row.selected").dataset.nodeId;
  assert.equal(document.querySelector('[aria-label="Text formatting"]').hidden, true, "A caret must not show formatting");
  await act(async () => {
    document.querySelector(".tiptap").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });
  let stored = await load();
  assert.equal(stored.tables.bullets.find((n) => n.id === next).parentId, id);
  assert.equal(stored.tables.bullets.find((n) => n.id === id).text, "");
  await click(document.querySelector('[aria-label="Undo"]'));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });
  stored = await load();
  assert.equal(stored.tables.bullets.find((n) => n.id === next).parentId, null);
  await click(
    document.querySelector(
      `[data-node-id="${next}"] [aria-label="Bullet actions"]`,
    ),
  );
  await click(
    [...document.querySelectorAll("dialog button")].find(
      (b) => b.textContent === "Move branch to Trash",
    ),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });
  stored = await load();
  assert.equal(stored.tables.trash.length, 1);
  assert.ok(!stored.tables.bullets.some((n) => n.id === next));
  await click(
    [...document.querySelectorAll(".sidebar-bottom button")].find(
      (b) => b.textContent === "Trash1",
    ),
  );
  await click(
    [...document.querySelectorAll("dialog button")].find(
      (b) => b.textContent === "Restore",
    ),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });
  stored = await load();
  assert.equal(stored.tables.trash.length, 0);
  assert.ok(stored.tables.bullets.some((n) => n.id === next));
  await act(async () => app.appRoot.unmount());
  document.getElementById("root").innerHTML = "";
  const root = currentRoot = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(app.App)));
  await wait(() => document.querySelector(".page-heading"));
  assert.ok(document.querySelector(`[data-node-id="${id}"]`));
  assert.ok(document.querySelector(`[data-node-id="${next}"]`));
  const sidebar = document.querySelector(".sidebar");
  assert.ok(sidebar);
  assert.ok(!sidebar.classList.contains("collapsed"));
  const collapseBtn = document.querySelector(".sidebar .sidebar-toggle-btn");
  assert.ok(collapseBtn);
  await click(collapseBtn);
  assert.ok(sidebar.classList.contains("collapsed"));
  const expandBtn = document.querySelector(".topbar .sidebar-toggle-btn");
  assert.ok(expandBtn);
  await click(expandBtn);
  assert.ok(!sidebar.classList.contains("collapsed"));

  // Calendar View Integration
  const calendarTabBtn = [...document.querySelectorAll(".sidebar nav button")].find(
    (b) => b.textContent.includes("Calendar"),
  );
  assert.ok(calendarTabBtn);
  await click(calendarTabBtn);
  await wait(() => document.querySelector(".calendar-view"));
  assert.ok(document.querySelector(".calendar-date-pill"));
  assert.ok(document.querySelector(".calendar-strip-container"));

  // Popover toggle
  const datePill = document.querySelector(".calendar-date-pill");
  await click(datePill);
  assert.ok(document.querySelector(".calendar-popover"));
  await click(datePill);
  assert.equal(document.querySelector(".calendar-popover"), null);

  // The daily view is immediately editable, without a placeholder click or
  // a second editable date heading.
  await wait(() => document.querySelector(".calendar-notes-section .tiptap"));
  assert.ok(document.querySelector(".calendar-notes-section .tiptap"));
  assert.equal(document.querySelector(".calendar-notes-section .zoomed-title-input"), null);
  const firstDailyId = document.querySelector(".calendar-notes-section .outline-row.selected").dataset.nodeId;
  for (const [key, shiftKey] of [["Backspace", false], ["Tab", true], ["Enter", false], ["ArrowUp", false]]) {
    await act(async () => document.querySelector(".calendar-notes-section .tiptap").dispatchEvent(new window.KeyboardEvent("keydown", { key, shiftKey, bubbles: true })));
    assert.equal(document.querySelector(".calendar-notes-section .outline-row.selected").dataset.nodeId, firstDailyId);
  }
  await click(document.querySelector(".calendar-notes-section [aria-label='Add bullet']"));
  const secondDailyId = document.querySelector(".calendar-notes-section .outline-row.selected").dataset.nodeId;
  assert.notEqual(secondDailyId, firstDailyId);
  await act(async () => { await new Promise(r => setTimeout(r, 250)); });
  stored = await load();
  const firstDaily = stored.tables.bullets.find(n => n.id === firstDailyId);
  assert.match(firstDaily.parentId, /^journal-\d{4}-\d{2}-\d{2}$/);
  assert.equal(stored.tables.bullets.find(n => n.id === secondDailyId).parentId, firstDaily.parentId);
  assert.equal(stored.tables.bullets.find(n => n.id === secondDailyId).position, 1);

  // Year picker popover
  const yearShortcutBtn = document.querySelector(".shortcut-year-btn");
  assert.ok(yearShortcutBtn);
  await click(yearShortcutBtn);
  assert.ok(document.querySelector(".calendar-year-grid"));
  const yearCells = document.querySelectorAll(".calendar-year-cell");
  assert.ok(yearCells.length >= 12);
  await click(datePill); // close popover

  await click([...document.querySelectorAll('.breadcrumbs button')].find(b => b.textContent === 'Calendar'));
  await wait(() => document.querySelector('.zoomed-title-input'));
  assert.equal(document.querySelector('.zoomed-title-input').value, '🗓️ Calendar');
  await click(document.querySelector('.topbar [aria-label="Go to parent"]'));

  // Switch back to Notes tab
  const notesTabBtn = [...document.querySelectorAll(".sidebar nav button")].find(
    (b) => b.textContent.includes("Notes"),
  );
  await click(notesTabBtn);
  await wait(() => document.querySelector(`[data-node-id="${id}"]`));
  assert.ok(document.querySelector(`[data-node-id="${id}"]`));

  // Verify calendar hierarchy in stored bullets
  stored = await load();
  const calRootNode = stored.tables.bullets.find((n) => n.text === "🗓️ Calendar");
  assert.ok(calRootNode, "Calendar root node must exist");
  const yearNodes = stored.tables.bullets.filter((n) => n.parentId === calRootNode.id);
  assert.ok(yearNodes.length > 0, "Year subnode must exist under Calendar");
  const monthNodes = stored.tables.bullets.filter((n) => n.parentId === yearNodes[0].id);
  assert.ok(monthNodes.length > 0, "Month subnode must exist under Year");
  const dayNodes = stored.tables.bullets.filter((n) => n.parentId === monthNodes[0].id);
  assert.ok(dayNodes.length > 0, "Day subnode must exist under Month");
  const bulletsUnderDay = stored.tables.bullets.filter((n) => n.parentId === dayNodes[0].id);
  assert.ok(bulletsUnderDay.length > 0, "Bullets must exist under Day node");

  // Zoom into node and test plus button
  const zoomTargetRow = document.querySelector('[data-node-id="welcome"]');
  assert.ok(zoomTargetRow, "welcome node row must exist");
  const zoomBtn = zoomTargetRow.querySelector('.bullet-dot-btn');
  await click(zoomBtn);
  await wait(() => document.querySelector(".zoomed-header"));
  assert.ok(document.querySelector(".zoomed-title"));
  const zoomedPlus = document.querySelector(".zoomed-plus-btn");
  assert.ok(zoomedPlus);
  await click(zoomedPlus);
  await wait(() => document.querySelector(".outline-row.selected"));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });
  stored = await load();
  const addedChild = stored.tables.bullets.find((n) => n.parentId === "welcome" && n.text === "");
  assert.ok(addedChild, "Bullet must be created under zoomed node via plus button");

  // Zoom into a node with no children (first time) and test clicking anywhere on screen
  const emptyChildRow = document.querySelector(`[data-node-id="${addedChild.id}"]`);
  assert.ok(emptyChildRow);
  await click(emptyChildRow.querySelector('.bullet-dot-btn'));
  await wait(() => document.querySelector(".zoomed-empty-screen-hint"));
  // Click on the empty screen canvas
  const canvas = document.querySelector(".outline-canvas");
  await click(canvas);
  await wait(() => document.querySelector(".outline-row.selected"));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });
  stored = await load();
  const childOfEmpty = stored.tables.bullets.find((n) => n.parentId === addedChild.id);
  assert.ok(childOfEmpty, "Bullet must be created by clicking anywhere on screen when zoomed in for the first time");

  // Verify plus button is in outline-add-row at n+1 position, not in zoomed-header
  assert.equal(document.querySelector(".zoomed-header .zoomed-plus-btn"), null);
  const addRow = document.querySelector(".outline-add-row");
  assert.ok(addRow, "outline-add-row must exist at n+1 position");
  assert.ok(addRow.querySelector(".zoomed-plus-btn"));

  // Verify that clicking canvas when bullets already exist does NOT create another bullet
  const countBefore = stored.tables.bullets.length;
  await click(canvas);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });
  stored = await load();
  assert.equal(stored.tables.bullets.length, countBefore, "Subsequent clicks on canvas must not create bullets when bullets exist");

  // Verify search bar is in nav bar (.topbar) and not in page body
  assert.ok(document.querySelector(".topbar .topbar-search"));
  assert.equal(document.querySelector(".outline-tools"), null);

  // Verify empty bullets do not display text "Empty bullet"
  const emptyBulletSpan = document.querySelector(".empty-bullet");
  if (emptyBulletSpan) {
    assert.equal(emptyBulletSpan.textContent, "");
  }

  // Verify outline-row at depth 0 has paddingLeft 0px (aligns with title)
  const depth0Row = document.querySelector(".outline-row");
  if (depth0Row) {
    assert.equal(depth0Row.style.paddingLeft, "0px");
  }

  // Verify zoomed title is editable input
  const zoomedTitleInput = document.querySelector(".zoomed-title-input");
  assert.ok(zoomedTitleInput);
  assert.equal(zoomedTitleInput.tagName.toLowerCase(), "input");

  // Verify expanded bullet does not display outer circle (has is-expanded, not outer-blue / outer-slate)
  const expandedBullet = document.querySelector(".bullet-dot-btn.has-children.is-expanded");
  if (expandedBullet) {
    assert.ok(!expandedBullet.classList.contains("outer-blue"));
    assert.ok(!expandedBullet.classList.contains("outer-slate"));
  }

  // Verify selected bullet does not display outer circle
  const selectedBullet = document.querySelector(".outline-row.selected .bullet-dot-btn");
  if (selectedBullet) {
    assert.ok(!selectedBullet.classList.contains("outer-blue"));
  }

  // --- Multi-bullet Click & Drag Selection and Backspace Deletion ---
  // Switch back to root Notes view
  const myNotesNavBtn = [...document.querySelectorAll(".breadcrumbs button")].find(
    (b) => b.textContent.includes("My notes"),
  );
  assert.ok(myNotesNavBtn);
  await click(myNotesNavBtn);
  await wait(() => document.querySelectorAll(".outline-row").length >= 2);

  // Sidebar navigation and starred shortcuts operate on the existing outline.
  const collapsedWelcome = document.querySelector('[aria-label="Expand Welcome to RemoNook in sidebar"]');
  if (collapsedWelcome) await click(collapsedWelcome);
  assert.ok(document.querySelector('[aria-label="Notes tree"] [aria-level="2"]'));
  await click(document.querySelector('[data-node-id="welcome"] [aria-label="Bullet actions"]'));
  assert.ok(document.querySelector('.outline-popover[open]'));
  await click([...document.querySelectorAll('.outline-popover button')].find(button => button.textContent === 'Star'));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  assert.ok((await load()).web.starredNodes.includes('welcome'));
  const starredShortcut = document.querySelector('.outline-sidebar > button');
  assert.equal(starredShortcut.textContent, 'Welcome to RemoNook');
  await click(starredShortcut);
  assert.equal(document.querySelector('.zoomed-title-input').value, 'Welcome to RemoNook');

  // Quick jump is keyboard-accessible and opens a selected result without editing it.
  await act(async () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true })));
  assert.ok(document.querySelector('[cmdk-input]'));
  assert.ok(document.activeElement === document.querySelector('[cmdk-input]'), 'Quick jump receives keyboard focus');
  await click([...document.querySelectorAll('[cmdk-item]')].find(button => button.textContent.includes('Ideas')));
  await wait(()=>document.querySelector('.zoomed-title-input')?.value==='Ideas'&&!document.querySelector('[cmdk-input]'));
  assert.equal(document.querySelector('[cmdk-input]'), null);
  await click([...document.querySelectorAll('.breadcrumbs button')].find(button => button.textContent.includes('My notes')));

  // Explicit questions, local images, and study sessions use the same saved workspace.
  await click(document.querySelector('[data-node-id="welcome"] [aria-label="Bullet actions"]'));
  await click(document.querySelector('[data-category="1"]'));
  await click([...document.querySelectorAll('.outline-popover button')].find(button => button.textContent === 'Insert animated emoji…'));
  await click([...document.querySelectorAll('.emoji-sources button')].find(button => button.textContent === 'RemoNook'));
  assert.equal(document.querySelectorAll('.emoji-grid button').length, 4);
  await click(document.querySelector('[aria-label="Insert Smile"]'));
  assert.ok(document.querySelector('[data-node-id="welcome"] [data-emoji-token=":remo_smile:"]'));
  await click(document.querySelector('[aria-label="Undo"]'));
  assert.ok(!document.querySelector('[data-node-id="welcome"] [data-emoji-token=":remo_smile:"]'));
  await click(document.querySelector('[aria-label="Redo"]'));
  assert.ok(document.querySelector('[data-node-id="welcome"] [data-emoji-token=":remo_smile:"]'));
  await click(document.querySelector('[data-node-id="welcome"] [aria-label="Bullet actions"]'));
  await click(document.querySelector('[data-category="1"]'));
  await click([...document.querySelectorAll('.outline-popover button')].find(button => button.textContent === 'Insert animated emoji…'));
  const emojiInput = document.querySelector('[aria-label="Import animated emoji files"]');
  Object.defineProperty(emojiInput, 'files', { configurable: true, value: [new File(['not-json'], 'broken.json', { type: 'application/json' })] });
  await act(async () => emojiInput.dispatchEvent(new window.Event('change', { bubbles: true })));
  await wait(() => document.querySelector('.emoji-import-error'));
  assert.match(document.querySelector('.emoji-import-error').textContent, /valid Lottie/);
  assert.ok(!document.querySelector('.error-banner'), 'A bad import must not pause workspace saving');
  Object.defineProperty(emojiInput, 'files', { configurable: true, value: [new File([gzipSync(JSON.stringify(builtinEmojis[0].data))], 'Orbit.tgs', { type: 'application/gzip' })] });
  await act(async () => emojiInput.dispatchEvent(new window.Event('change', { bubbles: true })));
  await wait(() => document.querySelector('[aria-label="Insert Orbit"]'));
  await click(document.querySelector('[aria-label="Insert Orbit"]'));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  stored = await load();
  assert.equal(stored.tables.emojis.length, 2);
  assert.ok(stored.tables.bullets.find(node => node.id === 'welcome').text.includes(stored.tables.emojis[1].token));
  assert.ok((await (await import('./.build/data.mjs')).getAssets()).has('emoji/' + stored.tables.emojis[1].fileName));

  await click(document.querySelector('[data-node-id="welcome"] [aria-label="Bullet actions"]'));
  await click(document.querySelector('[data-category="0"]'));
  await click([...document.querySelectorAll('.outline-popover button')].find(button => button.textContent === 'Turn into question'));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  stored = await load();
  assert.ok(stored.tables.cards.some(card => card.id === 'welcome' && card.state === 'ACTIVE'));
  await click(document.querySelector('[data-node-id="welcome-1"] [aria-label="Bullet actions"]'));
  const imageInput = document.querySelector('[aria-label="Choose images for bullet"]');
  // Files are selected by the browser's file picker; inject its result in jsdom.
  await click(document.querySelector('[data-category="1"]'));
  await click([...document.querySelectorAll('.outline-popover button')].find(button => button.textContent === 'Add images…'));
  Object.defineProperty(imageInput, 'files', { configurable: true, value: [new File(['<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>'], 'diagram.svg', { type: 'image/svg+xml' })] });
  await act(async () => imageInput.dispatchEvent(new window.Event('change', { bubbles: true })));
  await wait(() => document.querySelector('.note-image img'));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  stored = await load();
  assert.equal(stored.tables.media.length, 1);
  assert.equal(stored.tables.media[0].mimeType, 'image/svg+xml');
  const { getAssets } = await import('./.build/data.mjs');
  assert.ok((await getAssets()).has('media/' + stored.tables.media[0].fileName));
  await click([...document.querySelectorAll('.sidebar nav button')].find(button => button.textContent.includes('Study Desk')));
  assert.ok(document.querySelector('.study-desk'));
  assert.ok(document.querySelector('.deck-artwork'), 'Decks have notebook covers');
  await click(document.querySelector('[aria-label="Customize All flashcards cover"]'));
  await wait(() => document.querySelector('.cover-designer[open]'));
  await click(document.querySelector('[aria-label="Sage cover"]'));
  await click([...document.querySelectorAll('.cover-textures button')].find(button => button.textContent === 'Dots'));
  await click(document.querySelector('.cover-background-toggle input'));
  assert.ok(document.querySelector('.cover-live-preview .cover-pattern-dots'), 'Cover previews update before saving');
  await click([...document.querySelectorAll('.cover-designer-footer button')].find(button => button.textContent === 'Apply design'));
  await wait(() => !document.querySelector('.cover-designer'));
  stored = await load();
  assert.equal(stored.web.deckDesigns.__all__.preset, 'sage');
  assert.equal(stored.web.deckDesigns.__all__.pattern, 'dots');
  assert.equal(stored.web.deckDesigns.__all__.backdrop, true);
  await click(document.querySelector('[aria-label="Pin All flashcards notebook"]'));
  assert.equal(document.querySelector('[aria-label="Unpin All flashcards notebook"]').getAttribute('aria-pressed'), 'true');
  await click([...document.querySelectorAll('.study-mode-switch button')].find(button => button.textContent === 'Cram'));
  await click(document.querySelector('.study-deck .study-primary'));
  assert.ok(document.querySelector('.flashcard-question'));
  assert.equal(document.querySelector('.flashcard-answer'), null);
  const cardIdBeforeZoom = document.querySelector('.flashcard-question').textContent;
  await click(document.querySelector('[aria-label="Zoom in study card"]'));
  assert.equal(document.querySelector('.study-zoom-reset').textContent, '110%');
  assert.equal(window.localStorage.getItem('remo-study-card-zoom'), '110');
  assert.equal(document.querySelector('.study-session').style.getPropertyValue('--study-card-zoom'), '1.1');
  assert.equal(document.querySelector('.flashcard-question').textContent, cardIdBeforeZoom);
  assert.equal(document.querySelector('.flashcard-answer'), null, 'Resizing does not reveal or grade a card');
  for (let i = 0; i < 10; i++) await click(document.querySelector('[aria-label="Zoom out study card"]'));
  assert.equal(document.querySelector('.study-zoom-reset').textContent, '70%');
  assert.equal(document.querySelector('[aria-label="Zoom out study card"]').disabled, true);
  await click(document.querySelector('.study-zoom-reset'));
  assert.equal(document.querySelector('.study-zoom-reset').textContent, '100%');
  // Fullscreen is presentation-only: entering/exiting never grades or advances.
  let fullscreenElement = null;
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement });
  HTMLElement.prototype.requestFullscreen = async function () {
    fullscreenElement = this;
    document.dispatchEvent(new window.Event('fullscreenchange'));
  };
  document.exitFullscreen = async () => {
    fullscreenElement = null;
    document.dispatchEvent(new window.Event('fullscreenchange'));
  };
  const enterImmersive = () => document.querySelector('[aria-label="Enter immersive mode"]');
  await click(enterImmersive());
  assert.ok(fullscreenElement === document.querySelector('.study-session'), 'The study session owns fullscreen');
  assert.equal(document.querySelector('.study-session').getAttribute('aria-modal'), 'true');
  assert.equal(sidebar.inert, true, 'Background navigation is inaccessible in focus view');
  assert.ok(document.activeElement === document.querySelector('.study-dock-main button'), 'Primary study control receives focus');
  await act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true })));
  assert.equal(document.querySelector('[cmdk-input]'), null, 'Background quick-jump stays inactive in immersive mode');
  await act(async () => document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(fullscreenElement, null);
  assert.ok(!document.querySelector('.study-session').classList.contains('is-immersive'));
  assert.ok(!sidebar.inert);
  assert.equal(document.querySelector('.flashcard-answer'), null);
  // Browser-native Escape/fullscreenchange also leaves the session intact.
  await click(enterImmersive());
  await act(async () => document.exitFullscreen());
  await act(async () => document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.ok(document.querySelector('.study-session'), 'Native fullscreen exit must not also pause the session');
  // Browsers that reject fullscreen still provide a reversible focus overlay.
  HTMLElement.prototype.requestFullscreen = async () => { throw new Error('Fullscreen unavailable'); };
  await click(enterImmersive());
  assert.ok(document.querySelector('.study-session.is-immersive'));
  assert.match(document.querySelector('.fullscreen-notice').textContent, /couldn’t enter fullscreen/);
  await click(document.querySelector('[aria-label="Exit immersive mode"]'));
  assert.equal(document.querySelector('.fullscreen-notice'), null);
  assert.ok(!sidebar.inert);
  await click(document.querySelector('.session-controls > button'));
  assert.ok(document.querySelector('.study-desk'));
  await click(document.querySelector('.immersive-preference input'));
  HTMLElement.prototype.requestFullscreen = async function () {
    fullscreenElement = this;
    document.dispatchEvent(new window.Event('fullscreenchange'));
  };
  await click(document.querySelector('.study-resume button'));
  assert.ok(document.querySelector('.study-session.is-immersive'), 'Resume honors the immersive-start preference');
  assert.ok(fullscreenElement === document.querySelector('.study-session'), 'The study session owns fullscreen');
  await click(document.querySelector('[aria-label="Exit immersive mode"]'));
  const revealButton = document.querySelector('.study-dock-main button');
  assert.ok(revealButton.closest('.study-action-dock'));
  await click([...document.querySelectorAll('.reveal-actions button')][0]);
  assert.ok(document.querySelector('.flashcard-answer .note-image img'));
  assert.ok(document.querySelector('.cram-actions button') === revealButton, 'Reveal and next share the same stable button');
  assert.equal(document.querySelector('.study-action-dock .flashcard-answer'), null, 'Answer content scrolls independently of the controls');
  if (document.querySelector('.flashcard-show-all-btn')) await click(document.querySelector('.flashcard-show-all-btn'));
  const scheduleBefore = stored.tables.cards.find(card => card.id === 'welcome').dueAtEpochMillis;
  await click(document.querySelector('.cram-actions button'));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  stored = await load();
  assert.equal(stored.tables.cards.find(card => card.id === 'welcome').dueAtEpochMillis, scheduleBefore);
  assert.equal(stored.tables.review_logs.at(-1).mode, 'NORMAL');
  assert.equal(stored.tables.study_sessions.at(-1).reviewed, 1);
  await click(document.querySelector('.session-controls > button'));
  await click([...document.querySelectorAll('.study-mode-switch button')].find(button => button.textContent === 'Spaced repetition'));
  await click(document.querySelector('.study-deck .study-primary'));
  assert.ok(document.querySelector('.study-session.is-immersive'));
  await click(document.querySelector('.study-dock-main button'));
  if (document.querySelector('.flashcard-show-all-btn')) await click(document.querySelector('.flashcard-show-all-btn'));
  assert.equal(document.querySelectorAll('.study-action-dock .study-grades button').length, 4);
  assert.ok(document.activeElement === document.querySelector('.grade-again'), 'Focus moves to the rating controls after reveal');
  await click([...document.querySelectorAll('.flashcard-label button')].find(button => button.textContent.includes('Open source')));
  assert.equal(fullscreenElement, null, 'Opening the source safely leaves fullscreen');
  assert.ok(!sidebar.inert);
  await click([...document.querySelectorAll('.breadcrumbs button')].find(button => button.textContent.includes('My notes')));

  const canvasEl = document.querySelector(".outline-canvas");
  assert.ok(canvasEl, "outline-canvas must exist");
  const initialRows = document.querySelectorAll(".outline-row");
  assert.ok(initialRows.length >= 2, "There must be at least 2 rows to multi-select");

  // Simulate drag across first 2 rows
  await act(async () => {
    canvasEl.dispatchEvent(new window.PointerEvent("pointerdown", {
      clientX: 50,
      clientY: 10,
      button: 0,
      bubbles: true,
    }));
    window.dispatchEvent(new window.PointerEvent("pointermove", {
      clientX: 50,
      clientY: 120,
      bubbles: true,
    }));
    window.dispatchEvent(new window.PointerEvent("pointerup", {
      clientX: 50,
      clientY: 120,
      bubbles: true,
    }));
  });

  await wait(() => document.querySelectorAll(".outline-row.is-multi-selected").length >= 2);
  const multiSelected = document.querySelectorAll(".outline-row.is-multi-selected");
  assert.ok(multiSelected.length >= 2, "Multiple rows must be selected by drag");
  assert.ok(document.querySelector(".selection-action-bar"), "Selection action bar must appear");

  const deletedIds = Array.from(multiSelected).map((el) => el.dataset.nodeId);

  // Pressing Backspace while multiple bullets are selected should delete them
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", {
      key: "Backspace",
      bubbles: true,
    }));
  });

  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });

  // Verify deleted bullets are no longer in the DOM
  for (const deletedId of deletedIds) {
    assert.equal(document.querySelector(`[data-node-id="${deletedId}"]`), null, `Bullet ${deletedId} must be deleted`);
  }

  // Verify bullets are archived in trash
  stored = await load();
  for (const deletedId of deletedIds) {
    assert.ok(!stored.tables.bullets.some((n) => n.id === deletedId), `Bullet ${deletedId} must be removed from stored bullets`);
  }
  assert.ok(stored.tables.trash.length > 0, "Deleted bullets must be moved to Trash");

  // Pressing Ctrl+Z should undo the multi-delete
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
    }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });

  // Verify restored
  stored = await load();
  for (const deletedId of deletedIds) {
    assert.ok(stored.tables.bullets.some((n) => n.id === deletedId), `Bullet ${deletedId} must be restored on undo`);
  }

  await act(async () => root.unmount()); currentRoot = undefined;
  dom.window.close();
});
