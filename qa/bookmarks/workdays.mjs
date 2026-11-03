import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "@playwright/test"
);
const browser = await chromium.launch({
  executablePath: process.env.REMONOOK_CHROMIUM || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1400, height: 1000 },
      hasTouch: mobile,
      isMobile: mobile,
      colorScheme: mobile ? "dark" : "light",
      serviceWorkers: "block",
    });
    await context.route("http://127.0.0.1:4194/sync/**", (route) =>
      route.abort(),
    );
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.log("Browser error", e.message);
    });
    page.setDefaultTimeout(30000);
    await page.goto("http://127.0.0.1:4193/#app");
    await page
      .getByRole("button", { name: "Commands & notes", exact: true })
      .waitFor();
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox").fill("Open calendar");
    await page.keyboard.press("Enter");
    const stored = () =>
      page.evaluate(async () => {
        const db = await new Promise((resolve) => {
          const q = indexedDB.open("remo-web");
          q.onsuccess = () => resolve(q.result);
        });
        const doc = await new Promise((resolve) => {
          const q = db.transaction("meta").objectStore("meta").get("workspace");
          q.onsuccess = () => resolve(q.result);
        });
        const records = await new Promise((resolve) => {
          const q = db.transaction("records").objectStore("records").getAll();
          q.onsuccess = () => resolve(q.result);
        });
        doc.tables = {
          bullets: records
            .filter((r) => r.table === "bullets")
            .map((r) => r.value),
        };
        db.close();
        return doc;
      });
    await page.getByRole("button", { name: "Manage daily trackers" }).click();
    await page.getByRole("switch", { name: "Enable Workdays tracker" }).check();
    await page
      .getByRole("button", { name: "Close daily tracker settings" })
      .click();
    await page.getByRole("button", { name: "Work from home" }).click();
    await page.getByRole("button", { name: "Take leave" }).click();
    const leave = page.getByRole("dialog", { name: "Take leave", exact: true });
    await leave.getByRole("radio", { name: "Morning", exact: true }).check();
    await leave.getByLabel("Work the other half").selectOption("WFO");
    await leave.getByRole("button", { name: "Save leave" }).click();
    await page.screenshot({
      path: "/tmp/workdays-daily-" + (mobile ? "mobile" : "desktop") + ".png",
    });
    await page.waitForTimeout(350);
    const first = await stored(),
      actualDate = Object.keys(first.web.workdays.entries)[0];
    assert.equal(first.web.workdays.entries[actualDate].actual.pm.mode, "WFO");
    assert.equal(first.tables.bullets.filter((n) => n.journalDate).length, 0);
    await page.getByRole("button", { name: "Workdays", exact: true }).click();
    const workspace = page.getByRole("dialog", {
      name: "Workdays",
      exact: true,
    });
    await workspace.waitFor();
    await workspace.getByRole("button", { name: "Leave", exact: true }).click();
    await workspace
      .getByPlaceholder("e.g. Medical leave")
      .fill("Medical leave");
    await workspace
      .getByRole("button", { name: "Add leave type", exact: true })
      .click();
    const row = workspace
      .locator(".wd2-leave-row")
      .filter({
        has: page.getByRole("heading", { name: "Medical leave", exact: true }),
      });
    await row.getByRole("button", { name: "Manage", exact: true }).click();
    await row.getByLabel("Yearly allowance").fill("12");
    await row.getByLabel("Carry-over / adjustment").fill("1.5");
    await row.getByRole("button", { name: "Save leave allowance" }).click();
    await page.waitForTimeout(300);
    let doc = await stored();
    const medical = Object.values(doc.web.workdays.leaveTypes).find(
      (t) => t.name === "Medical leave",
    );
    assert.ok(
      Object.values(doc.web.workdays.leaveYears).some(
        (y) => y.quotas[medical.id] === 24 && y.adjustments[medical.id] === 3,
      ),
    );
    await workspace
      .getByRole("button", { name: "Workday settings", exact: true })
      .click();
    const settings = page.getByRole("dialog", {
      name: "Workday settings",
      exact: true,
    });
    await settings.getByLabel("Amount", { exact: true }).fill("20");
    await settings.getByLabel("Measure").selectOption("days");
    await settings.getByLabel("Every").selectOption("quarter");
    await settings
      .getByLabel("Period starting", { exact: true })
      .fill("2027-01-01");
    await settings
      .getByRole("button", { name: "Add target", exact: true })
      .click();
    await settings.getByRole("button", { name: "Done", exact: true }).click();
    await workspace.getByRole("button", { name: "Plan", exact: true }).click();
    await workspace.getByLabel("Workdays date").fill("2027-01-04");
    for (const date of ["2027-01-04", "2027-01-05"])
      await workspace
        .locator(".wd2-month button")
        .filter({ hasText: new RegExp("^" + Number(date.slice(8)) + "$") })
        .first()
        .click();
    await workspace
      .locator(".wd2-bulk")
      .getByRole("button", { name: "Home", exact: true })
      .click();
    await workspace
      .getByRole("button", { name: "Deselect", exact: true })
      .click();
    await workspace
      .getByRole("button", { name: "Weekly routine", exact: true })
      .click();
    const routine = page.getByRole("dialog", {
      name: "Weekly routine",
      exact: true,
    });
    await routine.getByLabel("From", { exact: true }).fill("2027-01-04");
    await routine.getByLabel("Through", { exact: true }).fill("2027-01-15");
    await routine.getByRole("button", { name: "Preview routine" }).click();
    await routine.getByRole("button", { name: "Apply plans" }).click();
    await page.waitForTimeout(350);
    doc = await stored();
    assert.equal(doc.web.workdays.entries["2027-01-04"].plan.am.mode, "WFH");
    assert.equal(doc.web.workdays.entries["2027-01-06"].plan.am.mode, "WFO");
    console.log("Routine and leave passed");
    await workspace
      .getByRole("button", { name: "Import holidays", exact: true })
      .click();
    let importer = page.getByRole("dialog", {
      name: "Import holidays",
      exact: true,
    });
    await importer
      .getByLabel("Company holiday list")
      .setInputFiles({
        name: "company.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          'Date,Holiday\n2027-01-01,"New Year, office holiday"\n2027-01-04,Company holiday',
        ),
      });
    await importer.getByRole("button", { name: "Review holidays" }).click();
    await importer
      .getByRole("button", { name: "Import 2 holidays", exact: true })
      .click();
    await page.waitForTimeout(350);
    doc = await stored();
    assert.equal(
      doc.web.workdays.holidays["2027-01-01"],
      "New Year, office holiday",
    );
    assert.equal(doc.web.workdays.entries["2027-01-04"].plan.am.mode, "WFH");
    if (!mobile) {
      for (const scan of [false, true]) {
        await workspace
          .getByRole("button", { name: "Import holidays", exact: true })
          .click();
        importer = page.getByRole("dialog", {
          name: "Import holidays",
          exact: true,
        });
        await importer
          .getByLabel("Company holiday list")
          .setInputFiles(
            scan
              ? "/tmp/workdays-holidays-scan.pdf"
              : "/tmp/workdays-holidays-text.pdf",
          );
        if (scan)
          await importer
            .getByRole("checkbox", {
              name: "Use text recognition for scanned pages",
            })
            .check();
        await importer.getByRole("button", { name: "Review holidays" }).click();
        try {
          await importer
            .getByRole("button", { name: /Import [3-9] holidays/ })
            .waitFor({ timeout: 45000 });
        } catch (e) {
          console.log("PDF preview debug", await importer.innerText());
          await page.screenshot({ path: "/tmp/workdays-pdf-debug.png" });
          throw e;
        }
        const dates = await importer
          .locator("input[type=date]")
          .evaluateAll((els) => els.map((el) => el.value));
        assert.ok(
          dates.includes("2027-12-25"),
          scan ? "scanned holiday extracted" : "text holiday extracted",
        );
        await importer
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        console.log(
          scan
            ? "Scanned PDF with real on-device OCR passed"
            : "Text PDF extraction passed",
        );
      }
    }
    await workspace
      .getByRole("button", { name: "Overview", exact: true })
      .click();
    await workspace.getByLabel("Statistics period").selectOption("quarter");
    await workspace.locator(".recharts-surface").waitFor();
    await page.screenshot({
      path:
        "/tmp/workdays-overview-" + (mobile ? "mobile" : "desktop") + ".png",
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    if (mobile) {
      await page.setViewportSize({ width: 320, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "Workdays fits a 320px screen",
      );
      await page.screenshot({ path: "/tmp/workdays-overview-320.png" });
    }
    await workspace
      .getByRole("button", { name: "Close Workdays", exact: true })
      .click();
    await page.reload();
    await page
      .getByRole("button", { name: "Commands & notes", exact: true })
      .waitFor();
    doc = await stored();
    assert.equal(doc.web.workdays.entries["2027-01-04"].plan.am.mode, "WFH");
    assert.equal(doc.tables.bullets.filter((n) => n.journalDate).length, 0);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      mobile ? "Mobile" : "Desktop",
      "Workdays half days, quotas, targets, routine, holiday import, chart and durable reload passed",
    );
  }
} finally {
  await browser.close();
}
