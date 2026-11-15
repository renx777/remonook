// Canvas phase 1 acceptance: Canvases parent, title sync, card placement, multi-select drag,
// Delete, duplicate, nudge, Group selection, link form, zoom controls. CANVAS_URL defaults to the local web app.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ["--no-sandbox"],
});
const rects = (page) =>
  page.$$eval(".react-flow__node", (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset.id, x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(),
    errors = [];
  page.on("pageerror", (e) => { if (!/ResizeObserver/.test(e.message)) errors.push(e.message); });
  await page.goto(process.env.CANVAS_URL || "http://127.0.0.1:5197");
  await page.getByText("Try as a guest", { exact: true }).click();
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await page.getByRole("button", { name: "＋ New canvas", exact: true }).click();
  // Title: typing does not save per keystroke; one undo restores the old name. Notes follows.
  const title = page.getByRole("textbox", { name: "Canvas title" });
  await title.fill("Plan");
  await title.press("Enter");
  await page.getByRole("button", { name: "Undo canvas change" }).click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Canvas title"]').value === "Untitled canvas");
  await page.getByRole("button", { name: "Redo canvas change" }).click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Canvas title"]').value === "Plan");
  // Placement: three new cards never overlap.
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Add text card" }).click();
    await page.locator(".canvas-card-editor").waitFor();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  }
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(400);
  let r = await rects(page);
  assert.equal(r.length, 3);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(!overlap(r[i], r[j]), "new cards do not overlap");
  // Multi-select drag: both selected cards keep their new place.
  const nodes = page.locator(".react-flow__node");
  await nodes.nth(0).click({ position: { x: 20, y: 20 } });
  await nodes.nth(1).click({ position: { x: 20, y: 20 }, modifiers: ["Shift"] });
  assert.equal(await page.locator(".react-flow__node.selected").count(), 2);
  await page.getByRole("toolbar", { name: "Selected cards" }).waitFor();
  const b0 = await nodes.nth(0).boundingBox(), before = await rects(page);
  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
  await page.mouse.down();
  await page.mouse.move(b0.x + b0.width / 2 + 100, b0.y + b0.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await rects(page);
  const dx = after[0].x - before[0].x;
  assert.ok(dx > 50, "the dragged card moved");
  assert.ok(Math.abs(after[1].x - before[1].x - dx) < 1, "the other selected card moved with it and stayed");
  assert.ok(Math.abs(after[2].x - before[2].x) < 1, "unselected card did not move");
  // Group wraps only the selection.
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await page.getByRole("textbox", { name: "Group label" }).press("Enter");
  const group = await page.locator(".react-flow__node.selected").boundingBox();
  const inner = await rects(page);
  const g = { x: group.x, y: group.y, w: group.width, h: group.height };
  assert.ok(inner.filter((n) => n.x >= g.x && n.y >= g.y && n.x + n.w <= g.x + g.w + 1 && n.y + n.h <= g.y + g.h + 1 && Math.abs(n.w - g.w) > 2).length === 2, "group wraps the two selected cards");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".react-flow__node.selected").count(), 0, "Escape clears the selection");
  // Duplicate, nudge, Delete.
  await page.locator(`.react-flow__node[data-id="${before[2].id}"]`).click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("Control+d");
  await page.waitForTimeout(300);
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length === 5);
  const dup = await page.locator(".react-flow__node.selected").boundingBox();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(700);
  const nudged = await page.locator(".react-flow__node.selected").boundingBox();
  assert.ok(nudged.x - dup.x > 15, "arrow keys nudge and the move is kept");
  const trashBefore = await page.getByRole("button", { name: /^Trash/ }).getAttribute("aria-label");
  await page.keyboard.press("Delete");
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length === 4);
  const trashAfter = await page.getByRole("button", { name: /^Trash/ }).getAttribute("aria-label");
  assert.notEqual(trashAfter, trashBefore, "the deleted card's own note went to Trash");
  // Link card via the form, no placeholder URL.
  await page.getByRole("button", { name: "Add web link" }).click();
  await page.getByRole("textbox", { name: /Web link/ }).fill("example.org/page");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByText("https://example.org/page").first().waitFor();
  // Zoom controls show their icons.
  const icon = await page.locator(".react-flow__controls button svg").first().boundingBox();
  assert.ok(icon && icon.width > 8, "zoom icons are visible");
  await page.screenshot({ path: process.env.SHOT || "/tmp/canvas-phase1.png" });
  // Notes: the board sits under one "Canvases" bullet, renamed with the board.
  await page.getByRole("button", { name: "Notes", exact: true }).first().click();
  const tops = await page.$$eval(".outline > .node-row, .tree > li", (els) => els.length).catch(() => 0);
  const text = await page.locator("main").innerText();
  assert.ok(text.includes("Canvases"), "Notes shows the Canvases bullet");
  assert.ok(!text.includes("Untitled canvas"), "the board bullet was renamed");
  assert.deepEqual(errors, []);
  console.log("Canvas phase 1: title, placement, multi-drag, group, keyboard, trash, link form, controls and Notes passed");
} finally {
  await browser.close();
}
