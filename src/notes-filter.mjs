import { index, indexedRows } from "./domain.mjs";

/** Stable leading tabs, followed by the kinds present in this outline. */
export const NOTE_FILTERS = [
  ["all", "All", ""],
  ["notes", "Notes", ""],
  ["calendar", "Calendar", "📅"],
  ["flashcards", "Flashcards", "🃏"],
  ["mcqs", "MCQs", "✅"],
  ["mindmaps", "Mindmaps", "🧠"],
  ["bookmarks", "Bookmarks", "🔖"],
  ["docs", "Docs", "📚"],
];
const priority={calendar:0,flashcards:1,mcqs:1,mindmaps:2,bookmarks:3,docs:4};

/** One index per document, shared by counts, panes and the Notes exclusions. */
export function noteCatalog(doc, idx = index(doc.tables.bullets)) {
  const web=doc.web||{},mcqs=web.mcqs||{},decks=new Set((doc.tables.decks||[]).map(d=>d.rootId)),
    bookmarks=new Set(Object.values(web.bookmarkNoteRoots||{})),books=new Set(Object.values(web.readingNoteRoots||{}));
  const matches={
    calendar:n=>!!n.journalDate||/^(?:cal-root|cal-year-\d{4}|cal-month-\d{4}-\d{2})$/.test(n.id)||(!n.parentId&&/^(?:🗓️?|📆|📅)?\s*Calendar$/i.test(n.text.trim())),
    flashcards:n=>!mcqs[n.id]&&(decks.has(n.id)||n.kind==='QUESTION'),
    mcqs:n=>!!mcqs[n.id],mindmaps:n=>!!n.mindmap,bookmarks:n=>bookmarks.has(n.id),docs:n=>books.has(n.id),
  };
  const rank=new Map(),excluded=new Set(),stack=(idx.children.get(null)||[]).map(n=>({n,inherited:false})),walk=[];
  while(stack.length){
    const {n,inherited}=stack.pop();
    const own=Object.keys(matches).filter(kind=>matches[kind](n));
    const special=inherited||own.length>0;
    if(special)excluded.add(n.id);
    rank.set(n.id,own.length?Math.min(...own.map(kind=>priority[kind])):5);walk.push(n);
    for(const child of idx.children.get(n.id)||[])stack.push({n:child,inherited:special});
  }
  // A mixed page stays intact in All and joins its earliest special-content group.
  for(let i=walk.length-1;i>=0;i--){const n=walk[i];if(n.parentId)rank.set(n.parentId,Math.min(rank.get(n.parentId)??5,rank.get(n.id)??5));}
  /** @param {string} kind @param {string|null} [scope] */
  const roots=(kind,scope=null)=>{
    if(kind==='all')return (idx.children.get(scope)||[]).map(n=>n.id).sort((a,b)=>(rank.get(a)??5)-(rank.get(b)??5));
    const match=kind==='notes'?n=>!excluded.has(n.id):matches[kind];
    if(!match)return null;
    const out=[],todo=(idx.children.get(scope)||[]).slice().reverse();
    while(todo.length){const n=todo.pop();if(kind==='notes'&&excluded.has(n.id))continue;if(match(n)){out.push(n.id);continue;}const kids=idx.children.get(n.id)||[];for(let i=kids.length-1;i>=0;i--)todo.push(kids[i]);}
    return out;
  };
  const counts=scope=>Object.fromEntries(NOTE_FILTERS.filter(([kind])=>kind!=='all').map(([kind])=>[kind,roots(kind,scope).length]));
  return {roots,counts,excluded,idx};
}

/** Whole outermost matching branches in outline order; null retains the legacy All API. */
export function filterRoots(doc,kind,scope=null,idx){return kind==='all'?null:noteCatalog(doc,idx).roots(kind,scope);}
export function filterCounts(doc,scope=null){return noteCatalog(doc).counts(scope);}
export function orderedNoteRoots(doc,scope=null){return noteCatalog(doc).roots('all',scope);}

/** Rows for the given root bullets, each followed by its visible subtree. */
export function rootRows(idx, rootIds, expand = false) {
  const out = [];
  for (const id of rootIds) {
    const node = idx.byId.get(id);
    if (!node) continue;
    out.push({ bullet: node, depth: 0 });
    if (expand || !node.collapsed)
      for (const row of indexedRows(idx, id, expand)) out.push({ ...row, depth: row.depth + 1 });
  }
  return out;
}
