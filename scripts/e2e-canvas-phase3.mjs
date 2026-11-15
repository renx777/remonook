// Canvas phase 3 acceptance: easy resizing of image and video cards (handles, size menu, over a
// playing video), the side panel (search, keyboard, drag onto the board, lay out with children),
// cards to an outline, "Open canvas" from Notes and reopening the last board.
// CANVAS_URL defaults to the local web app; SHOT sets the screenshot path prefix.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const shot = process.env.SHOT || "/tmp/canvas-phase3";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ["--no-sandbox"],
});
const paste = (page, what) =>
  page.evaluate(async (what) => {
    const dt = new DataTransfer();
    if (what.image) {
      const c = document.createElement("canvas");
      c.width = what.image[0];
      c.height = what.image[1];
      c.getContext("2d").fillStyle = "#4a90d9";
      c.getContext("2d").fillRect(0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      dt.items.add(new File([blob], "shot.png", { type: "image/png" }));
    } else dt.setData("text/plain", what.text);
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  }, what);
// Drags a selected card's bottom-right resize handle by (dx, dy) screen pixels.
async function dragCorner(page, card, dx, dy) {
  const h = await card.locator(".react-flow__resize-control.handle.bottom.right").boundingBox();
  assert.ok(h && h.width >= 10, "corner handle is big enough to grab");
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + dx, h.y + h.height / 2 + dy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => { if (!/ResizeObserver/.test(e.message)) errors.push(e.message); });
  await page.goto(process.env.CANVAS_URL || "http://127.0.0.1:5197");
  await page.getByText("Try as a guest", { exact: true }).click();
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await page.getByRole("button", { name: "＋ New canvas", exact: true }).click();
  // Image: grab the corner handle and drag; it grows and keeps its shape.
  await paste(page, { image: [800, 400] });
  const image = page.locator(".react-flow__node:has(.is-image)").first();
  await image.locator("img").waitFor();
  let before = await image.boundingBox();
  await dragCorner(page, image, 120, 0);
  let after = await image.boundingBox();
  assert.ok(after.width > before.width + 60, "image grows from its corner");
  assert.ok(Math.abs(after.width / after.height - before.width / before.height) < 0.08, "image keeps its shape");
  // Size menu on the floating bar.
  await page.getByRole("button", { name: "Size", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Small/ }).click();
  await page.waitForTimeout(200);
  assert.ok((await image.boundingBox()).width < after.width - 40, "Small makes it smaller");
  // Video: play it, then resize from the corner across the player.
  await page.keyboard.press("Escape");
  await paste(page, { text: "https://youtu.be/dQw4w9WgXcQ" });
  const video = page.locator(".react-flow__node:has(.is-video)").first();
  await video.getByRole("button", { name: /Play YouTube video/ }).click();
  await video.locator("iframe").waitFor();
  await video.locator(".canvas-card-strip").click({ position: { x: 60, y: 8 } });
  before = await video.boundingBox();
  await dragCorner(page, video, -160, 0);
  after = await video.boundingBox();
  assert.ok(after.width < before.width - 80, "video shrinks from its corner, over the playing player");
  await page.getByRole("button", { name: "Size", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Large/ }).click();
  await page.waitForTimeout(200);
  assert.ok((await video.boundingBox()).width > after.width + 80, "Large makes the video bigger");
  // Side panel: search with the keyboard, add, lay out with children, drag onto the board.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add from Notes and library" }).click();
  const search = page.getByRole("textbox", { name: "Search notes" });
  await search.fill("Write a bullet");
  await search.press("Enter");
  await page.locator(".canvas-markdown", { hasText: "Write a bullet" }).waitFor();
  await search.fill("Welcome");
  const count = await page.locator(".react-flow__node").count(),
    edgeCount = await page.locator(".react-flow__edge").count();
  await page.getByRole("button", { name: /Lay out Welcome to RemoNook with its children/ }).click();
  await page.waitForFunction((n) => document.querySelectorAll(".react-flow__node").length >= n + 3, count);
  assert.ok((await page.locator(".react-flow__edge").count()) >= edgeCount + 2, "children are connected to their parent");
  await search.fill("Ideas");
  const row = page.getByRole("option", { name: /Ideas/ }).first(),
    stage = await page.locator(".canvas-stage").boundingBox();
  const n2 = await page.locator(".react-flow__node").count();
  await row.dragTo(page.locator(".canvas-stage"), { targetPosition: { x: stage.width - 300, y: 120 } });
  await page.waitForFunction((n) => document.querySelectorAll(".react-flow__node").length === n + 1, n2);
  for (const tab of ["Highlights", "Flashcards", "Bookmarks"]) {
    await page.getByRole("tab", { name: tab }).click();
    await page.locator(".canvas-sources ul").waitFor();
  }
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shot}-desktop.png` });
  // Two cards to an outline in Notes.
  await paste(page, { text: "First point" });
  await paste(page, { text: "Second point" });
  await page.locator(".canvas-markdown", { hasText: "First point" }).click();
  await page.locator(".canvas-markdown", { hasText: "Second point" }).click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Turn into outline" }).click();
  await page.getByText("added to Notes as an outline").waitFor();
  // "Open in Notes" on a board card shows the board's page with "Open canvas"; it comes back.
  await page.keyboard.press("Escape");
  await page.locator(".canvas-markdown", { hasText: "First point" }).click();
  await page.getByRole("toolbar", { name: "Selected cards" }).getByRole("button", { name: "Open in Notes" }).click();
  await page.getByText("This page is a canvas.").waitFor();
  await page.getByRole("button", { name: "Open canvas" }).click();
  await page.locator(".canvas-markdown", { hasText: "First point" }).waitFor();
  // The last board reopens after a reload.
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await page.locator(".canvas-markdown", { hasText: "Second point" }).waitFor();
  await page.locator(".canvas-card.is-image img").first().waitFor();
  assert.deepEqual(errors, []);
  console.log("Canvas phase 3: resizing images and videos, size menu, side panel, tree layout, drag from panel, outline, Open canvas and reopen passed");
} finally {
  await browser.close();
}
