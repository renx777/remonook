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
    await page.getByRole("button", { name: "Add text card" }).click();
    await page
      .getByRole("textbox", { name: "Edit canvas note", exact: true })
      .fill("Supervised learning\nClassification and regression");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
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
      await page.locator(".react-flow__node").first().click({ position: { x: 30, y: 30 } });
      const widthBefore = (await page.locator(".react-flow__node").first().boundingBox()).width;
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
      await page.waitForTimeout(200);
      assert.ok(
        (await page.locator(".react-flow__node").first().boundingBox()).width >
          widthBefore + 20,
        "corner drag changes width",
      );
      await page.keyboard.press("Escape");
    }
    await page.getByRole("button", { name: "Add group" }).click();
    await page
      .getByRole("textbox", { name: "Group label", exact: true })
      .fill("Machine learning");
    await page
      .getByRole("textbox", { name: "Group label", exact: true })
      .press("Enter");
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByLabel("Connect to", { exact: true }).selectOption({
      label: "Supervised learning\nClassification and regression",
    });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Add note from Notes" }).click();
    await page
      .locator(".canvas-note-picker button")
      .filter({ hasText: "Supervised learning" })
      .first()
      .click();
    await page.keyboard.press("Enter");
    await page
      .getByRole("textbox", { name: "Edit canvas note", exact: true })
      .fill("Supervised learning\nTypes: classification and regression");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll(".canvas-markdown")).filter((el) =>
          el.textContent.includes("Types: classification and regression"),
        ).length === 2,
    );
    assert.equal(await page.locator(".react-flow__edge").count(), 1);
    const downloadPromise = page.waitForEvent("download");
    if (mobile) {
      await page.getByLabel("Canvas options").click();
      await page.getByRole("button", { name: "Export as .canvas file" }).click();
    } else
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
          n.type === "group" && n.label === "Machine learning",
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
    await page.locator(".canvas-markdown").first().click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
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
