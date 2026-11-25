import {snapshotIndex} from './outline-snapshot.mjs';
// Board and calendar layouts are held back from this release; a saved 'board'/'calendar' view shows the outline.
export const BULLET_VIEWS=['outline','grid','list','table'];
export function bulletView(doc,id){if(!doc.web.bulletViews)return 'outline';const node=snapshotIndex(doc.tables.bullets).byId.get(id),value=doc.web.bulletViews[node?.mirrorSourceId||id];return BULLET_VIEWS.includes(value)?value:'outline';}
export function setBulletView(doc,id,view){if(!BULLET_VIEWS.includes(view))throw Error('Choose a supported view.');const node=doc.tables.bullets.find(n=>n.id===id);if(!node)return doc;return {...doc,web:{...doc.web,bulletViews:{...doc.web.bulletViews,[node.mirrorSourceId||id]:view}}};}
