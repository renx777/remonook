// Canvas phase 4 acceptance: alignment guides, sections and presenting, AI menu (signed out),
// deleting an archived board for good, and a 400-card board staying responsive while dragging.
// CANVAS_URL defaults to the local web app; SHOT sets the screenshot path prefix.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const shot = process.env.SHOT || "/tmp/canvas-phase4";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ["--no-sandbox"],
});
const paste = (page, text) =>
  page.evaluate((text) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  }, text);
// A JSON Canvas file with `count` text cards in a grid and connections between neighbours.
const bigCanvas = (count) => {
  const nodes = [],
    edges = [];
  for (let i = 0; i < count; i++)
    nodes.push({ id: "n" + i, type: "text", text: `Card ${i}\n\n- point one\n- point two`, x: (i % 20) * 320, y: Math.floor(i / 20) * 220, width: 260, height: 160 });
  for (let i = 1; i < Math.min(count, 600); i++) if (i % 20) edges.push({ id: "e" + i, fromNode: "n" + (i - 1), toNode: "n" + i });
  return JSON.stringify({ nodes, edges });
};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => { if (!/ResizeObserver/.test(e.message)) errors.push(e.message); });
  page.on("dialog", (d) => d.accept());
  await page.goto(process.env.CANVAS_URL || "http://127.0.0.1:5197");
  await page.getByText("Try as a guest", { exact: true }).click();
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await page.getByRole("button", { name: "＋ New canvas", exact: true }).click();
  await page.getByRole("button", { name: "Snap to grid" }).click(); // guides on their own
  // Alignment guides: drag a card level with another; it lines up and the guide shows.
  await paste(page, "Anchor card");
  await paste(page, "Moving card");
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(400);
  const anchor = page.locator(".react-flow__node", { hasText: "Anchor card" }),
    mover = page.locator(".react-flow__node", { hasText: "Moving card" });
  const a = await anchor.boundingBox(),
    m = await mover.boundingBox();
  await page.mouse.move(m.x + m.width / 2, m.y + m.height / 2);
  await page.mouse.down();
  const targetY = a.y + 3 - m.y; // a few pixels off the anchor's top edge
  await page.mouse.move(m.x + m.width / 2 + 40, m.y + m.height / 2 + targetY / 2, { steps: 5 });
  await page.mouse.move(m.x + m.width / 2 + 80, m.y + m.height / 2 + targetY, { steps: 5 });
  assert.ok(await page.locator(".canvas-guide").count(), "a guide line shows while aligned");
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".canvas-guide").count(), 0, "guides clear when the drag ends");
  assert.ok(Math.abs((await mover.boundingBox()).y - (await anchor.boundingBox()).y) < 1.5, "the card snapped level with the other");
  // Sections: two groups, listed, and presented in order.
  await page.locator(".react-flow__node", { hasText: "Anchor card" }).click();
  await page.getByRole("button", { name: "Add group" }).click();
  await page.getByRole("textbox", { name: "Group label" }).fill("Intro");
  await page.getByRole("textbox", { name: "Group label" }).press("Enter");
  await page.keyboard.press("Escape");
  await page.locator(".react-flow__node", { hasText: "Moving card" }).click();
  await page.getByRole("button", { name: "Add group" }).click();
  await page.getByRole("textbox", { name: "Group label" }).fill("Details");
  await page.getByRole("textbox", { name: "Group label" }).press("Enter");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Sections and presenting" }).click();
  const sections = page.getByRole("dialog", { name: "Sections" });
  assert.equal(await sections.locator("li").count(), 2);
  await sections.getByRole("button", { name: "Present" }).click();
  const bar = page.getByRole("toolbar", { name: "Presenting" });
  await bar.getByText(/1 \/ 2/).waitFor();
  await page.keyboard.press("ArrowRight");
  await bar.getByText(/2 \/ 2/).waitFor();
  assert.equal(await page.locator(".canvas-dock").isVisible(), false, "editing tools hide while presenting");
  await page.screenshot({ path: `${shot}-present.png` });
  await bar.getByRole("button", { name: "Exit" }).click();
  await page.locator(".canvas-dock").waitFor();
  // AI menu: signed out, it explains and its actions are off.
  await page.locator(".react-flow__node", { hasText: "Anchor card" }).click();
  await page.getByRole("button", { name: "AI", exact: true }).click();
  await page.getByText("Sign in to use AI on the board.").waitFor();
  assert.equal(await page.getByRole("menuitem", { name: "Summarize into a card" }).isDisabled(), true);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  // Archive, then delete for good: gone from the list, notes in Trash.
  const trashBefore = await page.getByRole("button", { name: /^Trash/ }).getAttribute("aria-label");
  await page.getByLabel("Canvas options").click();
  await page.getByRole("button", { name: "Archive canvas" }).click();
  await page.getByText("Archived canvases").click();
  await page.getByRole("button", { name: "Delete for good" }).click();
  await page.waitForFunction(() => !document.querySelector(".canvas-archived"));
  assert.notEqual(await page.getByRole("button", { name: /^Trash/ }).getAttribute("aria-label"), trashBefore);
  // 400 cards: import, then a card drag stays smooth (frames counted while dragging).
  await page.locator('input[type=file][accept=".canvas,application/json"]').setInputFiles({ name: "Big board.canvas", mimeType: "application/json", buffer: Buffer.from(bigCanvas(400)) });
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length > 20, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const card = page.locator(".react-flow__node").first(),
    c = await card.boundingBox();
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__frames.length < 2000) window.__raf = requestAnimationFrame(tick); };
    window.__raf = requestAnimationFrame(tick);
  });
  const started = Date.now();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 40; i++) await page.mouse.move(c.x + c.width / 2 + i * 6, c.y + c.height / 2 + i * 3);
  await page.mouse.up();
  const elapsed = Date.now() - started;
  const frames = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__frames; });
  const slow = frames.filter((f) => f > 100).length,
    worst = Math.round(Math.max(...frames));
  console.log(`400 cards: 40-step drag took ${elapsed} ms; worst frame ${worst} ms; ${slow} frames over 100 ms`);
  assert.ok(elapsed < 8000, "dragging on a 400-card board stays responsive");
  await page.screenshot({ path: `${shot}-400.png` });
  assert.deepEqual(errors, []);
  console.log("Canvas phase 4: alignment guides, sections and presenting, AI menu, delete for good and 400-card drag passed");
} finally {
  await browser.close();
}
