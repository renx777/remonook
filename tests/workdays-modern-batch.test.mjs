import test from 'node:test';
import assert from 'node:assert/strict';
import { Y, sharedState, openShared, vector, delta, unpack } from '../src/sync-crdt.mjs';
import { workdaysLegacyIntent } from '../cloud/workdays-upgrade.mjs';

const VERSION = JSON.stringify(['web', 'workdays', 'version']);
const LEFTOVER = JSON.stringify(['web', 'workdays', 'entries', '2026-11-03', 'actual', 'status']);
const MODERN = JSON.stringify(['web', 'workdays', 'entries', '2026-11-04', 'actual', 'am']);
const legacyOn = (serverState, update, sender) => {
  const y = openShared(serverState);
  try { return workdaysLegacyIntent(y, unpack(update), sender && unpack(sender)); } finally { y.destroy(); }
};

test('old Workdays fields removed by the upgrade do not make every later batch look legacy', () => {
  // The server copy: a v1 field that the upgrade to v2 already removed.
  const server = new Y.Doc();
  server.getMap('fields').set(LEFTOVER, 'WFH');
  server.getMap('fields').set(VERSION, 2);
  server.getMap('fields').delete(LEFTOVER);
  const serverState = sharedState(server);
  server.destroy();
  // A current device records a modern Workdays edit. Its update still carries the
  // document's whole delete set, including that old removal.
  const device = openShared(serverState), before = vector(device);
  device.getMap('fields').set(MODERN, { mode: 'WFO', updatedAt: 1 });
  const update = delta(device, before), seen = vector(device);
  device.destroy();
  assert.equal(legacyOn(serverState, update, seen), null, 'the sender had seen v2');
  // An app from before the switch carries the same old removal but has not seen v2.
  const empty = new Y.Doc(), unseen = vector(empty);
  empty.destroy();
  assert.ok(legacyOn(serverState, update, unseen), 'a pre-v2 sender still goes through the upgrade');
});

test('a batch that newly removes a v1 Workdays field is still recognised as legacy', () => {
  const server = new Y.Doc();
  server.getMap('fields').set(LEFTOVER, 'WFH');
  server.getMap('fields').set(VERSION, 2);
  const serverState = sharedState(server);
  server.destroy();
  const device = openShared(serverState), before = vector(device);
  device.getMap('fields').delete(LEFTOVER);
  const update = delta(device, before), seen = vector(device);
  device.destroy();
  assert.ok(legacyOn(serverState, update, seen), 'a new removal of a v1 field still goes through the upgrade');
});

test('a v2-only account with no v1 history never requests legacy conversion',()=>{
 const server=new Y.Doc();server.getMap('fields').set(VERSION,2);const state=sharedState(server);server.destroy();
 const device=openShared(state),before=vector(device);device.getMap('fields').set(MODERN,{mode:'WFH',updatedAt:9});
 assert.equal(legacyOn(state,delta(device,before),vector(device)),null);device.destroy();
});

test('a long-offline sender without the v2 switch retains a Clear intent even after unrelated history grows',()=>{
 const server=new Y.Doc();server.getMap('fields').set(LEFTOVER,'WFO');const old=sharedState(server);
 const device=openShared(old),before=vector(device);device.getMap('fields').delete(LEFTOVER);const update=delta(device,before),sender=vector(device);device.destroy();
 server.getMap('fields').set(VERSION,2);server.getMap('fields').delete(LEFTOVER);
 for(let i=0;i<200;i++)server.getMap('fields').set(JSON.stringify(['web','unrelated']),i);
 const intent=legacyOn(sharedState(server),update,sender);assert.ok(intent.records.has(JSON.stringify(['2026-11-03','actual'])));server.destroy();
});
