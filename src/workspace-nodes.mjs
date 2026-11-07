import {syncMirrors} from './relations.mjs';
import {validate,refreshCards,uuid} from './domain.mjs';

/** Replaces a workspace's bullets: mirrors, note times, validation, media, decks and derived cards. */
export function withNodes(doc, nodes) {
  nodes = syncMirrors(doc.tables.bullets, nodes);
  const oldNodes=new Map(doc.tables.bullets.map(n=>[n.id,n]));
  const noteTimes={...doc.web.noteTimes},now=Date.now();
  for(const n of nodes){const before=oldNodes.get(n.id);if(!before||['text','formatting','parentId','position','taskState','dueDate','kind','blockStyle','codeLanguage','dividerStyle','dividerColor'].some(k=>before[k]!==n[k]))noteTimes[n.id]={...noteTimes[n.id],...(!before?{createdAt:now}:{}),updatedAt:now};}
  doc={...doc,web:{...doc.web,noteTimes}};
  const detached=nodes.filter(n=>!n.mirrorSourceId&&oldNodes.get(n.id)?.mirrorSourceId);
  const detachedMedia=detached.flatMap(n=>doc.tables.media.filter(m=>m.bulletId===oldNodes.get(n.id).mirrorSourceId).map(m=>({...m,id:uuid(),bulletId:n.id})));
  if(detachedMedia.length)doc={...doc,tables:{...doc.tables,media:[...doc.tables.media,...detachedMedia]}};

  validate(nodes);
  const ids = new Set(nodes.map((n) => n.id)),
    sourceIds = new Set([...doc.tables.bullets.map(node => node.id), ...ids]),
    sourceCards = doc.tables.cards.filter(card => sourceIds.has(card.id)),
    independentCards = doc.tables.cards.filter(card => !sourceIds.has(card.id));
  const media = doc.tables.media.filter((m) => ids.has(m.bulletId)),
    decks = doc.tables.decks.filter((d) => ids.has(d.rootId)),excluded=new Set(doc.web.studyExcludedCards||[]);
  return {
    ...doc,
    columns: { ...doc.columns,
      media: media.some(item=>item.displayWidth!==undefined) && !doc.columns.media.includes("displayWidth") ? [...doc.columns.media,"displayWidth"] : doc.columns.media,
      bullets: [...new Set([...doc.columns.bullets.filter(field=>nodes.some(n=>n.mirrorSourceId)||!['mirrorSourceId','mirrorRootId'].includes(field)), ...nodes.flatMap(node => node.mirrorSourceId ? ['mirrorSourceId','mirrorRootId'] : []), ...(nodes.some(node=>node.mindmap)?['mindmap']:[]), ...(nodes.some(node=>node.blockStyle&&node.blockStyle!=='paragraph')?['blockStyle']:[]), ...(nodes.some(node=>node.dividerStyle)?['dividerStyle']:[]), ...(nodes.some(node=>node.dividerColor)?['dividerColor']:[])])],
      decks: doc.tables.decks.some(deck => deck.layout) && !doc.columns.decks.includes('layout') ? [...doc.columns.decks, 'layout'] : doc.columns.decks,
    },
    tables: {
      ...doc.tables,
      bullets: nodes,
      media,
      decks,
      cards: [...independentCards, ...refreshCards(nodes, decks.filter(deck => doc.web.deckTypes?.[deck.rootId] !== "MCQ"), media, sourceCards, Date.now())].map(card=>excluded.has(card.id)?{...card,state:'INACTIVE'}:card),
    },
  };
}
