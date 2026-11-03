import assert from "node:assert/strict";
import { empty } from "../../tests/.build/data.mjs";
import { bullet } from "../../src/domain.mjs";
import {
  addBookmark,
  patchBookmark,
  bookmarkNote,
} from "../../src/bookmarks.mjs";
const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE || "@playwright/test"
  ),
  origin = process.env.BOOKMARK_QA_ORIGIN || "http://127.0.0.1:4193";
let seed = empty();
for (const [i, title, url] of [
  [
    0,
    "What is RAG? Why it matters and where it falls short",
    "https://memgraph.com/rag",
  ],
  [1, "What is Machine Learning? | IBM", "https://ibm.com/machine-learning"],
  [
    2,
    "Developers are choosing smaller models for focused work",
    "https://thenewstack.io/smaller-models",
  ],
  [3, "An archived reference", "https://example.com/archive"],
]) {
  const r = addBookmark(seed, url);
  seed = patchBookmark(r.doc, r.bookmark.id, {
    title,
    createdAt: 1000 + i,
    excerpt:
      "Useful ideas, carefully saved. Read without distractions and keep the passages that matter.",
    tags: i === 1 ? ["AI", "Learning"] : i === 0 ? ["AI"] : [],
    read: i === 2,
    favourite: i === 0,
    archived: i === 3,
    readingMinutes: 5,
  });
}
const first = Object.values(seed.web.bookmarks).find((b) =>
  b.url.includes("memgraph"),
);
seed = bookmarkNote(
  seed,
  first,
  "Keep this source-linked note.",
  "library-note",
);
seed.tables.trash = [0, 1].map((i) => ({
  id: "trash-" + i,
  title: "Deleted branch " + i,
  nodeCount: 1,
  deletedAt: Date.now(),
  payload: JSON.stringify({
    nodes: [bullet("deleted-" + i, { text: "Deleted " + i })],
    media: [],
    decks: [],
  }),
}));
const browser = await chromium.launch({
  executablePath: process.env.REMONOOK_CHROMIUM || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      hasTouch: mobile,
      isMobile: mobile,
      colorScheme: mobile ? "dark" : "light",
      serviceWorkers: "block",
    });
    await context.route("http://127.0.0.1:4194/sync/**", (route) =>
      route.abort(),
    );
    if (origin.startsWith("https:"))
      await context.route("https://**/*", async (route) => {
        try {
          const q = route.request(),
            r = await fetch(q.url(), {
              method: q.method(),
              headers: q.headers(),
              body: q.postDataBuffer() || undefined,
              redirect: "manual",
            }),
            headers = Object.fromEntries(r.headers);
          delete headers["content-encoding"];
          delete headers["content-length"];
          await route.fulfill({
            status: r.status,
            headers,
            body: Buffer.from(await r.arrayBuffer()),
          });
        } catch {
          await route.abort();
        }
      });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.log("Browser error", e.message);
    });
    page.setDefaultTimeout(30000);
    console.log("Opening", mobile);
    await page.goto(origin + "/#app");
    await page
      .getByRole("button", { name: "Commands & notes", exact: true })
      .waitFor()
      .catch(async (e) => {
        console.log("App state", await page.locator("body").innerText());
        throw e;
      });
    await page.waitForTimeout(400);
    console.log("Seeding");
    await page.evaluate(
      async ({ seed, account }) => {
        const article = {
            schema: 1,
            title: "A reliable saved article",
            html: "<p>A passage for reading and highlighting.</p>",
            text: "A passage for reading and highlighting.",
          },
          blob = new Blob([JSON.stringify(article)], {
            type: "application/json",
          }),
          hash = Array.from(
            new Uint8Array(
              await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
            ),
          )
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("");
        for (const b of Object.values(seed.web.bookmarks)) {
          b.snapshotHash = hash;
        }
        const db = await new Promise((resolve) => {
          const q = indexedDB.open("remo-web");
          q.onsuccess = () => resolve(q.result);
        });
        await new Promise((resolve, reject) => {
          const tx = db.transaction(["meta", "records"], "readwrite"),
            meta = tx.objectStore("meta"),
            q = meta.get("workspace");
          q.onsuccess = () => {
            const { tables, ...rest } = seed;
            meta.put(
              {
                ...q.result,
                ...rest,
                tableNames: Object.keys(tables),
                revision: (q.result?.revision || 0) + 1,
              },
              "workspace",
            );
            const rows = tx.objectStore("records");
            rows.clear();
            for (const [table, list] of Object.entries(tables))
              for (const [i, value] of list.entries())
                rows.put(
                  { table, value },
                  JSON.stringify([
                    table,
                    String(
                      value[
                        { decks: "rootId", emojis: "token" }[table] || "id"
                      ] ?? `row:${i}`,
                    ),
                  ]),
                );
          };
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        db.close();
        const cache = await new Promise((resolve) => {
          const q = indexedDB.open(account + "-articles", 1);
          q.onupgradeneeded = () => q.result.createObjectStore("snapshots");
          q.onsuccess = () => resolve(q.result);
        });
        await new Promise((resolve, reject) => {
          const tx = cache.transaction("snapshots", "readwrite");
          tx.objectStore("snapshots").put(
            { hash, blob, pending: false, thumbnail: null },
            hash,
          );
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        cache.close();
      },
      {
        seed: structuredClone(seed),
        account: origin.startsWith("https:")
          ? "remo-web"
          : "remo-web-user-bookmark-fixture-account",
      },
    );
    console.log("Reload");
    await page.reload();
    await page
      .getByRole("button", { name: "Commands & notes", exact: true })
      .waitFor()
      .catch(async (e) => {
        console.log("App state", await page.locator("body").innerText());
        throw e;
      });
    const command = async (q) => {
      await page.keyboard.press("Control+k");
      await page.getByRole("combobox").fill(q);
      await page.keyboard.press("Enter");
    };
    await command("Open Bookmarks");
    await page.locator(".bl-list .bl-item").first().waitFor();
    assert.equal(await page.locator(".bl-item").count(), 3);
    assert.equal(
      await page
        .locator(".bookmarks")
        .evaluate((el) => getComputedStyle(el).padding),
      "0px",
      "library removes the duplicate outer padding",
    );
    await page.screenshot({
      path: mobile
        ? "/tmp/library-redesign-mobile.png"
        : "/tmp/library-redesign-desktop.png",
    });
    await page
      .getByRole("searchbox", { name: "Search bookmarks" })
      .fill("IBM learning");
    assert.equal(await page.locator(".bl-item").count(), 1);
    await page.getByRole("button", { name: "Clear bookmark search" }).click();
    await page.getByLabel("Filter by tag").selectOption("AI");
    assert.equal(await page.locator(".bl-item").count(), 2);
    await page.getByLabel("Filter by tag").selectOption("");
    await page.getByLabel("Sort bookmarks").selectOption("oldest");
    assert.match(await page.locator(".bl-open h2").first().innerText(), /RAG/);
    const rag = page
      .locator(".bl-item")
      .filter({ has: page.getByRole("heading", { name: /What is RAG/ }) });
    await rag.getByRole("button", { name: /Mark read:/ }).click();
    await page
      .getByRole("navigation", { name: "Bookmark views" })
      .getByRole("button", { name: /^Unread/ })
      .click();
    assert.equal(await page.locator(".bl-item").count(), 1);
    await page
      .getByRole("navigation", { name: "Bookmark views" })
      .getByRole("button", { name: /^All/ })
      .click();
    await rag.getByRole("button", { name: /Open 1 article notes/ }).click();
    await page.getByRole("heading", { name: /Article notes/ }).waitFor();
    assert.match(
      await page.locator(".article-note-preview").innerText(),
      /Keep this source-linked note/,
    );
    await page.getByRole("button", { name: "Close article notes" }).click();
    await page
      .getByRole("button", { name: "← Bookmarks", exact: true })
      .click();
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page.getByRole("checkbox", { name: "Select visible" }).check();
    await page
      .getByRole("button", { name: "Archive", exact: true })
      .filter({ has: page.locator("svg") })
      .click();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page
      .getByRole("navigation", { name: "Bookmark views" })
      .getByRole("button", { name: /^Archive/ })
      .click();
    assert.equal(await page.locator(".bl-item").count(), 4);
    const row = page
      .locator(".bl-item")
      .filter({ has: page.getByRole("heading", { name: /What is RAG/ }) });
    await row.getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Remove from library" }).click();
    const remove = page.getByRole("dialog", { name: "Remove this bookmark?" });
    await remove.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.locator(".bl-item").count(), 4);
    await row.getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Remove from library" }).click();
    await remove
      .getByRole("button", { name: "Remove bookmark", exact: true })
      .click();
    assert.equal(await page.locator(".bl-item").count(), 3);
    await page
      .getByRole("button", { name: "Add bookmark", exact: true })
      .click();
    const save = page.getByRole("dialog", { name: "Save a page", exact: true });
    await save
      .getByRole("textbox", { name: "Webpage URL" })
      .fill("https://example.com/new");
    await save.getByRole("button", { name: "Cancel", exact: true }).click();
    await command("Open settings & backups");
    await page
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "Backups", exact: true })
      .click();
    await page.locator(".settings-disclosure summary").click();
    await page.getByRole("button", { name: "Open Trash", exact: true }).click();
    await page
      .getByRole("button", { name: "Empty trash", exact: true })
      .click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.locator(".trash-item").count(), 2);
    await page
      .getByRole("button", { name: "Empty trash", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Empty trash permanently", exact: true })
      .click();
    await page.getByText("Trash is empty.", { exact: true }).waitFor();
    await page.screenshot({
      path: mobile
        ? "/tmp/trash-empty-mobile.png"
        : "/tmp/trash-empty-desktop.png",
    });
    await page.keyboard.press("Escape");
    await command("Open Bookmarks");
    await page
      .getByRole("navigation", { name: "Bookmark views" })
      .getByRole("button", { name: /^Archive/ })
      .click();
    if (mobile) {
      await page.setViewportSize({ width: 320, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({ path: "/tmp/library-redesign-320.png" });
    }
    console.log("Reload");
    await page.reload();
    await page
      .getByRole("button", { name: "Commands & notes", exact: true })
      .waitFor()
      .catch(async (e) => {
        console.log("App state", await page.locator("body").innerText());
        throw e;
      });
    const kept = await page.evaluate(async () => {
      const db = await new Promise((resolve) => {
        const q = indexedDB.open("remo-web");
        q.onsuccess = () => resolve(q.result);
      });
      const rows = await new Promise((resolve) => {
        const q = db.transaction("records").objectStore("records").getAll();
        q.onsuccess = () => resolve(q.result);
      });
      db.close();
      return {
        trash: rows.filter((r) => r.table === "trash").length,
        note: rows.some(
          (r) => r.table === "bullets" && r.value.id === "library-note",
        ),
      };
    });
    assert.equal(kept.trash, 0);
    assert.ok(kept.note);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      mobile ? "Mobile" : "Desktop",
      "library search/filter/sort/read, notes, bulk archive, removal, and empty-trash cancellation/persistence passed",
    );
  }
} finally {
  await browser.close();
}
