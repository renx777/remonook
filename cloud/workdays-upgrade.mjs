import { Y } from "../src/sync-crdt.mjs";
import { validateWorkdaysV2, leaveId } from "../src/workdays-v2.mjs";
import {repairWorkdays} from '../src/workdays-repair.mjs';
import {recoveryNotes} from '../src/sync-recovery-notes.mjs';
// An older tab can retain an immutable, unacknowledged v1 batch through an app
// update. Recover only its explicit metadata intent, never replace a workspace
// or copy unrelated dates from the client's compatibility context.
const VERSION = JSON.stringify(["web", "workdays", "version"]);
/** @param {any} y @param {Uint8Array} update @param {Uint8Array} [senderVector] what the sender had seen */
export function workdaysLegacyIntent(y, update, senderVector) {
  if (y.getMap("fields").get(VERSION) !== 2) return null;
  // A sender that had already seen the switch to v2 cannot be replaying a v1
  // edit through a deletion the upgrade itself made.
  let sawV2 = false;
  const marker = y.getMap("fields")._map.get(VERSION);
  if (senderVector && marker)
    sawV2 = (Y.decodeStateVector(senderVector).get(marker.id.client) || 0) > marker.id.clock;
  const decoded = Y.decodeUpdate(update),
    paths = [];
  let modern = false;
  const read = (item) => {
    if (typeof item.parentSub !== "string") return;
    try {
      const p = JSON.parse(item.parentSub);
      if (p[0] !== "web" || p[1] !== "workdays") return;
      if (p[2] === "version" && item.content?.arr?.[0] === 2) modern = true;
      paths.push(p);
    } catch {}
  };
  decoded.structs.forEach(read);
  if (modern) return null;
  // Yjs retains the field identity of deleted map items. Include removals, not
  // just inserted values, so an offline Clear action can recover after update.
  // Every update carries the document's whole delete set. For a sender that had
  // seen v2, removals this server already holds are history, not its intent.
  for (const [client, ranges] of decoded.ds.clients)
    for (const item of y.store.clients.get(client) || [])
      if (
        !(sawV2 && item.deleted) &&
        ranges.some(
          (r) =>
            item.id.clock < r.clock + r.len &&
            item.id.clock + item.length > r.clock,
        )
      )
        read(item);
  const records = new Set(),
    policies = new Set(),
    quotas = new Set();
  for (const p of paths) {
    if (
      p[2] === "entries" &&
      p.length === 6 &&
      ["status", "detail", "updatedAt"].includes(p[5])
    )
      records.add(JSON.stringify([p[3], p[4]]));
    if (p[2] === "policies" && p.length >= 4) policies.add(p[3]);
    if (p[2] === "allowances" && p.length === 5)
      quotas.add(JSON.stringify([p[3], p[4]]));
  }
  return records.size || policies.size || quotas.size
    ? { records, policies, quotas }
    : null;
}
export function upgradeWorkdaysIntent(doc, intent, context) {
  const repairedContext=repairWorkdays(context),repaired=repairWorkdays(doc.web.workdays);
  context=repairedContext.value;
  doc=recoveryNotes({...doc,web:{...doc.web,workdays:repaired.value}},[...repaired.recovered,...repairedContext.recovered]);
  validateWorkdaysV2(context);
  const w = {
    ...doc.web.workdays,
    version: 2,
    entries: { ...doc.web.workdays.entries },
    leaveTypes: { ...doc.web.workdays.leaveTypes },
    leaveYears: { ...doc.web.workdays.leaveYears },
    targets: { ...doc.web.workdays.targets },
  };
  for (const key of ["policies", "allowances", "view"]) delete w[key];
  for (const key of intent.records) {
    const [date, kind] = JSON.parse(key);
    if (!["actual", "plan"].includes(kind)) continue;
    const entry = { ...w.entries[date] },
      value = context.entries[date]?.[kind];
    if (value) {
      entry[kind] = value;
      for (const slot of Object.values(value))
        if (slot.mode === "Leave" && !w.leaveTypes[slot.leaveTypeId])
          w.leaveTypes[slot.leaveTypeId] = context.leaveTypes[slot.leaveTypeId];
    } else if (!context.holidays[date]) delete entry[kind];
    if (Object.keys(entry).length) w.entries[date] = entry;
    else delete w.entries[date];
  }
  for (const effective of intent.policies) {
    const schedule = context.schedules.find(
      (p) => p.effectiveFrom === effective,
    );
    w.schedules = w.schedules.filter((p) => p.effectiveFrom !== effective);
    if (schedule) w.schedules.push(schedule);
    const id = "legacy-" + effective;
    if (context.targets[id]) w.targets[id] = context.targets[id];
    else delete w.targets[id];
  }
  w.schedules.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  for (const key of intent.quotas) {
    const [year, name] = JSON.parse(key),
      start = year + "-01-01",
      id = leaveId(name),
      quota = context.leaveYears[start]?.quotas[id];
    if (!w.leaveTypes[id] && context.leaveTypes[id])
      w.leaveTypes[id] = context.leaveTypes[id];
    const row = w.leaveYears[start] || { start, quotas: {}, adjustments: {} };
    w.leaveYears[start] = { ...row, quotas: { ...row.quotas } };
    if (quota !== undefined) w.leaveYears[start].quotas[id] = quota;
    else delete w.leaveYears[start].quotas[id];
  }
  validateWorkdaysV2(w);
  return { ...doc, web: { ...doc.web, workdays: w } };
}
