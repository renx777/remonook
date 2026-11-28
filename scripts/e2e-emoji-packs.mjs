// Isolated guest contexts; never operates on a signed-in account.
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const url = process.env.EMOJI_URL || "http://127.0.0.1:5221";
if (
  !/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(url) &&
  url !== "https://staging.remonook.com"
)
  throw Error("Local or staging only.");
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
      ...(process.env.EMOJI_IGNORE_TLS ? { ignoreHTTPSErrors: true } : {}),
    });
    const page = await context.newPage(),
      errors = [],
      requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(20000);
    const bodies = {
      twemoji: await readFile("tests/fixtures/static-emoji/twemoji.svg"),
      openmoji: await readFile("tests/fixtures/static-emoji/openmoji.svg"),
    };
    // Exact, pinned upstream fixture bytes for insertion; no external service dependency.
    await page.route("https://raw.githubusercontent.com/**", async (route) => {
      requests.push(route.request().url());
      const pack = route.request().url().includes("openmoji")
        ? "openmoji"
        : "twemoji";
      if (/\/1[fF]600\.svg$/.test(route.request().url()))
        await route.fulfill({
          status: 200,
          contentType: "image/svg+xml",
          body: bodies[pack],
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      else await route.abort();
    });
    await page.goto(url + "/#app");
    await page.locator(".outline-scroll").waitFor();
    await page.evaluate(fixture);
    await page.evaluate(async () => {
      const { data, bullet } = globalThis.fixture;
      await data.save(
        await data.load(),
        data.withNodes(data.empty(), [
          bullet("emoji-source", { text: "My collection #views" }),
          bullet("emoji-note", {
            parentId: "emoji-source",
            text: "Expression ",
          }),
        ]),
        "emoji fixture",
      );
    });
    await page.reload();
    await page
      .locator('[data-node-id="emoji-source"] [aria-label="Zoom into bullet"]')
      .click();
    const row = page.locator('[data-node-id="emoji-note"]');
    const open = async () => {
      await row.locator(".text-button").click();
      await page.locator(".tiptap:focus").waitFor();
      await page.keyboard.press("End");
      await page.keyboard.type(" :grinning_face", { delay: 15 });
      await page.locator(".inline-emoji-picker").waitFor();
    };
    await open();
    const picker = page.locator(".inline-emoji-picker"),
      tabs = picker.getByRole("tablist", { name: "Emoji artwork collection" });
    for (const name of ["Twemoji", "OpenMoji"]) {
      await tabs.getByRole("tab", { name, exact: true }).click();
      await picker
        .getByRole("combobox", { name: "Search emoji" })
        .fill("1f600");
      await picker
        .locator('[data-emoji-token=":' + name.toLowerCase() + '_1f600:"]')
        .first()
        .waitFor();
      if (process.env.EMOJI_SCREENSHOTS)
        await page.screenshot({
          path:
            process.env.EMOJI_SCREENSHOTS +
            "-" +
            name.toLowerCase() +
            "-" +
            (mobile ? "phone" : "desktop") +
            ".png",
        });
      await picker.getByRole("button", { name: "Insert", exact: true }).click();
      await picker.waitFor({ state: "hidden" });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      await page.evaluate(fixture);
      const saved = await page.evaluate(async () =>
        globalThis.fixture.data.load(),
      );
      assert.ok(
        saved.tables.bullets
          .find((n) => n.id === "emoji-note")
          .text.includes(":" + name.toLowerCase() + "_1f600:"),
      );
      await open();
    }
    assert.equal(
      await tabs
        .getByRole("tab", { name: "OpenMoji", exact: true })
        .getAttribute("aria-selected"),
      "true",
      "provider choice persists",
    );
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.evaluate(fixture);
    const assets = await page.evaluate(async () =>
      [...(await globalThis.fixture.data.getAssets())].map(([p, b]) => ({
        path: p,
        text: b.type === "image/svg+xml" ? null : "",
      })),
    );
    assert.ok(assets.some((a) => a.path === "emoji/twemoji_1f600.svg"));
    assert.ok(assets.some((a) => a.path === "emoji/openmoji_1f600.svg"));
    await page.reload();
    await row.waitFor();
    await row.locator(".static-emoji.is-ready").first().waitFor();
    const before = requests.filter((u) => /\/1[fF]600\.svg$/.test(u)).length;
    await context.setOffline(true);
    await open();
    await tabs.getByRole("tab", { name: "Twemoji", exact: true }).click();
    await picker.getByRole("combobox", { name: "Search emoji" }).fill("1f600");
    await picker.getByRole("button", { name: "Insert", exact: true }).click();
    await picker.waitFor({ state: "hidden" });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    assert.equal(
      requests.filter((u) => /\/1[fF]600\.svg$/.test(u)).length,
      before,
      "saved SVG reused without provider requests",
    );
    await context.setOffline(false);
    await page.evaluate(fixture);
    const saved = await page.evaluate(async () =>
      globalThis.fixture.data.load(),
    );
    assert.equal(
      (
        saved.tables.bullets
          .find((n) => n.id === "emoji-note")
          .text.match(/:twemoji_1f600:/g) || []
      ).length,
      2,
    );
    // The full picker shares the preference and can reuse the same saved artwork.
    await row.locator(".text-button").click();
    await row.locator('button[aria-label="Bullet actions"]:visible').click();
    await page.locator('[data-category="1"]').click();
    await page
      .getByRole("button", { name: "Insert emoji…", exact: true })
      .click();
    const full = page.getByRole("dialog", { name: "Emojis", exact: true });
    await full
      .getByRole("group", { name: "Emoji artwork collection", exact: true })
      .getByRole("button", { name: "OpenMoji", exact: true })
      .click();
    await full
      .getByRole("textbox", { name: "Find an emoji", exact: true })
      .fill("1f600");
    assert.equal(
      await full.locator(".emoji-replay").count(),
      0,
      "Static collection has no replay control",
    );
    await full.locator(".emoji-about summary").click();
    await full
      .getByRole("link", { name: "CC BY-SA 4.0", exact: true })
      .waitFor();
    await full
      .getByRole("button", { name: "Insert Grinning face", exact: true })
      .click();
    await full.waitFor({ state: "hidden" });
    await page.waitForTimeout(400);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(400);
    await page.evaluate(fixture);
    const undone = await page.evaluate(async () =>
      globalThis.fixture.data.load(),
    );
    assert.equal(
      (
        undone.tables.bullets
          .find((n) => n.id === "emoji-note")
          .text.match(/:openmoji_1f600:/g) || []
      ).length,
      1,
      "One undo reverses the full-picker insertion",
    );
    await page.getByRole("button", { name: "Grid view", exact: true }).click();
    await page
      .locator(".collection-page .static-emoji.is-ready")
      .first()
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "no page overflow",
    );
    assert.deepEqual(errors, []);
    console.log(
      "Emoji packs " +
        (mobile ? "phone dark" : "desktop light") +
        ": choose, insert, preferences, reload, offline reuse and Grid rendering passed.",
    );
    await context.close();
  }
} finally {
  await browser.close();
}
