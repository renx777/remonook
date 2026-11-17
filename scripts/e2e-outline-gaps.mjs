// No blank gaps between bullets: an Enter that arrives as a paragraph split (Android keyboards send
// it while composing, without a usable key event) starts a new bullet, and blank lines at the end of
// a bullet are not drawn. GAPS_URL defaults to the local web app.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ["--no-sandbox"],
});
const gaps = (page) =>
  page.evaluate(() => {
    const rows = [...document.querySelectorAll(".outline-row")].map((el) => el.getBoundingClientRect()).sort((a, b) => a.top - b.top);
    return rows.slice(1).map((r, i) => Math.round(r.top - rows[i].bottom)).filter((d) => d > 3);
  });
try {
  for (const mobile of [false, true]) {
    const page = await (await browser.newContext(mobile ? { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } })).newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const rows = async () => (await page.locator(".outline-row").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
    await page.goto(process.env.GAPS_URL || "http://127.0.0.1:5197");
    await page.getByText("Try as a guest", { exact: true }).click();
    if (mobile) await page.getByRole("button", { name: "Notes", exact: true }).last().click();
    else await page.getByRole("button", { name: /^Notes/ }).first().click();
    await page.getByText("Ideas", { exact: true }).click();
    await page.waitForTimeout(250);
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Alpha");
    // What an Android keyboard does: the paragraph splits inside the editor, no Enter key event.
    await page.evaluate(() => document.querySelector(".tiptap.ProseMirror-focused, .tiptap").editor.commands.splitBlock());
    await page.waitForTimeout(300);
    await page.keyboard.type("Beta");
    await page.waitForTimeout(300);
    const list = await rows();
    assert.ok(list.includes("Alpha") && list.includes("Beta"), "the split became two bullets: " + JSON.stringify(list));
    // A blank line left at the end of a bullet is not drawn as a gap.
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    assert.deepEqual(await gaps(page), [], "no blank gaps between bullets");
    assert.deepEqual(errors, []);
    console.log(`Outline gaps ${mobile ? "phone" : "desktop"}: split Enter makes a new bullet; trailing blank lines hidden`);
  }
} finally {
  await browser.close();
}
