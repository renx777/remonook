import {installOverlayGlobals} from './dom-overlays.mjs';
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import "fake-indexeddb/auto";
import { act } from "react";
import { empty, withNodes, save, load, getAssets } from "./.build/data.mjs";
import { bullet } from "../src/domain.mjs";

const dom = new JSDOM('<div id="root"></div>', {
  url: "http://localhost",
  pretendToBeVisual: true,
});
for (const key of [
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
  Object.defineProperty(globalThis, key, {
    value:
      key === "getComputedStyle"
        ? dom.window.getComputedStyle.bind(dom.window)
        : dom.window[key],
    configurable: true,
  });
installOverlayGlobals(dom);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = undefined;
globalThis.IntersectionObserver = class {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target) {
    this.callback([{ isIntersecting: true, target }]);
  }
  disconnect() {}
};
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.matchMedia = () => ({
  matches: true,
  addEventListener() {},
  removeEventListener() {},
});
HTMLElement.prototype.scrollTo = function ({ top = 0 }) {
  this.scrollTop = top;
};
dom.window.Range.prototype.getClientRects = () => [];
dom.window.Range.prototype.getBoundingClientRect = () => ({
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  width: 0,
  height: 0,
});
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
const wait = async (check) => {
  for (let i = 0; i < 150; i++) {
    if (check()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  }
  throw Error("Timed out waiting for inline emoji UI");
};
const key = async (value) =>
  act(async () =>
    document
      .querySelector(".tiptap")
      .dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: value,
          bubbles: true,
          cancelable: true,
        }),
      ),
  );

test("Workdays calendar saves plans, bulk changes, leave, holidays and policy without mutating notes", async () => {
  let doc = withNodes(empty(), [bullet("kept", { text: "Keep my notes" })]);
  await save(null, doc);
  let app;
  const click = async (selector) =>
    act(async () => {
      const el = document.querySelector(selector);
      assert.ok(el, selector);
      el.click();
    });
  const textClick = async (text) =>
    act(async () => {
      const el = [...document.querySelectorAll("button")].find(
        (el) => el.textContent.trim() === text,
      );
      assert.ok(el, text);
      el.click();
    });
  const change = async (selector, value) =>
    act(async () => {
      const el = document.querySelector(selector);
      assert.ok(el, selector);
      if (el.tagName === "SELECT") {
        el.value = value;
        el.dispatchEvent(new window.Event("change", { bubbles: true }));
      } else {
        const proto =
          el.tagName === "TEXTAREA"
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
        el.dispatchEvent(new window.Event("input", { bubbles: true }));
      }
    });
  const stored = async () => {
    await act(async () => new Promise((r) => setTimeout(r, 270)));
    return load();
  };
  try {
    await act(async()=>{app=await import('./.build/app.mjs');});
    await wait(()=>document.querySelector('.outline-row'));await textClick('Calendar');
    await click('.calendar-trackers-heading button');await click('[aria-label="Enable Workdays tracker"]');await click('[aria-label="Close daily tracker settings"]');
    await wait(()=>document.querySelector('.wd2-daily'));const initial=await stored(),notes=structuredClone(initial.tables.bullets);
    await click('[aria-label="Work from home"]');let state=await stored();assert.equal(state.web.workdays.version,2);const date=Object.keys(state.web.workdays.entries)[0];assert.equal(state.web.workdays.entries[date].actual.am.mode,'WFH');assert.deepEqual(state.tables.bullets,notes);
    await click('[aria-label="Take leave"]');await wait(()=>document.querySelector('[role="dialog"]'));const radios=[...document.querySelectorAll('input[name="leave-duration"]')];await act(async()=>radios[1].click());await textClick('Save leave');state=await stored();assert.equal(state.web.workdays.entries[date].actual.am.mode,'Leave');assert.equal(state.web.workdays.entries[date].actual.pm.mode,'WFH');
    await click('.cal2-work');await wait(()=>document.querySelector('.wd2-workspace'));assert.ok(document.querySelector('.wd2-cal'),'phone overview shows the month with its split');await act(async()=>[...document.querySelectorAll('[aria-label="Workdays views"] button')].find(b=>b.textContent==='Plan').click());await wait(()=>document.querySelector('.wd2-month'));
    const cell=[...document.querySelectorAll('.wd2-month button')].find(b=>b.getAttribute('aria-label').startsWith(date));await act(async()=>cell.click());await act(async()=>[...document.querySelectorAll('.wd2-bulk button')].find(b=>b.textContent==='Office').click());state=await stored();assert.equal(state.web.workdays.entries[date].actual.pm.mode,'WFO');
    await act(async()=>[...document.querySelectorAll('[aria-label="Workdays views"] button')].find(b=>b.textContent==='Leave').click());await wait(()=>document.querySelector('.wd2-add-type'));await change('.wd2-add-type input[placeholder="e.g. Medical leave"]','Medical leave');await act(async()=>document.querySelector('.wd2-add-type').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));state=await stored();assert.ok(Object.values(state.web.workdays.leaveTypes).some(t=>t.name==='Medical leave'));assert.deepEqual(state.tables.bullets,notes);
    await click('[aria-label="Close Workdays"]');await click('.calendar-trackers-heading button');await click('[aria-label="Enable Workdays tracker"]');await click('[aria-label="Close daily tracker settings"]');state=await stored();assert.equal(state.web.workdays.enabled,false);assert.equal(state.web.workdays.entries[date].actual.am.mode,'WFO');
  } finally {if(app)await act(async()=>app.appRoot.unmount());dom.window.close();}
});
