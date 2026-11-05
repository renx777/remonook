// The server's acceptance check for a merged shared document (cloud/sync-v2.mjs).
// It lives here so the app can run exactly the same check on its own sync copy and
// name the failing step when the server rejects a batch without saying why.
import { rowKey, project, normalizeTree, applyIntent } from "./sync-crdt.mjs";
import { validateMirrors } from "./relations.mjs";
import { validateBookmarks } from "./bookmarks.mjs";
import { validateDashboard } from "./dashboard.mjs";
import { validateReading } from "./reading.mjs";
import { validateReadingBooks } from "./book-storage.mjs";
import { validateWorkdays } from "./workdays.mjs";
import { validateCalendarEvents } from "./calendar-events.mjs";
import { validateStudyLibrary } from "./study-library.mjs";
import { validateOcclusions } from "./occlusion.mjs";
import {repairWorkdays} from './workdays-repair.mjs';
import {recoveryNotes} from './sync-recovery-notes.mjs';

const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};

/**
 * Projects, repairs and validates `y` in place, then returns the projection.
 * `step` is told which part runs next so a failure can be named.
 * @param {any} y @param {(name: string) => void} [step]
 */
export function sharedSnapshot(y, step = () => {}) {
  step("project");
  let value = project(y);
  for (const [table, rows] of Object.entries(value.doc.tables))
    rows.forEach((row, i) => {
      const key = rowKey(table, row, i);
      if (y.getMap("rows").get(key) === false) y.getMap("rows").set(key, true);
    });
  // Retain source notes when a concurrent attachment/deck references a node
  // deleted elsewhere. A nonexistent source is invalid input, not recoverable.
  step("attachment and deck sources");
  const ids = new Set(value.doc.tables.bullets.map((n) => n.id));
  for (const id of [...(value.doc.tables.media || []).map((x) => x.bulletId), ...(value.doc.tables.decks || []).map((x) => x.rootId)])
    if (!ids.has(id)) {
      const key = JSON.stringify(["bullets", id]);
      if (!y.getMap("rows").has(key)) fail("Invalid attachment or deck source");
      y.getMap("rows").set(key, true);
      ids.add(id);
    }
  step("project");
  value = project(y);
  step('Attachments');
  const paths=new Set();let bytes=0;
  if(value.assets.length>2000)fail('Too many attachments.',413);
  for(const a of value.assets){
    if(typeof a.path!=='string'||!a.path||a.path.length>500||paths.has(a.path)||!/^[a-f0-9]{64}$/.test(a.hash)||!Number.isSafeInteger(a.size)||a.size<0||a.size>2*1024*1024||typeof a.type!=='string'||a.type.length>150)fail('Invalid attachment.');
    paths.add(a.path);bytes+=a.size;
  }
  if(bytes>20*1024*1024)fail('Attachments exceed 20 MiB.',413);
  const before = structuredClone(value.doc);
  step("outline tree");
  normalizeTree(value.doc);
  // Invalid mirror references can arise when a source is deleted concurrently.
  // Detaching keeps the note text; the journal retains the original link.
  try {
    validateMirrors(value.doc.tables.bullets);
  } catch {
    for (const n of value.doc.tables.bullets) {
      delete n.mirrorSourceId;
      delete n.mirrorRootId;
    }
  }
  const web = value.doc.web;
  const workdays=repairWorkdays(web.workdays);
  if(workdays.recovered.length){web.workdays=workdays.value;value.doc=recoveryNotes(value.doc,workdays.recovered);}
  step("Books");
  validateReadingBooks(web.readingBooks);
  step("Reading");
  validateReading(web);
  step("Bookmarks");
  validateBookmarks(web);
  step("Dashboard");
  validateDashboard(web.dashboard);
  step("Workdays");
  validateWorkdays(web.workdays);
  step("Calendar reminders");
  validateCalendarEvents(web.calendarEvents);
  step("Study library");
  validateStudyLibrary(web);
  step("Image occlusion");
  validateOcclusions(web.occlusions);
  step("repair");
  applyIntent(y, before, value.doc, value.assets, value.assets);
  return value;
}

/** Runs the server check on a copy and returns "<step>: <message>", or "" when it passes. */
export function sharedSnapshotProblem(y) {
  let current = "start";
  try {
    sharedSnapshot(y, (name) => (current = name));
    return "";
  } catch (e) {
    return `${current}: ${String(e?.message || e?.name || "no message").replace(/\s+/g, " ").slice(0, 160)}`;
  }
}
