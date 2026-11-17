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
  const rank=new Map(),excluded=new Set(),stack=(idx.children.get(null)||[]).map(n=>({n,inherited:false,studyPage:false})),walk=[];
  while(stack.length){
    const {n,inherited,studyPage}=stack.pop();
    const own=Object.keys(matches).filter(kind=>matches[kind](n));
    // A deck registration adds study capabilities to an ordinary page; it does not
    // turn that page or its study children into a hidden standalone card.
    const ordinaryDeck=decks.has(n.id)&&n.kind!=='QUESTION'&&!mcqs[n.id];
    const inStudyPage=studyPage||ordinaryDeck;
    const special=inherited||own.some(kind=>!inStudyPage||!['flashcards','mcqs'].includes(kind));
    if(special)excluded.add(n.id);
    rank.set(n.id,own.length?Math.min(...own.map(kind=>priority[kind])):5);walk.push(n);
    for(const child of idx.children.get(n.id)||[])stack.push({n:child,inherited:special,studyPage:inStudyPage});
  }
  // A mixed page stays intact in All and joins its earliest special-content group.
  for(let i=walk.length-1;i>=0;i--){const n=walk[i];if(n.parentId)rank.set(n.parentId,Math.min(rank.get(n.parentId)??5,rank.get(n.id)??5));}
  /** @param {string} kind @param {string|null} [scope] */
  const roots=(kind,scope=null)=>{
    if(kind==='study'){
      const selected=new Set([...roots('flashcards',scope),...roots('mcqs',scope)]);
      return [...selected].filter(id=>{let parent=idx.byId.get(id)?.parentId;while(parent){if(selected.has(parent))return false;parent=idx.byId.get(parent)?.parentId;}return true;});
    }
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

/** The dedicated home of an existing source bullet, nearest owning branch first. */
export function outlineDestination(doc,id){
 const idx=index(doc.tables.bullets),bookmarks=new Set(Object.values(doc.web?.bookmarkNoteRoots||{})),books=new Set(Object.values(doc.web?.readingNoteRoots||{}));
 const seen=new Set();let node=idx.byId.get(id);
 while(node&&!seen.has(node.id)){
  seen.add(node.id);
  if(node.journalDate||/^(cal-root|cal-year-\d{4}|cal-month-\d{4}-\d{2})$/.test(node.id)||(!node.parentId&&/^(?:🗓️?|📆|📅)?\s*Calendar$/i.test(node.text.trim())))return 'calendar';
  if(bookmarks.has(node.id))return 'bookmarks';if(books.has(node.id))return 'bookshelf';
  if(node.mindmap)return 'mindmap';if(node.kind==='QUESTION'||doc.web?.mcqs?.[node.id])return 'study';
  node=idx.byId.get(node.parentId);
 }
 return 'notes';
}

/** Keep an active edit in place when its type changes; unrelated categories stay hidden. */
/** @param {string|null} [editing] */
export function ordinaryNoteProjection(catalog,editing=null){
 const roots=catalog.roots('notes'),excluded=catalog.excluded;
 if(!editing||!excluded.has(editing))return {roots,excluded};
 let branch=catalog.idx.byId.get(editing);if(!branch)return {roots,excluded};
 while(branch.parentId&&excluded.has(branch.parentId))branch=catalog.idx.byId.get(branch.parentId);
 const keep=new Set(),todo=[branch];while(todo.length){const n=todo.pop();if(keep.has(n.id))continue;keep.add(n.id);todo.push(...(catalog.idx.children.get(n.id)||[]));}
 const present=new Set(roots);let ancestor=branch;while(ancestor&&!present.has(ancestor.id))ancestor=catalog.idx.byId.get(ancestor.parentId);
 if(!ancestor)roots.push(branch.id);
 roots.sort((a,b)=>(catalog.idx.byId.get(a)?.position||0)-(catalog.idx.byId.get(b)?.position||0));
 return {roots,excluded:new Set([...excluded].filter(id=>!keep.has(id)))};
}

/** A view's root list, plus the edited bullet's branch if editing has carried it out of the view
 * (it stays where it is until editing ends). Roots keep outline order. */
export function keepEditedRoot(idx,roots,editing){
 if(!editing||!idx.byId.has(editing))return roots;
 const shown=new Set(roots);let at=idx.byId.get(editing);const seen=new Set();
 while(at&&!seen.has(at.id)){if(shown.has(at.id))return roots;seen.add(at.id);at=idx.byId.get(at.parentId);}
 const key=id=>{const path=[];let n=idx.byId.get(id);const guard=new Set();while(n&&!guard.has(n.id)){guard.add(n.id);path.unshift(n.position??0);n=idx.byId.get(n.parentId);}return path;};
 const cmp=(a,b)=>{const x=key(a),y=key(b);for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];return x.length-y.length;};
 return [...roots,editing].sort(cmp);
}
