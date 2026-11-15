import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import "fake-indexeddb/auto";
import { bullet, refreshCards } from "../src/domain.mjs";
import { createWidgetSnapshot } from "../src/study-widget.mjs";

const dom = new JSDOM('<div id="root"></div>', {
  url: "http://localhost",
  pretendToBeVisual: true,
});
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "localStorage",
])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const {
  useStudyWidget,
  clearNativeStudyWidget,
  empty,
  save,
  load,
  setStorageName,
  setStorageAccount,
  buildWidgetSnapshot,
  disposeWidgetCache,
} = await import("./.build/study-widget-hook-harness.mjs");
const { StudyWidget } = await import("./.build/StudyWidget.mjs");
const DRAFT = "remo-study-widget-intent:";
const timers = new Map();
const realInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
let timerId = 0;
globalThis.setInterval = (fn) => {
  const id = ++timerId;
  timers.set(id, fn);
  return id;
};
globalThis.clearInterval = (id) => timers.delete(id);
const turn = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate, message = "condition did not become true") {
  for (let i = 0; i < 100; i++) {
    await act(turn);
    if (predicate()) return;
  }
  assert.fail(message);
}
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const scopeName = () =>
  "remo-web-local-" + crypto.randomUUID().replaceAll("-", "").slice(0, 16);
function documentFixture() {
  const now = Date.now() - 1000;
  const doc = empty();
  const bullets = [
    bullet("deck", { text: "Memory" }),
    bullet("q", {
      parentId: "deck",
      kind: "QUESTION",
      text: "How do we remember?",
    }),
    bullet("a", {
      parentId: "q",
      text: "Recall ideas over time.\nThen review them again.",
    }),
  ];
  const decks = [{ rootId: "deck", layout: "FLAT", createdAt: now, pinned: 0 }];
  doc.tables = {
    ...doc.tables,
    bullets,
    decks,
    media: [],
    cards: refreshCards(bullets, decks, [], [], now),
    review_logs: [],
    study_limits: [],
    study_sessions: [],
  };
  return doc;
}
function review(doc, scope) {
  const snapshot = createWidgetSnapshot(doc, scope, "Private workspace");
  const deck = snapshot.decks[0],
    card = deck.cards[0];
  assert.ok(card);
  return {
    schema: 1,
    id: crypto.randomUUID(),
    scope,
    deckId: deck.id,
    cardId: card.id,
    fingerprint: card.fingerprint,
    question: card.question,
    answer: card.answer,
    grade: "GOOD",
    reviewedAt: Date.now(),
  };
}
function nativeBroker() {
  const broker = {
    inbox: [],
    snapshot: null,
    calls: [],
    custom: null,
    async invoke(cmd, args) {
      broker.calls.push({ cmd, args });
      if (broker.custom) {
        const response = broker.custom(cmd, args);
        if (response !== undefined) return response;
      }
      if (cmd === "study_widget_inbox")
        return broker.inbox.filter((i) => !i.scope || i.scope === args.scope);
      if (cmd === "study_widget_ack") {
        broker.inbox = broker.inbox.filter((i) => !args.ids.includes(i.id));
        return;
      }
      if (cmd === "study_widget_publish") {
        broker.snapshot = args.snapshot;
        return;
      }
      if (cmd === "study_widget_state")
        return {
          snapshot: broker.snapshot,
          pending: broker.inbox.filter(
            (i) => i.scope === broker.snapshot?.scope,
          ).length,
        };
      if (cmd.startsWith("plugin:event|")) return 1;
      return null;
    },
  };
  window.__TAURI_INTERNALS__ = {
    invoke: broker.invoke,
    transformCallback: () => 1,
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  return broker;
}
function mountHook(options) {
  let value;
  const root = createRoot(document.getElementById("root"));
  function Harness() {
    value = useStudyWidget(options);
    return null;
  }
  return {
    root,
    get value() {
      return value;
    },
    render: () => act(async () => root.render(React.createElement(Harness))),
    close: () => act(async () => root.unmount()),
  };
}
const focus = () =>
  act(async () => window.dispatchEvent(new window.Event("focus")));
const pollWindow = () =>
  act(async () => {
    for (const fn of [...timers.values()]) fn();
  });
function button(text) {
  const found = [...document.querySelectorAll("button")].find((el) =>
    el.textContent.includes(text),
  );
  assert.ok(found, "missing button: " + text);
  return found;
}
const click = (el) =>
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

const originalWorker = globalThis.Worker;
class ControlledWorker {
  static instances = [];
  static automatic = true;
  constructor() {
    this.requests = [];
    this.terminated = false;
    this.failCopy = false;
    ControlledWorker.instances.push(this);
  }
  postMessage(request) {
    if (this.failCopy) throw new DOMException("Cannot clone", "DataCloneError");
    this.requests.push(structuredClone(request));
    if (ControlledWorker.automatic)
      queueMicrotask(() => {
        if (!this.terminated) this.answer(request.id);
      });
  }
  answer(id) {
    const request = this.requests.find((item) => item.id === id);
    assert.ok(request, "Worker request exists");
    const snapshot = createWidgetSnapshot(
      request.doc,
      request.scope,
      request.workspaceName,
    );
    this.onmessage?.({ data: { id, snapshot } });
    return snapshot;
  }
  terminate() {
    this.terminated = true;
  }
}

test.beforeEach(() => {
  disposeWidgetCache();
  ControlledWorker.instances = [];
  ControlledWorker.automatic = true;
  globalThis.Worker = ControlledWorker;
  localStorage.clear();
  setStorageAccount(null);
});
test.afterEach(() => {
  disposeWidgetCache();
  assert.equal(timers.size, 0, "React timers must be cleaned up");
});
test.after(() => {
  globalThis.setInterval = realInterval;
  globalThis.clearInterval = realClearInterval;
  if (originalWorker === undefined) delete globalThis.Worker;
  else globalThis.Worker = originalWorker;
  setStorageAccount(null);
  dom.window.close();
});

test("background cache correlates concurrent responses and ignores unknown request IDs", async () => {
  ControlledWorker.automatic = false;
  const firstDoc = documentFixture(),
    secondDoc = documentFixture();
  secondDoc.tables.bullets[0].text = "Second deck";
  const first = buildWidgetSnapshot(firstDoc, "first", "First workspace");
  const second = buildWidgetSnapshot(secondDoc, "second", "Second workspace");
  const worker = ControlledWorker.instances[0];
  assert.equal(ControlledWorker.instances.length, 1);
  assert.equal(worker.requests.length, 2);
  let firstDone = false;
  void first.then(() => {
    firstDone = true;
  });
  worker.onmessage({ data: { id: -1, snapshot: { scope: "wrong" } } });
  const secondExpected = worker.answer(worker.requests[1].id);
  assert.deepEqual(await second, secondExpected);
  assert.equal(
    firstDone,
    false,
    "out-of-order response must not settle another account request",
  );
  const firstExpected = worker.answer(worker.requests[0].id);
  assert.deepEqual(await first, firstExpected);
  assert.equal(firstExpected.scope, "first");
  assert.equal(secondExpected.scope, "second");
});

test("background cache error rejects pending requests, terminates, and can restart without accepting old responses", async () => {
  ControlledWorker.automatic = false;
  const doc = documentFixture();
  const first = buildWidgetSnapshot(doc, "one", "One");
  const second = buildWidgetSnapshot(doc, "two", "Two");
  const oldWorker = ControlledWorker.instances[0];
  const rejected = Promise.all([
    assert.rejects(first, /cache could not refresh.*Pending reviews remain/),
    assert.rejects(second, /cache could not refresh.*Pending reviews remain/),
  ]);
  oldWorker.onerror({ preventDefault() {} });
  await rejected;
  assert.equal(oldWorker.terminated, true);
  const restarted = buildWidgetSnapshot(doc, "new", "New");
  const newWorker = ControlledWorker.instances[1];
  oldWorker.answer(oldWorker.requests[0].id);
  const expected = newWorker.answer(newWorker.requests[0].id);
  assert.deepEqual(await restarted, expected);
  const interrupted = buildWidgetSnapshot(doc, "new", "New");
  const interruptedCheck = assert.rejects(
    interrupted,
    /interrupted.*Pending reviews remain/,
  );
  disposeWidgetCache();
  await interruptedCheck;
  assert.equal(newWorker.terminated, true);
});

test("worker-reported and copy failures reject only the affected request and keep originals available for retry", async () => {
  ControlledWorker.automatic = false;
  const doc = documentFixture();
  const broken = buildWidgetSnapshot(doc, "scope", "Workspace");
  const worker = ControlledWorker.instances[0];
  const brokenCheck = assert.rejects(broken, /cache could not refresh/);
  worker.onmessage({ data: { id: worker.requests[0].id, error: true } });
  await brokenCheck;
  worker.failCopy = true;
  await assert.rejects(
    buildWidgetSnapshot(doc, "scope", "Workspace"),
    /could not be copied safely/,
  );
  worker.failCopy = false;
  const retry = buildWidgetSnapshot(doc, "scope", "Workspace");
  worker.answer(worker.requests.at(-1).id);
  assert.equal((await retry).scope, "scope");
  assert.equal(worker.terminated, false);
  assert.equal(doc.tables.review_logs.length, 0);
});

test("a stalled worker has a bounded timeout and unsupported webviews reject instead of traversing the document on the editor thread", async () => {
  ControlledWorker.automatic = false;
  const originalSetTimeout = globalThis.setTimeout,
    originalClearTimeout = globalThis.clearTimeout;
  const deadlines = new Map();
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay !== 30000) return originalSetTimeout(callback, delay, ...args);
    const handle = {};
    deadlines.set(handle, callback);
    return handle;
  };
  globalThis.clearTimeout = (handle) => {
    if (!deadlines.delete(handle)) originalClearTimeout(handle);
  };
  try {
    const snapshot = buildWidgetSnapshot(
      documentFixture(),
      "scope",
      "Workspace",
    );
    const timedOut = assert.rejects(
      snapshot,
      /timed out.*Pending reviews remain/,
    );
    assert.equal(deadlines.size, 1);
    [...deadlines.values()][0]();
    await timedOut;
    assert.equal(deadlines.size, 0);
    assert.equal(ControlledWorker.instances[0].terminated, true);
    delete globalThis.Worker;
    const forbidden = new Proxy(
      {},
      {
        get() {
          assert.fail("unsupported webview must not traverse the document");
        },
      },
    );
    await assert.rejects(
      buildWidgetSnapshot(forbidden, "scope", "Workspace"),
      /worker support.*Pending reviews remain/,
    );
    assert.equal(deadlines.size, 0);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    globalThis.Worker = ControlledWorker;
  }
});

test("an edit made while the background cache is building cannot publish its stale snapshot or acknowledge the review", async () => {
  ControlledWorker.automatic = false;
  const scope = scopeName();
  setStorageName(scope);
  localStorage.setItem("remo-native-study-widget:" + scope, "true");
  let current = documentFixture(),
    commits = 0;
  const intent = review(current, scope),
    broker = nativeBroker();
  broker.inbox = [intent];
  const hook = mountHook({
    ready: true,
    getDoc: () => current,
    canApply: () => true,
    apply: async (next) => {
      commits++;
      current = next;
    },
    onNotice: () => {},
  });
  try {
    await hook.render();
    await until(() => ControlledWorker.instances[0]?.requests.length === 1);
    const worker = ControlledWorker.instances[0];
    current = {
      ...current,
      tables: {
        ...current.tables,
        bullets: [
          ...current.tables.bullets,
          bullet("new-note", { text: "Typed while caching" }),
        ],
      },
    };
    await act(async () => worker.answer(worker.requests[0].id));
    await until(() => worker.requests.length === 2);
    assert.equal(
      broker.calls.some((call) => call.cmd === "study_widget_publish"),
      false,
    );
    assert.equal(
      broker.calls.some((call) => call.cmd === "study_widget_ack"),
      false,
    );
    assert.equal(broker.inbox.length, 1);
    await act(async () => worker.answer(worker.requests[1].id));
    await until(() => broker.snapshot?.scope === scope);
    assert.equal(
      broker.inbox.length,
      1,
      "fresh presentation alone must not archive a deferred event",
    );
    await focus();
    await until(() => worker.requests.length === 3);
    await act(async () => worker.answer(worker.requests[2].id));
    await until(() => broker.inbox.length === 0);
    assert.equal(commits, 1);
    assert.equal(current.tables.review_logs.length, 1);
    assert.equal(
      current.tables.bullets.find((row) => row.id === "new-note").text,
      "Typed while caching",
    );
  } finally {
    await hook.close();
  }
});

test("account clear cancels an awaiting cache immediately and late worker output cannot restore private cards", async () => {
  ControlledWorker.automatic = false;
  const scope = scopeName();
  setStorageName(scope);
  localStorage.setItem("remo-native-study-widget:" + scope, "true");
  const doc = documentFixture(),
    broker = nativeBroker();
  const hook = mountHook({
    ready: true,
    getDoc: () => doc,
    canApply: () => true,
    apply: async () => assert.fail("no pending reviews"),
    onNotice: () => {},
  });
  try {
    await hook.render();
    await until(() => ControlledWorker.instances[0]?.requests.length === 1);
    const worker = ControlledWorker.instances[0];
    await act(async () => clearNativeStudyWidget());
    assert.equal(worker.terminated, true);
    assert.equal(broker.snapshot.scope, null);
    await act(async () => worker.answer(worker.requests[0].id));
    assert.equal(broker.snapshot.scope, null);
    assert.deepEqual(broker.snapshot.decks, []);
    assert.equal(
      broker.calls.filter((call) => call.cmd === "study_widget_publish").length,
      1,
    );
  } finally {
    await hook.close();
  }
});

test("canonical service persists a real review before native acknowledgment; replay after failed archive grades only once", async () => {
  const scope = scopeName();
  setStorageName(scope);
  let current = await save(null, documentFixture(), "create");
  const intent = review(current, scope),
    broker = nativeBroker(),
    barrier = deferred();
  broker.inbox = [intent];
  localStorage.setItem("remo-native-study-widget:" + scope, "true");
  let started = false,
    commits = 0,
    archiveAttempts = 0;
  broker.custom = (cmd) => {
    if (cmd === "study_widget_ack") {
      archiveAttempts++;
      assert.equal(commits, 1, "ack must follow a successful durable commit");
      assert.ok(
        broker.snapshot,
        "post-review cache must be published before ack",
      );
      assert.equal(
        broker.snapshot.decks
          .flatMap((d) => d.cards)
          .some((c) => c.id === intent.cardId),
        false,
        "graded card must leave every cached deck before ack",
      );
      if (archiveAttempts === 1)
        return Promise.reject(Error("archive temporarily unavailable"));
    }
  };
  const hook = mountHook({
    ready: true,
    getDoc: () => current,
    canApply: () => true,
    apply: async (next) => {
      started = true;
      await barrier.promise;
      current = await save(current, next, "widget-review");
      commits++;
      assert.equal(
        (await load()).tables.review_logs[0].widgetEventId,
        intent.id,
      );
    },
    onNotice: () => {},
  });
  try {
    await hook.render();
    await until(() => started);
    assert.equal(
      broker.calls.filter((c) => c.cmd === "study_widget_ack").length,
      0,
    );
    assert.equal((await load()).tables.review_logs.length, 0);
    await act(async () => barrier.resolve());
    await until(() =>
      hook.value.error.includes("archive temporarily unavailable"),
    );
    assert.equal(
      broker.inbox.length,
      1,
      "archive failure retains native original",
    );
    assert.equal(current.tables.review_logs.length, 1);
    await focus();
    await until(() => broker.inbox.length === 0);
    assert.equal(
      commits,
      1,
      "receipt replay does not invoke a second save or grade",
    );
    assert.equal(archiveAttempts, 2);
    assert.equal((await load()).tables.review_logs.length, 1);
  } finally {
    await hook.close();
  }
});

test("failed persistence keeps both native event and browser draft; retry saves exactly once", async () => {
  const scope = scopeName();
  setStorageName(scope);
  let current = await save(null, documentFixture(), "create");
  const intent = review(current, scope),
    broker = nativeBroker();
  broker.inbox = [intent];
  localStorage.setItem(DRAFT + intent.id, JSON.stringify(intent));
  let attempts = 0;
  const hook = mountHook({
    ready: true,
    getDoc: () => current,
    canApply: () => true,
    apply: async (next) => {
      if (++attempts === 1) throw Error("Disk full");
      current = await save(current, next, "widget-review");
    },
    onNotice: () => {},
  });
  try {
    await hook.render();
    await until(() => hook.value?.error.includes("Disk full"));
    assert.equal(
      broker.calls.some((c) => c.cmd === "study_widget_ack"),
      false,
    );
    assert.equal((await load()).tables.review_logs.length, 0);
    assert.ok(localStorage.getItem(DRAFT + intent.id));
    assert.equal(broker.inbox.length, 1);
    await focus();
    await until(() => broker.inbox.length === 0);
    assert.equal(attempts, 2);
    assert.equal((await load()).tables.review_logs.length, 1);
    assert.equal(localStorage.getItem(DRAFT + intent.id), null);
  } finally {
    await hook.close();
  }
});

test("corrupt and wrong-account events stay preserved while a valid review continues", async () => {
  const scope = scopeName();
  setStorageName(scope);
  let current = documentFixture();
  const intent = review(current, scope),
    broker = nativeBroker(),
    foreign = {
      ...intent,
      id: crypto.randomUUID(),
      scope: "remo-web-user-other",
    };
  const malformed = { ...intent, id: crypto.randomUUID(), schema: 99 };
  broker.inbox = [malformed, intent];
  localStorage.setItem(DRAFT + "broken", "{not valid JSON");
  localStorage.setItem(DRAFT + foreign.id, JSON.stringify(foreign));
  const hook = mountHook({
    ready: true,
    getDoc: () => current,
    canApply: () => true,
    apply: async (next) => {
      current = next;
    },
    onNotice: () => {},
  });
  try {
    await hook.render();
    await until(
      () => hook.value?.error && current.tables.review_logs.length === 1,
    );
    assert.deepEqual(
      broker.inbox.map((i) => i.id),
      [malformed.id],
    );
    assert.equal(localStorage.getItem(DRAFT + "broken"), "{not valid JSON");
    assert.deepEqual(
      JSON.parse(localStorage.getItem(DRAFT + foreign.id)),
      foreign,
    );
    assert.match(hook.value.error, /unreadable|invalid/i);
    assert.equal(current.tables.review_logs[0].widgetEventId, intent.id);
  } finally {
    await hook.close();
  }
});

test("account transition invalidates an in-flight inbox, clears cached questions, and retains the old account event", async () => {
  const first = scopeName(),
    second = scopeName();
  setStorageName(first);
  let current = documentFixture(),
    applies = 0;
  const intent = review(current, first),
    broker = nativeBroker(),
    inbox = deferred();
  broker.inbox = [intent];
  broker.snapshot = createWidgetSnapshot(
    current,
    first,
    "Secret first workspace",
  );
  broker.custom = (cmd, args) =>
    cmd === "study_widget_inbox" && args.scope === first
      ? inbox.promise
      : undefined;
  localStorage.setItem("remo-native-study-widget:" + first, "true");
  localStorage.setItem("remo-native-study-widget:" + second, "true");
  localStorage.setItem(DRAFT + intent.id, JSON.stringify(intent));
  const hook = mountHook({
    ready: true,
    getDoc: () => current,
    canApply: () => true,
    apply: async (next) => {
      applies++;
      current = next;
    },
    onNotice: () => {},
  });
  try {
    await hook.render();
    await until(() => broker.calls.some((c) => c.cmd === "study_widget_inbox"));
    let clearing;
    await act(async () => {
      clearing = clearNativeStudyWidget();
      setStorageName(second);
      inbox.resolve([intent]);
      await clearing;
    });
    assert.equal(broker.snapshot.scope, null);
    assert.deepEqual(broker.snapshot.decks, []);
    current = documentFixture();
    current.tables.bullets[1].text = "Second account question";
    current.tables.cards = refreshCards(
      current.tables.bullets,
      current.tables.decks,
      [],
      [],
      Date.now(),
    );
    await hook.render();
    await until(() => broker.snapshot?.scope === second);
    assert.equal(applies, 0);
    assert.equal(broker.inbox[0].id, intent.id);
    assert.ok(localStorage.getItem(DRAFT + intent.id));
    assert.equal(
      broker.calls.some((c) => c.cmd === "study_widget_ack"),
      false,
    );
    assert.doesNotMatch(
      JSON.stringify(broker.snapshot),
      /How do we remember|Secret first/,
    );
  } finally {
    await hook.close();
  }
});

test("account opt-in does not follow an in-place switch to another workspace", async () => {
  const first = scopeName(),
    second = scopeName();
  setStorageName(first);
  localStorage.setItem("remo-native-study-widget:" + first, "true");
  const broker = nativeBroker(),
    current = documentFixture();
  const hook = mountHook({
    ready: true,
    getDoc: () => current,
    canApply: () => true,
    apply: async () => assert.fail("no reviews to apply"),
    onNotice: () => {},
  });
  try {
    await hook.render();
    await until(() => broker.snapshot?.scope === first);
    assert.equal(hook.value.enabled, true);
    await clearNativeStudyWidget();
    setStorageName(second);
    await hook.render();
    await until(
      () => hook.value.enabled === false && broker.snapshot?.scope === null,
    );
    assert.equal(
      broker.calls.some(
        (c) =>
          c.cmd === "study_widget_publish" && c.args.snapshot.scope === second,
      ),
      false,
    );
    assert.equal(
      localStorage.getItem("remo-native-study-widget:" + second),
      null,
    );
  } finally {
    await hook.close();
  }
});

test("a review committed as editing resumes stays pending until the canonical queue is safe again", async () => {
  const scope = scopeName();
  setStorageName(scope);
  let current = documentFixture(),
    canApply = true,
    commits = 0;
  const intent = review(current, scope),
    broker = nativeBroker();
  broker.inbox = [intent];
  const hook = mountHook({
    ready: true,
    getDoc: () => current,
    canApply: () => canApply,
    apply: async (next) => {
      current = next;
      commits++;
      canApply = false;
    },
    onNotice: () => {},
  });
  try {
    await hook.render();
    await until(() => commits === 1);
    assert.equal(broker.inbox.length, 1);
    assert.equal(
      broker.calls.some((c) => c.cmd === "study_widget_ack"),
      false,
    );
    canApply = true;
    await focus();
    await until(() => broker.inbox.length === 0);
    assert.equal(
      commits,
      1,
      "the already committed receipt prevents grading twice",
    );
    assert.equal(current.tables.review_logs.length, 1);
  } finally {
    await hook.close();
  }
});

test("desktop window reveals complete answers and serializes rapid grade clicks with a durable draft before native submit", async () => {
  const scope = scopeName(),
    doc = documentFixture(),
    broker = nativeBroker();
  broker.snapshot = createWidgetSnapshot(doc, scope, "Memory space");
  const submit = deferred();
  let submitted;
  broker.custom = (cmd, args) => {
    if (cmd !== "study_widget_submit") return;
    submitted = args.intent;
    assert.deepEqual(
      JSON.parse(localStorage.getItem(DRAFT + submitted.id)),
      submitted,
    );
    return submit.promise;
  };
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(React.createElement(StudyWidget)));
    await until(() =>
      document.querySelector('[aria-label="Flashcard question"]'),
    );
    assert.equal(
      document.querySelector('[aria-label="Flashcard answer"]'),
      null,
    );
    await act(async () => click(button("Reveal answer")));
    assert.match(
      document.querySelector('[aria-label="Flashcard answer"]').textContent,
      /Recall ideas over time\.\nThen review/,
    );
    const good = button("Good");
    await act(async () => {
      click(good);
      click(good);
      document.body.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "3", bubbles: true }),
      );
    });
    assert.equal(
      broker.calls.filter((c) => c.cmd === "study_widget_submit").length,
      1,
    );
    assert.equal(good.disabled, true);
    assert.equal(document.querySelector("select").disabled, true);
    broker.inbox = [submitted];
    broker.snapshot = { ...broker.snapshot, decks: [] };
    await act(async () => submit.resolve());
    await until(() =>
      document
        .querySelector('[role="status"]')
        ?.textContent.includes("1 review saved on this device"),
    );
    assert.equal(localStorage.getItem(DRAFT + submitted.id), null);
    assert.doesNotMatch(
      document.querySelector('[role="status"]').textContent,
      /synced/i,
    );
  } finally {
    await act(async () => root.unmount());
  }
});

test("desktop failed submit resumes after remount and retry reuses the immutable event ID and original grade", async () => {
  const scope = scopeName(),
    broker = nativeBroker();
  broker.snapshot = createWidgetSnapshot(
    documentFixture(),
    scope,
    "Memory space",
  );
  const attempts = [];
  broker.custom = (cmd, args) => {
    if (cmd !== "study_widget_submit") return;
    attempts.push(structuredClone(args.intent));
    if (attempts.length === 1)
      return Promise.reject(Error("Storage temporarily unavailable"));
    broker.inbox = [args.intent];
    broker.snapshot = { ...broker.snapshot, decks: [] };
    return Promise.resolve();
  };
  let root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(React.createElement(StudyWidget)));
    await until(() =>
      document.querySelector('[aria-label="Flashcard question"]'),
    );
    await act(async () =>
      document.body.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: " ", bubbles: true }),
      ),
    );
    await act(async () =>
      document.body.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "2", bubbles: true }),
      ),
    );
    await until(() =>
      document
        .querySelector('[role="alert"]')
        ?.textContent.includes("Storage temporarily unavailable"),
    );
    assert.ok(localStorage.getItem(DRAFT + attempts[0].id));
    await act(async () => root.unmount());
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(React.createElement(StudyWidget)));
    await until(() =>
      [...document.querySelectorAll("button")].some((el) =>
        el.textContent.includes("Retry saving"),
      ),
    );
    assert.equal(button("Reveal answer").disabled, true);
    await act(async () => {
      click(button("Retry saving"));
      click(button("Retry saving"));
    });
    await until(
      () =>
        attempts.length === 2 &&
        localStorage.getItem(DRAFT + attempts[0].id) === null,
    );
    assert.deepEqual(attempts[1], attempts[0]);
    assert.equal(attempts[1].grade, "HARD");
    assert.equal(
      broker.calls.some((c) => c.cmd === "study_widget_ack"),
      false,
      "window never acknowledges canonical persistence",
    );
  } finally {
    await act(async () => root.unmount());
  }
});

test("desktop null-scope refresh removes old questions and cannot resume another account draft", async () => {
  const scope = scopeName(),
    broker = nativeBroker();
  const doc = documentFixture(),
    old = review(doc, scope);
  localStorage.setItem(DRAFT + old.id, JSON.stringify(old));
  broker.snapshot = createWidgetSnapshot(doc, scope, "Private memory");
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(React.createElement(StudyWidget)));
    await until(() =>
      document.querySelector('[aria-label="Flashcard question"]'),
    );
    broker.snapshot = {
      schema: 1,
      scope: null,
      workspaceName: "",
      decks: [],
      updatedAt: Date.now(),
    };
    await pollWindow();
    await until(
      () => !document.querySelector('[aria-label="Flashcard question"]'),
    );
    assert.doesNotMatch(
      document.body.textContent,
      /How do we remember|Private memory|Retry saving/,
    );
    assert.ok(localStorage.getItem(DRAFT + old.id));
    assert.equal(
      broker.calls.some((c) => c.cmd === "study_widget_submit"),
      false,
    );
  } finally {
    await act(async () => root.unmount());
  }
});
