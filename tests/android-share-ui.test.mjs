import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import "fake-indexeddb/auto";
const dom = new JSDOM('<div id="root"></div>', {
  url: "http://localhost",
  pretendToBeVisual: true,
});
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLDialogElement",
  "HTMLTextAreaElement",
  "localStorage",
  "getComputedStyle",
])
  Object.defineProperty(globalThis, key, {
    value:
      key === "getComputedStyle"
        ? dom.window.getComputedStyle.bind(dom.window)
        : dom.window[key],
    configurable: true,
  });
Object.defineProperty(navigator, "userAgent", {
  value: "Android RemoNook",
  configurable: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false });
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
const { createRoot } = await import("react-dom/client");
const {
  IncomingAndroidShare,
  empty,
  setStorageAccount,
  storageAccountKey,
  incomingShare,
} = await import("./.build/android-share-harness.mjs");
const original = {
  schema: 1,
  id: "435e46bf-52eb-46d3-93bb-587c334040a6",
  text: "Shared paragraph\n\nKeep this line.",
  subject: "A source",
  receivedAt: 1700000000000,
};
let queue = [],
  acks = 0;
window.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    if (cmd === "android_share_inbox") return structuredClone(queue);
    if (cmd === "android_share_claim") return;
    if (cmd === "android_share_ack") {
      acks++;
      queue = queue.filter((v) => v.id !== args.id);
      return;
    }
    throw Error(cmd);
  },
};
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    await act(() => new Promise((r) => setTimeout(r, 0)));
    if (fn()) return;
  }
  assert.fail("Share preview did not settle");
}
const button = (text) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === text);
test.beforeEach(() => {
  localStorage.clear();
  setStorageAccount(null);
  queue = [{ ...original }];
  acks = 0;
});
test.after(() => dom.window.close());
test("guest capture waits for successful saving, serializes repeated clicks and archives only afterwards", async () => {
  const root = createRoot(document.getElementById("root"));
  let doc = empty(),
    calls = 0,
    finish;
  try {
    await act(async () =>
      root.render(
        React.createElement(IncomingAndroidShare, {
          ready: true,
          onSave: async (entry, text, kind, scope) => {
            calls++;
            assert.equal(scope, storageAccountKey());
            doc = incomingShare(doc, entry, text, kind).doc;
            await new Promise((r) => (finish = r));
          },
        }),
      ),
    );
    await until(() => button("Save"));
    assert.equal(
      document.querySelector("textarea").value,
      "A source\n\n" + original.text,
    );
    assert.equal(calls, 0);
    await act(async () => {
      button("Save").click();
      button("Save")?.click();
    });
    assert.equal(calls, 1);
    assert.equal(acks, 0);
    await act(async () => finish());
    await until(() => acks === 1);
    assert.equal(
      doc.tables.bullets.filter((n) => n.parentId === "quick-capture-inbox")
        .length,
      1,
    );
    assert.equal(document.querySelector("dialog"), null);
  } finally {
    await act(async () => root.unmount());
  }
});
test("a failed save retains the native share and retries the same canonical capture without duplication", async () => {
  const root = createRoot(document.getElementById("root"));
  let doc = empty(),
    fail = true;
  const save = async (entry, text, kind) => {
    doc = incomingShare(doc, entry, text, kind).doc;
    if (fail)
      throw Object.assign(Error("Storage full; original retained"), {
        captureApplied: true,
      });
  };
  try {
    await act(async () =>
      root.render(
        React.createElement(IncomingAndroidShare, {
          ready: true,
          onSave: save,
        }),
      ),
    );
    await until(() => button("Save"));
    await act(async () => button("Save").click());
    await until(() => button("Retry saving"));
    assert.equal(acks, 0);
    assert.equal(queue.length, 1);
    assert.equal(document.querySelector("textarea").disabled, true);
    await act(async () => button("Later").click());
    await act(async () => button("Resume incoming share").click());
    fail = false;
    await act(async () => button("Retry saving").click());
    await until(() => acks === 1);
    assert.equal(
      doc.tables.bullets.filter((n) => n.parentId === "quick-capture-inbox")
        .length,
      1,
    );
  } finally {
    await act(async () => root.unmount());
  }
});
test("switching account while reviewing a share hides its text and disables insertion", async () => {
  const root = createRoot(document.getElementById("root"));
  let calls = 0;
  const props = {
    ready: true,
    onSave: async () => {
      calls++;
    },
  };
  try {
    setStorageAccount("account-a");
    await act(async () =>
      root.render(React.createElement(IncomingAndroidShare, props)),
    );
    await until(() => button("Save"));
    setStorageAccount("account-b");
    await act(async () =>
      root.render(React.createElement(IncomingAndroidShare, props)),
    );
    assert.equal(document.querySelector("textarea"), null);
    assert.equal(button("Save").disabled, true);
    assert.equal(calls, 0);
    assert.equal(acks, 0);
    assert.equal(queue.length, 1);
  } finally {
    await act(async () => root.unmount());
  }
});
