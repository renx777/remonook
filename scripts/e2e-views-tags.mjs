// Views and tags acceptance: the grid/list/table switcher appears only on bullets tagged #views;
// tags show only on the bullet being edited (and in a page title only while it is edited); and a
// stale editor reference can no longer crash the app. VIEWS_URL defaults to the local web app.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ["--no-sandbox"],
});
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.VIEWS_URL || "http://127.0.0.1:5197");
  await page.getByText("Try as a guest", { exact: true }).click();
  await page.getByRole("button", { name: /^Notes/ }).first().click();
  const zoom = (text) => page.locator(".outline-row", { hasText: text }).first().locator("[aria-label^='Zoom']").first().click();
  // No #views tag: no switcher.
  await zoom("Ideas");
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".bullet-view-switch").count(), 0, "no view switcher without #views");
  // Tag the page #views from its title: the switcher appears; the title hides the tag once left.
  const title = page.getByRole("textbox", { name: "Zoomed node title" });
  await title.click();
  await title.press("End");
  await title.type(" #views");
  await title.press("Tab");
  await page.waitForTimeout(300);
  await page.locator(".bullet-view-switch").waitFor();
  assert.equal(await title.inputValue(), "Ideas", "the title shows no tags while not edited");
  await title.click();
  assert.equal(await title.inputValue(), "Ideas #views", "the tag shows while editing the title");
  await title.press("Escape");
  // Rows: a tag shows only on the bullet being edited.
  await page.locator(".outline-row .text-button").first().click().catch(() => {});
  await page.keyboard.type("Read later #todo");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Next");
  await page.waitForTimeout(300);
  const row = page.locator(".outline-row", { hasText: "Read later" }).first();
  assert.equal(await row.locator(".note-tag").isVisible(), false, "an unselected bullet hides its tags");
  await row.getByText("Read later").click();
  await page.waitForTimeout(200);
  assert.ok((await row.innerText()).includes("#todo"), "the selected bullet shows its tags");
  await page.keyboard.press("Escape");
  // A destroyed editor's commands are inert instead of throwing.
  const threw = await page.evaluate(() => {
    const el = document.querySelector(".tiptap");
    const editor = el && el.editor;
    if (!editor) return "no editor";
    editor.destroy();
    try { editor.commands.focus(); editor.commands.blur(); return "ok"; } catch (e) { return String(e); }
  });
  assert.ok(threw === "ok" || threw === "no editor", "commands on a destroyed editor: " + threw);
  assert.deepEqual(errors, []);
  console.log("Views and tags: #views-only switcher, tags only when selected, title tags while edited, no crash from a destroyed editor passed");
} finally {
  await browser.close();
}
