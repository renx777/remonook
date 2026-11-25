// View outlines acceptance: an empty view outline can add, a bullet carried out of a view by editing
// stays put until editing ends and then says where it moved (with Show), and zooming inside a view's
// outline has working breadcrumbs. VIEW_URL defaults to the local web app.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ["--no-sandbox"],
});
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const rows = async () => (await page.locator(".outline-row").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  const nav = (name) => page.getByRole("button", { name: new RegExp("^" + name) }).first().click();
  await page.goto(process.env.VIEW_URL || "http://127.0.0.1:5197");
  await page.getByText("Try as a guest", { exact: true }).click();
  // 1. Empty Study outline offers Add; the new flashcard opens for typing and stays.
  await nav("Study Desk");
  await page.locator(".outline-view-toggle").click();
  await page.getByRole("button", { name: "Add a flashcard" }).click();
  await page.keyboard.type("What is FSRS?");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  assert.deepEqual(await rows(), ["What is FSRS?"]);
  // 2. Notes: turning a bullet into a flashcard moves it; the notice follows it.
  await nav("Notes");
  await page.getByText("Ideas", { exact: true }).click();
  await page.waitForTimeout(250);
  await page.keyboard.press("End");
  await page.waitForTimeout(100);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("Capital of Italy");
  await page.keyboard.type(" /question");
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  assert.ok((await rows()).includes("Capital of Italy"), "stays in Notes while being edited");
  await page.keyboard.press("Escape");
  await page.locator(".toast-moved", { hasText: "moved to Study Desk" }).waitFor();
  assert.ok(!(await rows()).includes("Capital of Italy"), "leaves Notes once editing ends");
  await page.locator(".toast-moved").getByRole("button", { name: "Show" }).click();
  await page.locator(".outline-view-toggle[aria-pressed=true]").waitFor();
  assert.ok((await rows()).includes("Capital of Italy"), "Show opens it in the Study Desk outline");
  // 3. Mindmap outline: outdenting out of the mindmap keeps the bullet in view while editing.
  await nav("Notes");
  await page.getByText("Ideas", { exact: true }).click();
  await page.waitForTimeout(250);
  await page.keyboard.press("End");
  await page.waitForTimeout(100);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  // Build the branch first, then make it a mindmap (a bullet that turns into a mindmap leaves
  // Notes, so Tab can no longer nest under it there).
  await page.keyboard.type("Trip plan");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Flights");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.getByText("Trip plan", { exact: true }).click();
  await page.waitForTimeout(250);
  await page.keyboard.press("End");
  await page.keyboard.type(" /mindmap");
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await nav("Mindmaps");
  await page.locator(".outline-view-toggle").click();
  await page.waitForTimeout(300);
  assert.deepEqual(await rows(), ["Trip plan", "Flights"]);
  await page.getByText("Flights", { exact: true }).click();
  await page.waitForTimeout(250);
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Tab");
  await page.waitForTimeout(300);
  assert.ok((await rows()).includes("Flights"), "still visible while editing after leaving the mindmap");
  await page.keyboard.type(" booked");
  await page.keyboard.press("Escape");
  await page.locator(".toast-moved", { hasText: "moved to Notes" }).waitFor();
  assert.deepEqual(await rows(), ["Trip plan"]);
  await page.getByRole("button", { name: /^Undo/ }).first().click();
  await page.waitForTimeout(400);
  // 4. Zoom inside the mindmap outline: breadcrumbs show the path and lead back.
  await page.locator(".outline-row", { hasText: "Trip plan" }).first().locator("[aria-label^='Zoom']").first().click();
  await page.waitForTimeout(300);
  const crumbs = (await page.locator(".breadcrumbs").innerText()).replace(/\s+/g, " ");
  assert.match(crumbs, /Mindmaps outline.*Trip plan/, "breadcrumbs show the view and the path");
  await page.locator(".breadcrumbs").getByRole("button", { name: /Mindmaps outline/ }).click();
  await page.waitForTimeout(300);
  assert.ok((await rows()).includes("Trip plan"), "the view link returns to the outline's top");
  assert.deepEqual(errors, []);
  console.log("View outlines: empty add, moved notice and Show, editing keeps a bullet in place, breadcrumbs passed");
} finally {
  await browser.close();
}
