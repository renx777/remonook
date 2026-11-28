// Guest-only acceptance; fresh contexts, never a signed-in account.
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
const url = process.env.HISTORY_URL || "http://127.0.0.1:5219";
if (
  !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url) &&
  url !== "https://staging.remonook.com"
)
  throw Error("Local or staging guest checks only.");
const fixture = (
  await build({
    stdin: {
      contents:
        "import * as data from './src/data.ts';import {bullet} from './src/domain.mjs';globalThis.fixture={data,bullet};",
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    define: { "import.meta.env": "{}" },
    logLevel: "silent",
  })
).outputFiles[0].text;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox"],
});
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1440, height: 1000 },
        isMobile: mobile,
        hasTouch: mobile,
        colorScheme: mobile ? "dark" : "light",
        ...(process.env.HISTORY_IGNORE_TLS ? { ignoreHTTPSErrors: true } : {}),
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(20000);
    await page.goto(url + "/#app");
    await page.locator(".outline-scroll").waitFor();
    await page.evaluate(fixture);
    await page.evaluate(async () => {
      const { data, bullet } = globalThis.fixture;
      const base = data.withNodes(data.empty(), [
        bullet("history-source", { text: "Before revision" }),
      ]);
      const one = await data.save(await data.load(), base, "fixture create");
      await data.save(
        one,
        data.withNodes(one, [
          { ...one.tables.bullets[0], text: "After revision" },
        ]),
        "fixture edit",
      );
    });
    await page.reload();
    await page
      .locator(
        '[data-node-id="history-source"] [aria-label="Zoom into bullet"]',
      )
      .click();
    await page.getByRole("button", { name: "History", exact: true }).click();
    const history = page.getByRole("dialog", { name: "Bullet history" });
    await history.locator(".history-list button").first().click();
    await history
      .locator("pre")
      .getByText("Before revision", { exact: true })
      .waitFor();
    await history.getByRole("button", { name: "Restore as new note" }).click();
    await history.waitFor({ state: "hidden" });
    await page.waitForTimeout(800);
    await page.evaluate(fixture);
    const restored = await page.evaluate(async () =>
      globalThis.fixture.data.load(),
    );
    assert.equal(
      restored.tables.bullets.find((n) => n.id === "history-source").text,
      "After revision",
    );
    assert.equal(
      restored.tables.bullets.filter((n) => n.text === "Before revision")
        .length,
      1,
    );
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(700);
    await page.evaluate(fixture);
    assert.equal(
      (
        await page.evaluate(async () => globalThis.fixture.data.load())
      ).tables.bullets.filter((n) => n.text === "Before revision").length,
      0,
      "Restore is undoable without replacing the original",
    );
    if (mobile)
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Backups", exact: true }).click();
    const tools = page.getByRole("region", { name: "Markdown and OPML" });
    const before = await page.evaluate(async () =>
      globalThis.fixture.data.load(),
    );
    await page
      .locator(".portability-tools > input[type=file]")
      .setInputFiles({
        name: "Reading.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("- Book list\n  1. **Read this**"),
      });
    const preview = page.getByRole("dialog", { name: "Review note import" });
    await preview.waitFor();
    await page.evaluate(fixture);
    assert.equal(
      (await page.evaluate(async () => globalThis.fixture.data.load())).tables
        .bullets.length,
      before.tables.bullets.length,
      "Preview is not an import",
    );
    await preview.getByRole("button", { name: "Import as new branch" }).click();
    await preview.waitFor({ state: "hidden" });
    await page.waitForTimeout(800);
    const downloading = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export Markdown + OPML ZIP" })
      .click();
    const download = await downloading,
      bytes = await readFile(await download.path()),
      zip = await JSZip.loadAsync(bytes);
    assert.ok(zip.file("notes.md"));
    assert.ok(zip.file("notes.opml"));
    const manifest = JSON.parse(await zip.file("notes.json").async("string"));
    assert.ok(manifest.bullets.some((n) => n.text === "Read this"));
    assert.ok(
      manifest.bullets.some((n) => n.text === "Import report · Reading.md"),
    );
    assert.ok(
      manifest.bullets.some(
        (n) => n.id === "history-source" && n.text === "After revision",
      ),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "No page overflow",
    );
    assert.deepEqual(errors, []);
    if (process.env.HISTORY_SCREENSHOTS)
      await page.screenshot({
        path:
          process.env.HISTORY_SCREENSHOTS +
          (mobile ? "-phone.png" : "-desktop.png"),
      });
    await page.reload();
    await page.locator(".app").waitFor();
    await page.evaluate(fixture);
    const reloaded = await page.evaluate(async () =>
      globalThis.fixture.data.load(),
    );
    assert.ok(reloaded.tables.bullets.some((n) => n.text === "Read this"));
    assert.ok(
      (
        await page.evaluate(async () =>
          globalThis.fixture.data.noteHistory("history-source"),
        )
      ).length >= 2,
    );
    console.log(
      "History/portability " +
        (mobile ? "phone dark" : "desktop light") +
        ": revision preview, copy restore/undo, import preview/save/report, Markdown/OPML export, history reload and no overflow passed",
    );
    await context.close();
  }
} finally {
  await browser.close();
}
