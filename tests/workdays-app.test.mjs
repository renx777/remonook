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
  const submit = async () =>
    act(async () =>
      document
        .querySelector(".wd-form")
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
  try {
    await act(async () => {
      app = await import("./.build/app.mjs");
    });
    await wait(() => document.querySelector(".outline-row"));
    await textClick("Calendar");
    await wait(()=>document.querySelector('.calendar-trackers'));await click('.calendar-trackers-heading button');await click('[aria-label="Enable Workdays tracker"]');await click('[aria-label="Close daily tracker settings"]');await click('.calendar-workdays-advanced summary');await wait(()=>document.querySelector('.workdays'));
    assert.equal(
      document
        .querySelector('[aria-label="Workdays layer"]')
        .getAttribute("aria-checked"),
      "true",
    );
    await textClick("Month");
    const initial = await stored(),
      nodes = structuredClone(initial.tables.bullets);
    await click('[aria-label="Next work month"]');
    const future = [...document.querySelectorAll(".wd-day:not(.outside)")]
      .map((e) => e.dataset.date)
      .filter((d) => ![0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay()));
    const [a, b, c] = future;
    await click(`[data-date="${a}"]`);
    await textClick("Plan WFO");
    let state = await stored();
    assert.equal(state.web.workdays.entries[a].plan.status, "WFO");
    assert.equal(state.web.workdays.entries[a].actual, undefined);
    await textClick("Select dates");
    await click(`[data-date="${a}"]`);
    await click(`[data-date="${b}"]`);
    await textClick("WFH");
    state = await stored();
    assert.equal(state.web.workdays.entries[a].plan.status, "WFH");
    assert.equal(state.web.workdays.entries[b].plan.status, "WFH");
    await textClick("Leave");
    await change('[aria-label="Leave type"]', "Annual");
    await submit();
    state = await stored();
    assert.equal(state.web.workdays.entries[a].plan.detail, "Annual");
    await click('[aria-label="Undo"]');
    state = await stored();
    assert.equal(state.web.workdays.entries[a].plan.status, "WFH");
    await textClick("Done selecting");
    await textClick("Import holidays");
    await change(
      '[aria-label="Holiday list"]',
      a + " Office closure\n" + c + " Festival",
    );
    await submit();
    assert.match(
      document.querySelector(".wd-form").textContent,
      /1 conflicting/,
    );
    await submit();
    state = await stored();
    assert.equal(state.web.workdays.entries[a].plan.status, "WFH");
    assert.equal(state.web.workdays.holidays[c], "Festival");
    await click('[aria-label="Workday settings"]');
    await change('[aria-label="Office goal type"]', "percentage");
    await change('[aria-label="Office goal value"]', "60");
    await change('[aria-label="Policy effective date"]', a.slice(0, 7) + "-01");
    await change('[aria-label="Sick leave allowance"]', "8");
    await submit();
    state = await stored();
    assert.equal(state.web.workdays.policies.at(-1).goalValue, 60);
    assert.equal(state.web.workdays.allowances[a.slice(0, 4)].Sick, 8);
    assert.deepEqual(
      state.tables.bullets,
      nodes,
      "Workday operations and navigation do not add or alter notes",
    );
    assert.equal(state.web.workdays.view, "month");
    await click('[aria-label="Workdays layer"]');
    state = await stored();
    assert.equal(state.web.workdays.enabled, false);
    assert.equal(
      state.web.workdays.holidays[c],
      "Festival",
      "Turning the layer off preserves records",
    );
  } finally {
    if (app) await act(async () => app.appRoot.unmount());
    dom.window.close();
  }
});
