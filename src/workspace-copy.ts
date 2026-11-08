// "Copy to…" between workspaces: copies a bullet and everything under it into another
// workspace's storage as new bullets at its top level. The original is left as it is (there are
// no moves between workspaces, so nothing can race an offline edit). The copy is saved through
// the target's normal save, so a synced target queues it in its outbox and uploads it the next
// time that workspace is open.
import { load, save, empty, syncMetadata, type Workspace } from './data-store';
import { withNodes } from './workspace-nodes.mjs';
import { branchCopy } from './workspace-branch.mjs';
import { authenticatedUid } from './CloudAccount';
import { activeLocalWorkspace, localWorkspaces, workspaceStorageName } from './workspaces';

export type CopyTarget = { key: string; name: string; storage: string; synced: boolean };

/** Workspaces a bullet can be copied to from the one that is open. */
export function copyTargets(): CopyTarget[] {
  const active = activeLocalWorkspace(), uid = authenticatedUid(), out: CopyTarget[] = [];
  if (active) out.push({ key: 'main', name: 'My notes', storage: uid ? 'remo-web-user-' + uid : 'remo-web', synced: !!uid });
  for (const w of localWorkspaces()) if (w.id !== active?.id) out.push({ key: w.id, name: w.name, storage: workspaceStorageName(w), synced: false });
  return out;
}

export async function copyBranch(doc: Workspace, rootId: string, target: CopyTarget): Promise<number> {
  // A synced account must have synced on this device before; otherwise its first sync would
  // adopt the account's notes and the copy could be replaced.
  if (target.synced && !(await syncMetadata(undefined, undefined, target.storage))) throw Error(`Open “${target.name}” once on this device first, then copy again.`);
  let before = await load(target.storage);
  if (!before) before = await save(null, empty(), 'initialize', undefined, false, [], undefined, target.storage);
  const top = before.tables.bullets.filter(n => !n.parentId).reduce((m, n) => Math.max(m, n.position + 1), 0);
  const copies = branchCopy(doc, rootId, top);
  await save(before, withNodes(before, [...before.tables.bullets, ...copies]), 'copy from another workspace', undefined, false, [], undefined, target.storage);
  return copies.length;
}
