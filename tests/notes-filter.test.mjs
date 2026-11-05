import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRoots, filterCounts, rootRows } from '../src/notes-filter.mjs';
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
  assert.deepEqual(filterCounts(doc), { flashcards: 3, mcqs: 1, mindmaps: 1, bookmarks: 1, docs: 1 });
});

test('rows show each matched bullet with its children', () => {
  const rows = rootRows(index(doc.tables.bullets), ['q1', 'web-1']);
  assert.deepEqual(rows.map(r => [r.bullet.id, r.depth]), [['q1', 0], ['a1', 1], ['web-1', 0], ['hl', 1]]);
});
