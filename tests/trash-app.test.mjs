import { installOverlayGlobals } from "./dom-overlays.mjs";
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
    document.querySelector(".tiptap").dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: value,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );

test("Empty trash confirms once, persists atomically and keeps live notes and shared attachments", async () => {
  const live = bullet("live", { text: "Keep this note" }),
    a = bullet("deleted-a", { text: "Deleted A" }),
    b = bullet("deleted-b", { text: "Deleted B" }),
    media = (id, bulletId, fileName) => ({
      id,
      bulletId,
      fileName,
      mimeType: "image/png",
      sourceUrl: "",
      credit: "",
      licenseUrl: "",
    }),
    doc = withNodes(empty(), [live]);
  doc.tables.media = [media("shared-live", "live", "shared.png")];
  doc.tables.trash = [
    {
      id: "trash-a",
      title: "Deleted A",
      nodeCount: 1,
      deletedAt: Date.now(),
      payload: JSON.stringify({
        nodes: [a],
        media: [media("private", "deleted-a", "private.png")],
        decks: [],
      }),
    },
    {
      id: "trash-b",
      title: "Deleted B",
      nodeCount: 1,
      deletedAt: Date.now(),
      payload: JSON.stringify({
        nodes: [b],
        media: [media("shared-trash", "deleted-b", "shared.png")],
        decks: [],
      }),
    },
  ];
  await save(
    null,
    doc,
    "fixture",
    new Map([
      ["media/private.png", new Blob(["private"])],
      ["media/shared.png", new Blob(["shared"])],
    ]),
  );
  let app;
  const button = (text) =>
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === text,
      ),
    click = async (el) =>
      act(async () => {
        assert.ok(el);
        el.click();
      });
  try {
    await act(async () => {
      app = await import("./.build/app.mjs");
    });
    await wait(() => document.querySelector(".outline-row"));
    await click(
      [...document.querySelectorAll(".sidebar button")].find((b) =>
        b.textContent.trim().startsWith("Trash"),
      ),
    );
    await wait(() => button("Empty trash"));
    await click(button("Empty trash"));
    await wait(() => button("Empty trash permanently"));
    assert.match(
      document.querySelector("dialog").textContent,
      /2 selected deleted items/,
    );
    await click(button("Cancel"));
    assert.equal((await load()).tables.trash.length, 2);
    assert.ok((await getAssets()).has("media/private.png"));
    await click(button("Empty trash"));
    await click(button("Empty trash permanently"));
    await wait(() =>
      document.querySelector("dialog")?.textContent.includes("Trash is empty"),
    );
    const saved = await load();
    assert.equal(saved.tables.trash.length, 0);
    assert.equal(
      saved.tables.bullets.find((n) => n.id === "live").text,
      "Keep this note",
    );
    const assets = await getAssets();
    assert.equal(assets.has("media/private.png"), false);
    assert.equal(assets.has("media/shared.png"), true);
    assert.equal(button("Empty trash"), undefined);
  } finally {
    if (app) await act(async () => app.appRoot.unmount());
    dom.window.close();
  }
});
