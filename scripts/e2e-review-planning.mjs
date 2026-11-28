// Fresh guest workspaces only; never writes to the signed-in staging test account.
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import assert from "node:assert/strict";
const url = process.env.REVIEW_URL || "http://127.0.0.1:5219";
if (
  !/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(url) &&
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
      ...(process.env.REVIEW_IGNORE_TLS ? { ignoreHTTPSErrors: true } : {}),
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(20000);
    await page.goto(url + "/#app");
    await page.locator(".outline-scroll").waitFor();
    await page.evaluate(fixture);
    await page.evaluate(async () => {
      const { data, bullet } = globalThis.fixture,
        d = data.empty();
      d.tables.decks = [
        { rootId: "review-deck", createdAt: Date.now(), pinned: 0 },
      ];
      const nodes = [
        bullet("review-deck", { text: "Review Biology" }),
        ...Array.from({ length: 6 }, (_, i) => [
          bullet("rq" + i, {
            parentId: "review-deck",
            position: i,
            text: "Question " + i,
            kind: "QUESTION",
          }),
          bullet("ra" + i, { parentId: "rq" + i, text: "Answer " + i }),
        ]).flat(),
        bullet("research-source", { position: 1, text: "Research source" }),
        bullet("review-task", {
          position: 2,
          text: "Prepare review",
          taskState: "TODO",
        }),
      ];
      await data.save(
        await data.load(),
        data.withNodes(d, nodes),
        "guest review fixture",
      );
    });
    await page.reload();
    await page.locator(".outline-scroll").waitFor();
    const go = async (name) => {
      if (mobile) {
        const nav = page.getByRole("button", {
          name: "Open navigation",
          exact: true,
        });
        if (await nav.isVisible()) await nav.click();
      }
      await page
        .locator(".sidebar-nav")
        .getByRole("button", { name: new RegExp("^" + name + "(?:\\s|$)") })
        .click();
    };
    const load = async () => {
      await page.evaluate(fixture);
      return page.evaluate(async () => globalThis.fixture.data.load());
    };
    const undo = async (redo) => {
      if (mobile) {
        await page.getByRole("button", { name: "Outline options" }).click();
        await page
          .getByRole("button", {
            name: redo ? "Redo last change" : "Undo last change",
          })
          .click();
      } else
        await page
          .locator(".topbar")
          .getByRole("button", { name: redo ? "Redo" : "Undo", exact: true })
          .click();
    };
    const before = await load();
    await go("Tasks");
    await page
      .getByRole("button", { name: "Weekly review", exact: true })
      .click();
    let dialog = page.getByRole("dialog", {
      name: "Weekly review",
      exact: true,
    });
    await dialog
      .getByLabel("Wins", { exact: true })
      .fill("I kept my study habit.");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Weekly review", exact: true })
      .click();
    assert.equal(
      await dialog.getByLabel("Wins", { exact: true }).inputValue(),
      "I kept my study habit.",
    );
    await dialog
      .getByLabel("Next week", { exact: true })
      .fill("Learn Biology.");
    if (process.env.REVIEW_SCREENSHOTS)
      await page.screenshot({
        path:
          process.env.REVIEW_SCREENSHOTS +
          "-weekly-" +
          (mobile ? "phone" : "desktop") +
          ".png",
      });
    await dialog
      .getByRole("button", { name: "Save review note", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForTimeout(500);
    let d = await load();
    assert.equal(
      d.tables.bullets.find((n) => n.id === "review-task").taskState,
      "TODO",
    );
    assert.equal(
      d.tables.bullets.filter((n) => n.text.includes("#WeeklyReview")).length,
      1,
    );
    assert.deepEqual(
      d.tables.cards,
      before.tables.cards,
      "weekly review preserves scheduling",
    );

    await go("Study Desk");
    await page
      .getByRole("button", { name: "Study goals", exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: "Study goals", exact: true });
    await dialog
      .getByLabel("Goal title", { exact: true })
      .fill("Biology this week");
    await dialog
      .getByLabel("Deck", { exact: true })
      .selectOption("review-deck");
    await dialog
      .getByLabel("New cards to introduce", { exact: true })
      .fill("4");
    await dialog
      .getByRole("button", { name: "Create study goal", exact: true })
      .click();
    await dialog
      .getByRole("heading", { name: "Biology this week", exact: true })
      .waitFor();
    d = await load();
    assert.deepEqual(
      d.tables.cards,
      before.tables.cards,
      "goal creation preserves FSRS",
    );
    assert.equal(
      d.tables.bullets.filter((n) => n.text.includes("#StudyGoal")).length,
      1,
    );
    if (process.env.REVIEW_SCREENSHOTS)
      await page.screenshot({
        path:
          process.env.REVIEW_SCREENSHOTS +
          "-goals-" +
          (mobile ? "phone" : "desktop") +
          ".png",
      });
    await dialog
      .getByRole("button", { name: "Study due cards", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForTimeout(400);
    d = await load();
    assert.equal(d.tables.study_sessions.at(-1).mode, "SPACED");
    const session = JSON.stringify(d.tables.study_sessions);
    await page
      .getByRole("button", { name: "Pause and return", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Study goals", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Study goals", exact: true })
      .getByRole("button", { name: "Resume current session", exact: true })
      .click();
    assert.equal(
      JSON.stringify((await load()).tables.study_sessions),
      session,
      "resume keeps the existing queue",
    );
    await page
      .getByRole("button", { name: "Pause and return", exact: true })
      .click();
    await go("Notes");
    await page
      .locator(
        '[data-node-id="research-source"] [aria-label="Zoom into bullet"]',
      )
      .click();
    await page.getByRole("button", { name: "Sources", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Sources", exact: true });
    await dialog
      .getByLabel("Title", { exact: true })
      .fill("A useful reference");
    await dialog.getByLabel("Author", { exact: true }).fill("Research Group");
    await dialog.getByLabel("Published", { exact: true }).fill("2026");
    await dialog
      .getByLabel("URL", { exact: true })
      .fill("https://example.com/reference");
    await dialog
      .getByLabel("Quote (optional)", { exact: true })
      .fill("Exact words\nand a second line.");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.reload();
    await page.getByRole("button", { name: "Sources", exact: true }).click();
    assert.equal(
      await dialog.getByLabel("Title", { exact: true }).inputValue(),
      "A useful reference",
      "citation draft survives reload",
    );
    await dialog
      .getByRole("button", { name: "Save citation", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Edit citation", exact: true })
      .waitFor();
    d = await load();
    assert.equal(
      d.tables.bullets.find((n) => n.id === "research-source").text,
      "Research source",
    );
    assert.deepEqual(
      d.tables.cards,
      before.tables.cards,
      "citations do not change question or answer content",
    );
    const references = d.tables.bullets.find(
      (n) => n.text === "References #References",
    );
    assert.equal(references.parentId, null);
    await dialog
      .getByRole("button", { name: "Edit citation", exact: true })
      .click();
    await dialog.getByLabel("URL", { exact: true }).fill("javascript:alert(1)");
    await dialog
      .getByRole("button", { name: "Save citation", exact: true })
      .click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(
      (await load()).tables.bullets.filter((n) => n.text.includes("#Citation"))
        .length,
      1,
    );
    await dialog
      .getByLabel("URL", { exact: true })
      .fill("https://example.com/updated");
    await dialog
      .getByRole("button", { name: "Save citation", exact: true })
      .click();
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await undo(false);
    await page.waitForTimeout(400);
    assert.ok(
      (await load()).tables.bullets.some(
        (n) => n.text === "URL: https://example.com/reference",
      ),
      "citation update is one undoable edit",
    );
    await undo(true);
    await page.waitForTimeout(400);
    assert.ok(
      (await load()).tables.bullets.some(
        (n) => n.text === "URL: https://example.com/updated",
      ),
    );
    await page.getByRole("button", { name: "Sources", exact: true }).click();
    const download = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: "Export CSL-JSON", exact: true })
      .click();
    assert.equal((await download).suggestedFilename(), "citations.json");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "no horizontal page overflow",
    );
    assert.equal(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      true,
      "no dialog overflow",
    );
    if (process.env.REVIEW_SCREENSHOTS)
      await page.screenshot({
        path:
          process.env.REVIEW_SCREENSHOTS +
          "-sources-" +
          (mobile ? "phone" : "desktop") +
          ".png",
      });
    assert.deepEqual(errors, []);
    console.log(
      "Review planning " +
        (mobile ? "phone dark" : "desktop light") +
        ": weekly review, drafts/reload, goal/FSRS, session resume, citations/exports and overflow passed.",
    );
    await context.close();
  }
} finally {
  await browser.close();
}
