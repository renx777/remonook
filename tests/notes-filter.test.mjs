import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRoots, filterCounts, rootRows, noteCatalog, orderedNoteRoots } from '../src/notes-filter.mjs';
import { bullet, index } from '../src/domain.mjs';

const B = (id, parentId, position, extra = {}) => bullet(id, { parentId, position, text: id, ...extra });
const doc = {
  tables: {
    bullets: [
      B('ml', null, 0),
      B('q1', 'ml', 0, { kind: 'QUESTION' }), B('a1', 'q1', 0),
      B('mcq', 'ml', 1, { kind: 'QUESTION' }), B('o1', 'mcq', 0),
      B('deck', null, 1), B('q2', 'deck', 0, { kind: 'QUESTION' }),
      B('map', null, 2, { mindmap: true }), B('mapq', 'map', 0, { kind: 'QUESTION' }),
      B('web-1', null, 3), B('hl', 'web-1', 0),
      B('book-1', null, 4),
      B('plain', null, 5),
    ],
    decks: [{ rootId: 'deck' }],
  },
  web: { mcqs: { mcq: {} }, bookmarkNoteRoots: { b1: 'web-1' }, readingNoteRoots: { h1: 'book-1' } },
};

test('filters return whole outermost bullets in outline order', () => {
  assert.deepEqual(filterRoots(doc, 'flashcards'), ['q1', 'deck', 'mapq'], 'a question inside a deck shows with its deck');
  assert.deepEqual(filterRoots(doc, 'mcqs'), ['mcq']);
  assert.deepEqual(filterRoots(doc, 'mindmaps'), ['map']);
  assert.deepEqual(filterRoots(doc, 'bookmarks'), ['web-1']);
  assert.deepEqual(filterRoots(doc, 'docs'), ['book-1']);
  assert.equal(filterRoots(doc, 'all'), null);
  assert.deepEqual(filterRoots(doc, 'flashcards', 'ml'), ['q1'], 'a zoomed page only shows its own bullets');
  assert.deepEqual(filterCounts(doc), { notes: 2, calendar: 0, flashcards: 3, mcqs: 1, mindmaps: 1, bookmarks: 1, docs: 1 });
});

test('rows show each matched bullet with its children', () => {
  const rows = rootRows(index(doc.tables.bullets), ['q1', 'web-1']);
  assert.deepEqual(rows.map(r => [r.bullet.id, r.depth]), [['q1', 0], ['a1', 1], ['web-1', 0], ['hl', 1]]);
});


test('Notes excludes typed subtrees while retaining ordinary siblings in mixed pages',()=>{
 const mixed=structuredClone(doc);mixed.tables.bullets.push(B('ordinary','ml',2),B('day',null,9,{journalDate:'2026-11-06'}),B('daily-text','day',0));
 const catalog=noteCatalog(mixed);
 assert.deepEqual(catalog.roots('notes'),['ml','plain']);
 const visible=rootRows(catalog.idx,catalog.roots('notes'),true).filter(r=>!catalog.excluded.has(r.bullet.id));
 assert.deepEqual(visible.map(r=>r.bullet.id),['ml','ordinary','plain']);
 for(const id of ['q1','a1','mcq','o1','deck','q2','map','mapq','web-1','hl','book-1','day','daily-text'])assert.ok(catalog.excluded.has(id),id);
 assert.deepEqual(catalog.roots('notes','deck'),[]);
 assert.deepEqual(catalog.roots('calendar'),['day']);
});

test('All groups special content first, preserves ties and nested order, and never changes saved positions',()=>{
 const mixed=structuredClone(doc);mixed.tables.bullets.push(B('cal-root',null,20),B('year','cal-root',0),B('day','year',0,{journalDate:'2026-11-06'}));
 mixed.tables.bullets.find(n=>n.id==='plain').position=-1;
 const before=structuredClone(mixed);
 assert.deepEqual(orderedNoteRoots(mixed),['cal-root','ml','deck','map','web-1','book-1','plain']);
 assert.deepEqual(orderedNoteRoots(mixed,'ml'),['q1','mcq']);
 assert.deepEqual(filterRoots(mixed,'calendar'),['cal-root']);
 assert.deepEqual(mixed,before);
});

test('calendar hierarchy and a reused calendar root are excluded from ordinary Notes',()=>{
 const mixed={tables:{bullets:[B('custom',null,0,{text:'📅 Calendar'}),B('year','custom',0),B('day','year',0,{journalDate:'2026-11-06'}),B('entry','day',0),B('normal',null,1)]},web:{}};
 assert.deepEqual(filterRoots(mixed,'calendar'),['custom']);
 assert.deepEqual(filterRoots(mixed,'notes'),['normal']);
});
