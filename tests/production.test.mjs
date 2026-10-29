import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import "fake-indexeddb/auto";
import React, { act } from "react";

import { load } from "./.build/data.mjs";
import {readdir} from "node:fs/promises";
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
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
globalThis.ResizeObserver = undefined;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
HTMLElement.prototype.scrollTo = function ({ top = 0 }) {
  this.scrollTop = top;
};
// Layout-dependent widgets need a real container measurement; JSDOM reports 0.
Object.defineProperty(HTMLElement.prototype,'clientWidth',{configurable:true,get(){return 1040;}});
dom.window.HTMLDialogElement.prototype.showModal = undefined;
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
test("production bundle: interaction smoke test", async context => {
  context.after(async () => {
    await act(async () => window.dispatchEvent(new window.ErrorEvent('error', { error: new Error('Test cleanup'), message: 'Test cleanup' })));
    dom.window.close();
  });
  await act(async () => {
    const assets=await readdir("dist/assets");
    // Modules are imported from disk and JSDOM does not load styles. Mark the
    // local assets present so Vite does not attempt network preloads here.
    for(const file of assets.filter(f=>/\.(css|js)$/.test(f))){const link=document.createElement('link');link.rel=file.endsWith('.css')?'stylesheet':'preload';link.href='/assets/'+file;document.head.append(link);}
    const main=assets.find(f=>f.startsWith("index-")&&f.endsWith(".js"));await import("../dist/assets/"+main);
  });
  await wait(() => document.querySelector('.landing'));
  const hero = document.querySelector('.landing h1');
  assert.equal(hero.textContent, 'A space to think.A way to Remember More.');
  assert.equal(hero.querySelector('.landing-hero-line').textContent, 'A way to Remember More.');
  assert.equal(hero.querySelector('.landing-hero-emphasis').textContent, 'Remember More');
  assert.deepEqual([...hero.querySelectorAll('.landing-hero-blue')].map(node => node.textContent), ['Re', 'Mo'], 'Only Re and Mo should receive the #047EFC accent');
  assert.equal(hero.querySelectorAll('.landing-hero-blue').length, 2);
  assert.equal(document.querySelector('.landing-wordmark').getAttribute('aria-label'), 'RemoNook — Remember More');
  assert.equal(document.querySelector('.landing-wordmark').textContent, 'RemoNook');
  assert.equal(document.querySelector('.landing-wordmark .landing-brand-blue'), null, 'Animated wordmark should use one neutral text color');
  assert.ok(document.querySelector('.landing-flow').textContent.includes('Capture'));
  assert.ok(document.querySelector('.landing-flow').textContent.includes('Remember'));
  assert.match(document.querySelector('.landing-description').textContent, /flashcards?/);
  assert.equal(document.querySelector('.landing-preview').getAttribute('role'), 'region');
  for(const [domain,handle] of [['instagram.com','@RemoNook.hq'],['x.com','@RemoNookhq'],['youtube.com','@RemoNook']]){
    const anchor=[...document.querySelectorAll('.landing-footer-social a')].find(a=>new URL(a.href).hostname.includes(domain));
    assert.ok(anchor, `Missing ${domain} social link`);
    assert.ok(anchor.textContent.includes(handle), `Missing ${handle} display handle`);
    assert.ok(anchor.querySelector('svg[aria-hidden="true"]'), `Missing recognizable ${domain} SVG logo`);
    assert.ok(anchor.classList.contains('landing-social-link'), `Missing mobile-friendly social link style for ${domain}`);
    assert.equal(anchor.getAttribute('target'),'_blank');
    assert.match(anchor.getAttribute('rel'), /noopener/);
  }
  assert.equal(await load(),null,'The landing page does not create or overwrite guest notes');
  await click([...document.querySelectorAll('.landing-preview-bar button')].find(button=>button.textContent==='Flashcard'));
  await click(document.querySelector('.landing-demo-reveal-button'));
  assert.match(document.querySelector('.landing-demo-reveal').textContent,/finding patterns/);
  await click(document.querySelector('[data-guest-entry]'));
  await wait(() => document.querySelector(".page-heading"));
  assert.ok(document.querySelector('.sidebar-header .brand').textContent.includes('RemoNook'));
  assert.equal(document.querySelectorAll('.save-indicator').length,0,'The animated cloud control is removed');
  assert.ok(document.querySelector('.save-status'),'Save status remains accessible without a toolbar icon');
  // React may process a continuous-event updater after currentTarget is cleared.
  // Queue several real scroll events in one batch, then scroll back to the top.
  const outlineScroller = document.querySelector('.outline-scroll');
  assert.ok(document.querySelector('[data-node-id="welcome"]'));
  await act(async () => {
    for (const top of [180, 720, 1440, 2400]) {
      outlineScroller.scrollTop = top;
      outlineScroller.dispatchEvent(new window.Event('scroll', { bubbles: true }));
    }
  });
  assert.ok(!document.querySelector('.recovery-screen'), 'Repeated scrolling must not crash the outline');
  assert.ok(!document.querySelector('[data-node-id="welcome"]'), 'Virtualized rows follow the final scroll position');
  await act(async () => {
    for (const top of [1440, 720, 180, 0]) {
      outlineScroller.scrollTop = top;
      outlineScroller.dispatchEvent(new window.Event('scroll', { bubbles: true }));
    }
  });
  assert.ok(!document.querySelector('.recovery-screen'));
  assert.ok(document.querySelector('[data-node-id="welcome"]'), 'Scrolling back restores the first visible row');
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
  assert.equal(document.querySelector('[aria-label="Text formatting"]').hidden, true, "Empty bullets must not show formatting");
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
  await click(document.querySelector('[aria-label="Close dialog"]'));
  for (const button of [...document.querySelectorAll(".sidebar nav button")]) {
    await click(button);
    assert.ok(document.querySelector("main"));
    assert.equal(document.querySelector(".recovery-screen"), null);
  }
  const allMcqs = [...document.querySelectorAll('.study-deck')].find(deck => deck.querySelector('h2')?.textContent === 'All MCQs');
  assert.ok(allMcqs, 'The permanent All MCQs collection ships in production');
  await click([...allMcqs.querySelectorAll('button')].find(button => button.textContent === 'Limits'));
  assert.equal(document.querySelectorAll('.study-limits').length, 1, 'Shared budget data does not open multiple notebook panels');
  await click([...document.querySelectorAll(".sidebar-bottom button")].find(b => b.textContent === "Settings & backups"));
  assert.ok(document.querySelector("dialog[open]"));
  assert.equal(document.querySelector('.topbar [aria-label="Settings and backups"]'),null);
  assert.ok(document.querySelector('.settings-navigation [aria-current="page"]').textContent.includes('Appearance'));
  await click([...document.querySelectorAll('.settings-navigation button')].find(b=>b.textContent==='Backups'));
  assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent.includes('Download full backup')));
  assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent.includes('Restore from backup')));
  assert.equal(document.querySelector('.settings-folder'),null,'Folder autosync controls must not ship');
  assert.match(document.querySelector('[aria-label="Backups"]').textContent,/Existing RemoNook folder ZIPs were not deleted/);
  await click([...document.querySelectorAll('.settings-navigation button')].find(b=>b.textContent==='Account'));
  assert.ok([...document.querySelectorAll('button')].some(button=>button.textContent==='Sign in or create account'), 'Account entry ships in settings');
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  await click([...document.querySelectorAll('.cloud-account button')].find(button=>button.textContent==='Sign in or create account'));
  await wait(()=>document.querySelector('.account-access[open]'));
  assert.ok([...document.querySelectorAll('.account-access button')].some(button=>button.textContent==='Continue with Google'), 'Google sign-in remains available');
  assert.ok(document.querySelector('.account-access input[autocomplete=\"current-password\"]'), 'Email sign-in is available');
  await click(document.querySelector('[aria-label=\"Close sign-in\"]'));
  assert.match(document.querySelector('.cloud-account').textContent,/current notes stay in the device-only workspace/);
  await click(document.querySelector('[aria-label="Close dialog"]'));
  await act(async () => window.dispatchEvent(new window.ErrorEvent("error", { error: new Error("Regression diagnostic"), message: "Regression diagnostic" })));
  assert.match(document.querySelector(".recovery-screen").textContent, /Regression diagnostic/);
  assert.ok([...document.querySelectorAll("button")].some(b => b.textContent === "Download recovery backup"));
  assert.ok((await load()).tables.bullets.some(n => n.id === next));
  dom.window.close();
});
