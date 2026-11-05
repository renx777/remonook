import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/sync-crdt.mjs';
import { sharedSnapshotProblem } from '../src/sync-validate.mjs';
import { empty } from './.build/data.mjs';
import { bullet } from '../src/domain.mjs';

test('the server check passes a valid workspace and names the step that rejects a bad one', () => {
  const ok = empty();
  ok.tables.bullets = [bullet('a', { text: 'Note' })];
  const y = seed(ok, []);
  assert.equal(sharedSnapshotProblem(y), '');
  y.destroy();
  const bad = empty();
  bad.tables.bullets = [bullet('a', { text: 'Note' })];
  bad.web.dashboard = { version: 'nonsense' };
  const z = seed(bad, []);
  assert.match(sharedSnapshotProblem(z), /^Dashboard: /);
  z.destroy();
});
