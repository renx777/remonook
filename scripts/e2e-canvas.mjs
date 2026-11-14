// Local browser acceptance: CANVAS_URL defaults to the local web app.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
      acceptDownloads: true,
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => {
      if (
        ![
          "ResizeObserver loop completed with undelivered notifications.",
          "ResizeObserver loop limit exceeded",
        ].includes(e.message)
      )
        errors.push(e.message);
    });
    await page.goto(process.env.CANVAS_URL || "http://127.0.0.1:5197");
    await page.getByText("Try as a guest", { exact: true }).click();
    if (mobile)
      await page.getByRole("button", { name: "Library", exact: true }).click();
    await page
      .getByRole(mobile ? "menuitem" : "button", {
        name: "Canvas",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "＋ New canvas", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Canvas title" })
      .fill("Learning map");
    await page.getByRole("button", { name: "＋ Text", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Edit canvas note", exact: true })
      .fill("Supervised learning\nClassification and regression");
    await page.getByRole("button", { name: "Close inspector" }).click();
    if (!mobile) {
      const node = page.locator(".react-flow__node").first(),
        before = await node.getAttribute("style"),
        box = await node.boundingBox();
      await page.mouse.move(box.x + 40, box.y + 35);
      await page.mouse.down();
      await page.mouse.move(box.x + 100, box.y + 65, { steps: 6 });
      await page.mouse.up();
      assert.notEqual(
        await node.getAttribute("style"),
        before,
        "dragging moves the card",
      );
      await page.locator(".canvas-card").first().focus();
      await page.locator(".canvas-card").first().press("Enter");
      const handle = page
          .locator(".react-flow__resize-control.handle.bottom.right")
          .first(),
        r = await handle.boundingBox();
      assert.ok(r, "resize handle is visible");
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down();
      await page.mouse.move(r.x + r.width / 2 + 40, r.y + r.height / 2 + 30, {
        steps: 6,
      });
      await page.mouse.up();
      assert.ok(
        Number(await page.getByLabel("Width", { exact: true }).inputValue()) >
          280,
        "corner drag changes width",
      );
      await page.getByRole("button", { name: "Close inspector" }).click();
    }
    await page.getByRole("button", { name: "Group", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Group label", exact: true })
      .fill("Machine learning");
    await page
      .getByRole("textbox", { name: "Group label", exact: true })
      .blur();
    await page.getByLabel("Width", { exact: true }).fill("620");
    await page.getByLabel("Connect to", { exact: true }).selectOption({
      label: "Supervised learning\nClassification and regression",
    });
    await page.getByRole("button", { name: "Close inspector" }).click();
    await page.getByRole("button", { name: "Link note", exact: true }).click();
    await page
      .locator(".canvas-note-picker button")
      .filter({ hasText: "Supervised learning" })
      .first()
      .click();
    await page
      .getByRole("textbox", { name: "Edit canvas note", exact: true })
      .fill("Supervised learning\nTypes: classification and regression");
    await page.getByRole("button", { name: "Close inspector" }).click();
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll(".canvas-markdown")).filter((el) =>
          el.textContent.includes("Types: classification and regression"),
        ).length === 2,
    );
    assert.equal(await page.locator(".react-flow__edge").count(), 1);
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export .canvas", exact: true })
      .click();
    const download = await downloadPromise;
    const exported = JSON.parse(await readFile(await download.path(), "utf8"));
    assert.equal(exported.nodes.length, 3);
    assert.equal(exported.edges.length, 1);
    assert.ok(
      exported.nodes.some(
        (n) =>
          n.text ===
          "Supervised learning\nTypes: classification and regression",
      ),
    );
    assert.ok(
      exported.nodes.some(
        (n) =>
          n.type === "group" &&
          n.width === 620 &&
          n.label === "Machine learning",
      ),
    );
    await page.screenshot({
      path: `/tmp/canvas-${mobile ? "phone" : "desktop"}.png`,
    });
    await page.locator(".app").evaluate((el) => (el.dataset.theme = "Dark"));
    await page.screenshot({
      path: `/tmp/canvas-${mobile ? "phone" : "desktop"}-dark.png`,
    });
    await page.locator(".app").evaluate((el) => (el.dataset.theme = "Light"));
    // Placement removal and the ordinary app undo path.
    const text = page
      .locator('.canvas-card[aria-label="Edit text card"]')
      .first();
    await text.focus();
    await text.press("Enter");
    await page
      .getByRole("button", { name: "Remove card", exact: true })
      .click();
    assert.equal(await page.locator(".react-flow__node").count(), 2);
    await page
      .getByRole("button", { name: "Undo canvas change", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll(".react-flow__node").length === 3,
    );
    await page
      .getByRole("button", { name: "All canvases", exact: true })
      .click();
    await page
      .locator('input[type=file][accept=".canvas,application/json"]')
      .setInputFiles({
        name: "roundtrip.canvas",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(exported)),
      });
    await page.waitForFunction(
      () => document.querySelectorAll(".react-flow__node").length === 3,
    );
    await page.waitForTimeout(500);
    await page.reload();
    if (mobile)
      await page.getByRole("button", { name: "Library", exact: true }).click();
    await page
      .getByRole(mobile ? "menuitem" : "button", {
        name: "Canvas",
        exact: true,
      })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll(".canvas-board").length === 2,
    );
    assert.equal(await page.locator(".canvas-board").count(), 2);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      `Canvas ${mobile ? "phone" : "desktop"}: editing, connections, resize, export/import, undo and reload passed`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
