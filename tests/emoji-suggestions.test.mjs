import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emojiQuery, emojiSuggestions } from '../src/emoji-suggestions.mjs';
import { notoEmojis } from '../src/noto-emojis.mjs';

test('colon emoji queries respect caret offsets and avoid URLs, times, and completed tokens', () => {
  assert.deepEqual(emojiQuery(':', 1), { start: 0, end: 1, query: '' });
  assert.deepEqual(emojiQuery('Go 🚀 :rocket after', 13), { start: 6, end: 13, query: 'rocket' });
  assert.equal(emojiQuery('12:30', 5), null);
  assert.equal(emojiQuery('https:', 6), null);
  assert.equal(emojiQuery(':noto_1f680:', 12), null);
  assert.equal(emojiQuery('text:rocket', 11), null);
  assert.equal(emojiQuery(':rocket ship', 12), null);
  assert.deepEqual(emojiQuery('(:heart', 7), { start: 1, end: 7, query: 'heart' });
});

test('inline suggestions search all Noto labels and tags with bounded, exact-first results', () => {
  assert.equal(emojiSuggestions(notoEmojis, '').length, 8);
  assert.equal(emojiSuggestions(notoEmojis, 'rocket')[0].label, 'Rocket');
  assert.equal(emojiSuggestions(notoEmojis, 'head_nod')[0].label, 'Head nod');
  assert.equal(emojiSuggestions(notoEmojis, 'no-such-emoji-zxcv').length, 0);
  const custom = { token: ':custom:', label: 'My celebration' };
  assert.equal(emojiSuggestions([...notoEmojis, custom], 'My_celebration')[0], custom);
});
