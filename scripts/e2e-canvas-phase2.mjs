// Canvas phase 2 acceptance: type on the card, colour from the floating bar, paste and drop images,
// YouTube cards that play in place, paste links/text, group rename, snap and overview map, thumbnails.
// CANVAS_URL defaults to the local web app; SHOT sets the screenshot path prefix.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const shot = process.env.SHOT || "/tmp/canvas-phase2";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ["--no-sandbox"],
});
// Fires a paste on the board with an image (drawn in the page) or text on the clipboard.
const paste = (page, what) =>
  page.evaluate(async (what) => {
    const dt = new DataTransfer();
    if (what.image) {
      const c = document.createElement("canvas");
      c.width = what.image[0];
      c.height = what.image[1];
      const g = c.getContext("2d");
      g.fillStyle = "#4a90d9";
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = "#fff";
      g.font = "48px sans-serif";
      g.fillText("Pasted", 20, 70);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      dt.items.add(new File([blob], "screenshot.png", { type: "image/png" }));
    } else dt.setData("text/plain", what.text);
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  }, what);
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext(
      mobile
        ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1440, height: 1000 } },
    );
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => { if (!/ResizeObserver/.test(e.message)) errors.push(e.message); });
    await page.goto(process.env.CANVAS_URL || "http://127.0.0.1:5197");
    await page.getByText("Try as a guest", { exact: true }).click();
    if (mobile) await page.getByRole("button", { name: "Library", exact: true }).click();
    await page.getByRole(mobile ? "menuitem" : "button", { name: "Canvas", exact: true }).click();
    await page.getByRole("button", { name: "＋ New canvas", exact: true }).click();
    // A new text card opens for typing on the card itself.
    await page.getByRole("button", { name: "Add text card" }).click();
    const editor = page.locator(".react-flow__node .canvas-card-editor [aria-label='Edit canvas note']");
    await editor.waitFor();
    await editor.pressSequentially("Typed on the card");
    await editor.press("Escape");
    await page.locator(".canvas-markdown", { hasText: "Typed on the card" }).waitFor();
    assert.equal(await page.locator(".canvas-card-editor").count(), 0, "Esc leaves typing");
    // Colour from the floating bar.
    await page.getByRole("button", { name: "Color", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Color: Green" }).click();
    assert.match(await page.locator(".canvas-card.has-color").first().getAttribute("style"), /#74ae86/);
    if (!mobile) {
      // Double-click to edit again; Enter also edits the selected card.
      await page.locator(".canvas-markdown", { hasText: "Typed on the card" }).dblclick();
      await editor.waitFor();
      await editor.press("End");
      await editor.pressSequentially(" again");
      await editor.press("Escape");
      await page.locator(".canvas-markdown", { hasText: "Typed on the card again" }).waitFor();
      // Double-click empty board: a card there, ready to type.
      const stage = await page.locator(".canvas-stage").boundingBox();
      await page.mouse.dblclick(stage.x + 120, stage.y + 120);
      await editor.waitFor();
      await editor.pressSequentially("Second idea");
      await page.keyboard.press("Escape");
      await page.locator(".canvas-markdown", { hasText: "Second idea" }).waitFor();
      await page.keyboard.press("Escape");
    }
    // Paste an image (a big screenshot is shrunk under 2 MB).
    await paste(page, { image: mobile ? [640, 360] : [1800, 1000] });
    await page.locator(".canvas-card.is-image img").first().waitFor();
    const src = await page.locator(".canvas-card.is-image img").first().getAttribute("src");
    assert.ok(src.startsWith("blob:"), "pasted image is shown from local storage");
    // Paste a YouTube link: a video card that plays on the card.
    await page.keyboard.press("Escape");
    await paste(page, { text: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    const video = page.locator(".canvas-card.is-video").first();
    await video.waitFor();
    await video.getByRole("button", { name: /Play YouTube video/ }).click();
    const frame = await video.locator("iframe").getAttribute("src");
    assert.match(frame, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*autoplay=1/);
    // Pasting plain text makes a text card.
    await page.keyboard.press("Escape");
    await paste(page, { text: "A pasted thought" });
    await page.locator(".canvas-markdown", { hasText: "A pasted thought" }).waitFor();
    // Link card via the dock form.
    await page.getByRole("button", { name: "Add web link" }).click();
    await page.getByRole("textbox", { name: /Web link/ }).fill("example.org/page");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByText("https://example.org/page").first().waitFor();
    // Group with nothing selected: an empty frame, named on the spot.
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Add group" }).click();
    const groupName = page.getByRole("textbox", { name: "Group label" });
    await groupName.fill("Ideas");
    await groupName.press("Enter");
    await page.locator(".canvas-group-label", { hasText: "Ideas" }).waitFor();
    if (!mobile) {
      // Snap and overview map toggles.
      await page.getByRole("button", { name: "Overview map" }).click();
      await page.locator(".react-flow__minimap").waitFor();
      assert.equal(await page.getByRole("button", { name: "Snap to grid" }).getAttribute("aria-pressed"), "true");
    }
    await page.locator(".react-flow__controls-fitview").click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${shot}-${mobile ? "phone" : "desktop"}.png` });
    await page.locator(".app").evaluate((el) => (el.dataset.theme = "Dark"));
    await page.locator(".canvas-markdown", { hasText: "A pasted thought" }).click();
    await page.screenshot({ path: `${shot}-${mobile ? "phone" : "desktop"}-dark.png` });
    await page.locator(".app").evaluate((el) => (el.dataset.theme = "Light"));
    await page.keyboard.press("Escape");
    // Remove the image card: its bullet and image go to Trash; Undo brings it back.
    const count = await page.locator(".react-flow__node").count();
    await page.locator(".canvas-card.is-image").first().click({ force: true });
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await page.waitForFunction((n) => document.querySelectorAll(".react-flow__node").length === n - 1, count);
    await page.getByRole("button", { name: "Undo canvas change" }).click().catch(async () => {
      await page.keyboard.press("Control+z");
    });
    await page.locator(".canvas-card.is-image img").first().waitFor();
    // Real thumbnails in the board list survive a reload.
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "All canvases" }).click();
    assert.ok((await page.locator("svg.canvas-thumbnail rect").count()) >= 5, "thumbnail draws the cards");
    await page.screenshot({ path: `${shot}-${mobile ? "phone" : "desktop"}-library.png` });
    await page.reload();
    if (mobile) await page.getByRole("button", { name: "Library", exact: true }).click();
    await page.getByRole(mobile ? "menuitem" : "button", { name: "Canvas", exact: true }).click();
    await page.locator(".canvas-board").first().click(); // the list was open when the page reloaded
    await page.locator(".canvas-card.is-image img").first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.deepEqual(errors, []);
    console.log(`Canvas phase 2 ${mobile ? "phone" : "desktop"}: in-card editing, colour, image paste, YouTube, paste text/link, group, thumbnails and reload passed`);
    await context.close();
  }
} finally {
  await browser.close();
}
